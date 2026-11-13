-- Phase 4: shop POS, stock, suppliers and the customer list.
--
-- Shop sales live in their own tables (pos_sales, pos_sale_items,
-- pos_payments), the same way custom jersey orders do. The online order
-- tables and create_order_with_reservations() are not touched, so nothing
-- here can change online checkout. A shop sale takes stock from the same
-- product_stock row that checkout reserves from, and both land on the same
-- customer (by phone), which is what ties the shop and the site together.
--
-- Stock numbers: product_stock.quantity is what a location holds;
-- product_variants.stock is what the product editor and the site show.
-- stock_apply() below moves both together so they cannot drift.
--
-- All writes go through SECURITY DEFINER functions that only the service
-- role may call; the API routes check the staff permission first and pass
-- the acting user's id.
--
-- Needs 20261113100000_custom_jersey.sql first: customer_stats reads
-- custom_orders. product_stock, showrooms and inventory_movements were
-- created outside the migrations; only the columns the order function
-- already uses are assumed here.
--
-- Safe to re-run.

-- ----------------------------------------------------------------------
-- Permissions and settings
-- ----------------------------------------------------------------------
INSERT INTO public.permissions (code, area, description, display_order) VALUES
    ('pos.manage', 'Shop', 'Refund shop sales, give any discount, see every cashier''s day', 61)
ON CONFLICT (code) DO UPDATE
    SET area = EXCLUDED.area, description = EXCLUDED.description, display_order = EXCLUDED.display_order;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, 'pos.manage' FROM public.roles r WHERE r.code IN ('owner', 'manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.app_settings (key, value) VALUES
    ('pos_max_discount_percent', '10'),
    ('low_stock_threshold', '3')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------
-- Stock: movements carry who, why and the buying price
-- ----------------------------------------------------------------------
ALTER TABLE public.inventory_movements
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- inventory_movements was created outside the migrations. If it limits
-- `reason` to a fixed list, the new reasons (pos_sale, stock_in, ...) would
-- be rejected, so any such CHECK is dropped. Reasons are written only by the
-- functions in this file and by the order function.
DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.inventory_movements'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%reason%'
    LOOP
        EXECUTE format('ALTER TABLE public.inventory_movements DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS inventory_movements_variant_time_idx
    ON public.inventory_movements (variant_id, created_at DESC);

ALTER TABLE public.product_variants
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER;

CREATE TABLE IF NOT EXISTS public.suppliers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    lead_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Secondary stock: what a supplier has that we can bring in. Kept apart
-- from product_stock because the product editor writes the same quantity to
-- every active showroom, and a supplier must not be counted that way.
CREATE TABLE IF NOT EXISTS public.supplier_stock (
    variant_id TEXT NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit_cost NUMERIC(12, 2),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (variant_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS public.stock_receipts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
    showroom_id TEXT NOT NULL,
    reference TEXT,
    note TEXT,
    total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
    received_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_receipt_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    receipt_id TEXT NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2)
);

-- ----------------------------------------------------------------------
-- POS
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    showroom_id TEXT NOT NULL,
    opened_by UUID NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_float NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_by UUID,
    closed_at TIMESTAMPTZ,
    expected_cash NUMERIC(12, 2),
    counted_cash NUMERIC(12, 2),
    difference NUMERIC(12, 2),
    note TEXT
);
-- One open drawer per person.
CREATE UNIQUE INDEX IF NOT EXISTS pos_sessions_one_open
    ON public.pos_sessions (opened_by) WHERE status = 'open';

-- Cash put into or taken out of the drawer that is not a sale.
CREATE TABLE IF NOT EXISTS public.pos_cash_moves (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id TEXT NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
    reason TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.pos_receipt_seq START 1001;

CREATE TABLE IF NOT EXISTS public.pos_sales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    receipt_no TEXT NOT NULL UNIQUE DEFAULT ('R-' || nextval('public.pos_receipt_seq')::text),
    session_id TEXT REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
    showroom_id TEXT NOT NULL,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    -- Sum of the lines at the shelf price (after any running promotion).
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- Discount the cashier gave by hand (line discounts + bill discount).
    discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    coupon_id TEXT,
    coupon_code TEXT,
    coupon_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cash_tendered NUMERIC(12, 2) NOT NULL DEFAULT 0,
    change_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
    refunded_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'partially_refunded', 'refunded')),
    note TEXT,
    sold_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_sales_customer_idx ON public.pos_sales (customer_id);
CREATE INDEX IF NOT EXISTS pos_sales_created_idx ON public.pos_sales (created_at DESC);
CREATE INDEX IF NOT EXISTS pos_sales_session_idx ON public.pos_sales (session_id);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sale_id TEXT NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
    product_id TEXT,
    variant_id TEXT,
    title TEXT NOT NULL,
    variant_label TEXT,
    sku TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    base_price NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12, 2) NOT NULL,
    cost_price NUMERIC(12, 2),
    returned_quantity INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pos_sale_items_sale_idx ON public.pos_sale_items (sale_id);
CREATE INDEX IF NOT EXISTS pos_sale_items_product_idx ON public.pos_sale_items (product_id);

-- amount is always positive; `type` says which way the money went. A cash
-- charge is stored net of the change handed back.
CREATE TABLE IF NOT EXISTS public.pos_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sale_id TEXT NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'charge' CHECK (type IN ('charge', 'refund')),
    method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bkash', 'nagad', 'other')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reference TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_payments_sale_idx ON public.pos_payments (sale_id);
CREATE INDEX IF NOT EXISTS pos_payments_session_idx ON public.pos_payments (session_id);

CREATE TABLE IF NOT EXISTS public.pos_returns (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sale_id TEXT NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
    reason TEXT,
    refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    refund_method TEXT NOT NULL,
    restocked BOOLEAN NOT NULL DEFAULT true,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bills put aside while another customer is served.
CREATE TABLE IF NOT EXISTS public.pos_held_bills (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    label TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A coupon used in the shop is counted like one used online.
ALTER TABLE public.coupon_redemptions ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.coupon_redemptions
    ADD COLUMN IF NOT EXISTS pos_sale_id TEXT REFERENCES public.pos_sales(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------
-- Access: service role only (the API checks permissions).
-- ----------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'suppliers', 'supplier_stock', 'stock_receipts', 'stock_receipt_items',
        'pos_sessions', 'pos_cash_moves', 'pos_sales', 'pos_sale_items',
        'pos_payments', 'pos_returns', 'pos_held_bills'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.pos_receipt_seq FROM anon, authenticated;

-- ----------------------------------------------------------------------
-- stock_apply: the one place a location's quantity changes by hand.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_apply(
    p_variant_id TEXT,
    p_showroom_id TEXT,
    p_delta INTEGER,
    p_reason TEXT,
    p_reference TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_actor UUID DEFAULT NULL,
    p_unit_cost NUMERIC DEFAULT NULL,
    -- false for a transfer: the total the site shows does not change.
    p_touch_total BOOLEAN DEFAULT true
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quantity INTEGER;
    v_reserved INTEGER;
BEGIN
    IF p_delta = 0 THEN RETURN NULL; END IF;

    INSERT INTO public.product_stock (variant_id, showroom_id, quantity, reserved_quantity, updated_at)
    VALUES (p_variant_id, p_showroom_id, 0, 0, now())
    ON CONFLICT (variant_id, showroom_id) DO NOTHING;

    SELECT quantity, reserved_quantity INTO v_quantity, v_reserved
    FROM public.product_stock
    WHERE variant_id = p_variant_id AND showroom_id = p_showroom_id
    FOR UPDATE;

    -- Stock held for an online order cannot be sold or written off.
    IF v_quantity + p_delta < COALESCE(v_reserved, 0) THEN
        RAISE EXCEPTION 'insufficient_stock:%', p_variant_id USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.product_stock
    SET quantity = quantity + p_delta, updated_at = now()
    WHERE variant_id = p_variant_id AND showroom_id = p_showroom_id;

    IF p_touch_total THEN
        UPDATE public.product_variants
        SET stock = GREATEST(stock + p_delta, 0), updated_at = now()
        WHERE id = p_variant_id;
    END IF;

    INSERT INTO public.inventory_movements
        (variant_id, showroom_id, delta, reason, reference_id, note, unit_cost, created_by)
    VALUES
        (p_variant_id, p_showroom_id, p_delta, p_reason, p_reference, NULLIF(btrim(COALESCE(p_note, '')), ''), p_unit_cost, p_actor);

    RETURN v_quantity + p_delta;
END;
$$;

-- ----------------------------------------------------------------------
-- inventory_receive: goods arrive from a supplier.
--   { actor, supplier_id, showroom_id, reference, note,
--     items: [{ variant_id, quantity, unit_cost }] }
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_receive(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_showroom TEXT := p->>'showroom_id';
    v_supplier TEXT := NULLIF(p->>'supplier_id', '');
    v_id TEXT;
    v_item JSONB;
    v_qty INTEGER;
    v_cost NUMERIC;
    v_total NUMERIC := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.showrooms WHERE id = v_showroom) THEN
        RAISE EXCEPTION 'showroom_not_found' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(COALESCE(p->'items', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'no_items' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.stock_receipts (supplier_id, showroom_id, reference, note, received_by)
    VALUES (v_supplier, v_showroom, NULLIF(btrim(COALESCE(p->>'reference', '')), ''),
            NULLIF(btrim(COALESCE(p->>'note', '')), ''), v_actor)
    RETURNING id INTO v_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
        v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
        v_cost := NULLIF(v_item->>'unit_cost', '')::NUMERIC;
        IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;
        IF v_cost IS NOT NULL AND v_cost < 0 THEN RAISE EXCEPTION 'invalid_cost' USING ERRCODE = '22023'; END IF;

        INSERT INTO public.stock_receipt_items (receipt_id, variant_id, quantity, unit_cost)
        VALUES (v_id, v_item->>'variant_id', v_qty, v_cost);

        PERFORM public.stock_apply(v_item->>'variant_id', v_showroom, v_qty, 'stock_in', v_id, p->>'note', v_actor, v_cost);

        IF v_cost IS NOT NULL THEN
            UPDATE public.product_variants SET cost_price = v_cost WHERE id = v_item->>'variant_id';
            UPDATE public.products pr SET cost_price = v_cost
            FROM public.product_variants v
            WHERE v.id = v_item->>'variant_id' AND pr.id = v.product_id;
            v_total := v_total + v_cost * v_qty;
        END IF;

        -- What came in is no longer at the supplier.
        IF v_supplier IS NOT NULL THEN
            UPDATE public.supplier_stock
            SET quantity = GREATEST(quantity - v_qty, 0), updated_at = now()
            WHERE variant_id = v_item->>'variant_id' AND supplier_id = v_supplier;
        END IF;
    END LOOP;

    UPDATE public.stock_receipts SET total_cost = v_total WHERE id = v_id;
    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------
-- inventory_adjust: a count or a write-off, always with a reason.
--   { actor, showroom_id, reason, note,
--     items: [{ variant_id, counted }] or [{ variant_id, delta }] }
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_adjust(p JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_showroom TEXT := p->>'showroom_id';
    v_reason TEXT := COALESCE(NULLIF(p->>'reason', ''), 'count');
    v_item JSONB;
    v_delta INTEGER;
    v_current INTEGER;
    v_changed INTEGER := 0;
    v_ref TEXT := gen_random_uuid()::text;
BEGIN
    IF v_reason NOT IN ('count', 'damaged', 'lost', 'found', 'other') THEN
        RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.showrooms WHERE id = v_showroom) THEN
        RAISE EXCEPTION 'showroom_not_found' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::jsonb)) LOOP
        IF v_item ? 'counted' THEN
            SELECT COALESCE(max(quantity), 0) INTO v_current
            FROM public.product_stock
            WHERE variant_id = v_item->>'variant_id' AND showroom_id = v_showroom;
            IF (v_item->>'counted')::INTEGER < 0 THEN
                RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
            END IF;
            v_delta := (v_item->>'counted')::INTEGER - v_current;
        ELSE
            v_delta := COALESCE((v_item->>'delta')::INTEGER, 0);
        END IF;
        IF v_delta = 0 THEN CONTINUE; END IF;
        PERFORM public.stock_apply(v_item->>'variant_id', v_showroom, v_delta, 'adjust_' || v_reason, v_ref, p->>'note', v_actor);
        v_changed := v_changed + 1;
    END LOOP;
    RETURN v_changed;
END;
$$;

-- ----------------------------------------------------------------------
-- inventory_transfer: between two shops or stores.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_transfer(
    p_variant_id TEXT, p_from TEXT, p_to TEXT, p_quantity INTEGER, p_actor UUID, p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ref TEXT := gen_random_uuid()::text;
BEGIN
    IF p_quantity <= 0 OR p_from = p_to THEN
        RAISE EXCEPTION 'invalid_transfer' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.showrooms WHERE id IN (p_from, p_to)) <> 2 THEN
        RAISE EXCEPTION 'showroom_not_found' USING ERRCODE = '22023';
    END IF;
    PERFORM public.stock_apply(p_variant_id, p_from, -p_quantity, 'transfer_out', v_ref, p_note, p_actor, NULL, false);
    PERFORM public.stock_apply(p_variant_id, p_to, p_quantity, 'transfer_in', v_ref, p_note, p_actor, NULL, false);
END;
$$;

-- ----------------------------------------------------------------------
-- pos_create_sale
--   { actor, session_id, showroom_id, customer_phone, customer_name,
--     marketing_consent, note, coupon_code, bill_discount,
--     any_discount (true when the cashier may exceed the limit),
--     items:    [{ product_id, variant_id, quantity, discount }],
--     payments: [{ method, amount, reference }] }
--
-- Prices come from get_effective_prices(), the same source as checkout;
-- nothing the browser says about price is used. `discount` on a line is
-- the amount taken off that whole line by hand.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_create_sale(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_session public.pos_sessions%ROWTYPE;
    v_showroom TEXT;
    v_items JSONB := COALESCE(p->'items', '[]'::jsonb);
    v_payments JSONB := COALESCE(p->'payments', '[]'::jsonb);
    v_coupon_code TEXT := upper(btrim(COALESCE(p->>'coupon_code', '')));
    v_coupon_id TEXT;
    v_coupon_name TEXT;
    v_coupon_alloc JSONB := '[]'::jsonb;
    v_coupon_total NUMERIC := 0;
    v_reason TEXT;
    v_bill_discount NUMERIC := GREATEST(COALESCE((p->>'bill_discount')::NUMERIC, 0), 0);
    v_limit NUMERIC := public.setting_numeric('pos_max_discount_percent', 10);
    v_prices JSONB;
    v_row RECORD;
    v_price JSONB;
    v_product public.products%ROWTYPE;
    v_variant public.product_variants%ROWTYPE;
    v_label TEXT;
    v_qty INTEGER;
    v_unit NUMERIC;
    v_gross NUMERIC;
    v_share NUMERIC;
    v_disc NUMERIC;
    v_line NUMERIC;
    v_subtotal NUMERIC := 0;
    v_manual NUMERIC := 0;
    v_lines_total NUMERIC := 0;
    v_total NUMERIC;
    v_paid NUMERIC := 0;
    v_cash NUMERIC := 0;
    v_change NUMERIC := 0;
    v_pay JSONB;
    v_amount NUMERIC;
    v_method TEXT;
    v_sale_id TEXT := gen_random_uuid()::text;
    v_receipt TEXT;
    v_customer_id TEXT;
    v_phone TEXT := public.normalize_bd_phone(p->>'customer_phone');
    v_lines JSONB := '[]'::jsonb;
BEGIN
    IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'empty_sale' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_session FROM public.pos_sessions
    WHERE id = p->>'session_id' AND status = 'open';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023';
    END IF;
    v_showroom := v_session.showroom_id;

    IF NULLIF(btrim(COALESCE(p->>'customer_phone', '')), '') IS NOT NULL AND v_phone IS NULL THEN
        RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
    END IF;

    -- Coupon, judged exactly as at checkout.
    IF v_coupon_code <> '' THEN
        SELECT c.id, c.code INTO v_coupon_id, v_coupon_name
        FROM public.coupons c WHERE upper(c.code) = v_coupon_code FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'coupon_not_found' USING ERRCODE = '22023'; END IF;
        v_reason := public.coupon_ineligibility_reason(v_coupon_id);
        IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023'; END IF;
        v_coupon_alloc := COALESCE(public.coupon_allocations(v_coupon_id, v_items)->'allocations', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_object_agg(e.product_id, to_jsonb(e)), '{}'::jsonb) INTO v_prices
    FROM public.get_effective_prices(ARRAY(
        SELECT DISTINCT t.item->>'product_id' FROM jsonb_array_elements(v_items) AS t(item)
    )) e;

    -- Price every line.
    FOR v_row IN
        SELECT t.item AS item, t.ord AS ord
        FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(item, ord) ORDER BY t.ord
    LOOP
        v_qty := COALESCE((v_row.item->>'quantity')::INTEGER, 0);
        IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;

        v_price := v_prices -> (v_row.item->>'product_id');
        SELECT * INTO v_product FROM public.products WHERE id = v_row.item->>'product_id';
        IF v_price IS NULL OR NOT FOUND THEN
            RAISE EXCEPTION 'product_not_found:%', v_row.item->>'product_id' USING ERRCODE = '22023';
        END IF;

        v_label := NULL;
        v_variant := NULL;
        IF NULLIF(v_row.item->>'variant_id', '') IS NOT NULL THEN
            SELECT * INTO v_variant FROM public.product_variants
            WHERE id = v_row.item->>'variant_id' AND product_id = v_product.id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'variant_not_found:%', v_product.title USING ERRCODE = '22023';
            END IF;
            SELECT NULLIF(concat_ws(' / ',
                       (SELECT c.name FROM public.colors c WHERE c.id = v_variant.color_id),
                       (SELECT s.name FROM public.sizes s WHERE s.id = v_variant.size_id)), '')
            INTO v_label;
        ELSIF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = v_product.id) THEN
            RAISE EXCEPTION 'variant_required:%', v_product.title USING ERRCODE = '22023';
        END IF;

        v_unit  := (v_price->>'final_price')::NUMERIC;
        v_gross := ROUND(v_unit * v_qty, 2);
        v_share := LEAST(COALESCE((v_coupon_alloc -> (v_row.ord - 1)::INTEGER)::NUMERIC, 0), v_gross);
        v_disc  := LEAST(GREATEST(COALESCE((v_row.item->>'discount')::NUMERIC, 0), 0), v_gross - v_share);
        v_line  := v_gross - v_share - v_disc;

        v_subtotal     := v_subtotal + v_gross;
        v_coupon_total := v_coupon_total + v_share;
        v_manual       := v_manual + v_disc;
        v_lines_total  := v_lines_total + v_line;

        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'product_id', v_product.id,
            'variant_id', v_variant.id,
            'title', v_product.title,
            'label', v_label,
            'sku', COALESCE(v_variant.sku, v_variant.barcode),
            'quantity', v_qty,
            'base_price', (v_price->>'base_price')::NUMERIC,
            'unit_price', v_unit,
            'discount', v_share + v_disc,
            'line_total', v_line,
            'cost_price', COALESCE(v_variant.cost_price, v_product.cost_price)
        ));
    END LOOP;

    v_bill_discount := LEAST(v_bill_discount, v_lines_total);
    v_manual := v_manual + v_bill_discount;
    v_total := v_lines_total - v_bill_discount;

    IF COALESCE((p->>'any_discount')::BOOLEAN, false) IS NOT TRUE
       AND v_manual > ROUND(v_subtotal * v_limit / 100, 2) THEN
        RAISE EXCEPTION 'discount_over_limit:%', v_limit USING ERRCODE = '22023';
    END IF;

    -- Payments must cover the bill; only cash can be over, and the rest is change.
    FOR v_pay IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
        v_amount := COALESCE((v_pay->>'amount')::NUMERIC, 0);
        v_method := v_pay->>'method';
        IF v_amount <= 0 THEN CONTINUE; END IF;
        IF v_method NOT IN ('cash', 'card', 'bkash', 'nagad', 'other') THEN
            RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
        END IF;
        v_paid := v_paid + v_amount;
        IF v_method = 'cash' THEN v_cash := v_cash + v_amount; END IF;
    END LOOP;
    IF v_paid < v_total THEN
        RAISE EXCEPTION 'payment_short:%', v_total - v_paid USING ERRCODE = '22023';
    END IF;
    v_change := v_paid - v_total;
    IF v_change > v_cash THEN
        RAISE EXCEPTION 'overpaid_without_cash' USING ERRCODE = '22023';
    END IF;

    IF v_phone IS NOT NULL THEN
        v_customer_id := public.upsert_customer(v_phone, p->>'customer_name', NULL, NULL, 'shop');
        IF (p->>'marketing_consent')::BOOLEAN IS TRUE THEN
            UPDATE public.customers
            SET marketing_consent = true, marketing_consent_at = COALESCE(marketing_consent_at, now())
            WHERE id = v_customer_id AND NOT marketing_consent;
        END IF;
    END IF;

    INSERT INTO public.pos_sales (
        id, session_id, showroom_id, customer_id, customer_name, customer_phone,
        subtotal, discount_total, coupon_id, coupon_code, coupon_discount,
        total, cash_tendered, change_due, note, sold_by
    ) VALUES (
        v_sale_id, v_session.id, v_showroom, v_customer_id,
        NULLIF(btrim(COALESCE(p->>'customer_name', '')), ''), v_phone,
        v_subtotal, v_manual, v_coupon_id, v_coupon_name, v_coupon_total,
        v_total, v_cash, v_change, NULLIF(btrim(COALESCE(p->>'note', '')), ''), v_actor
    ) RETURNING receipt_no INTO v_receipt;

    -- Lines and stock.
    FOR v_row IN SELECT t.item AS item FROM jsonb_array_elements(v_lines) AS t(item) LOOP
        v_qty := (v_row.item->>'quantity')::INTEGER;

        INSERT INTO public.pos_sale_items (
            sale_id, product_id, variant_id, title, variant_label, sku, quantity,
            base_price, unit_price, discount, line_total, cost_price
        ) VALUES (
            v_sale_id, v_row.item->>'product_id', v_row.item->>'variant_id', v_row.item->>'title',
            v_row.item->>'label', v_row.item->>'sku', v_qty,
            (v_row.item->>'base_price')::NUMERIC, (v_row.item->>'unit_price')::NUMERIC,
            (v_row.item->>'discount')::NUMERIC, (v_row.item->>'line_total')::NUMERIC,
            (v_row.item->>'cost_price')::NUMERIC
        );

        IF v_row.item->>'variant_id' IS NOT NULL THEN
            BEGIN
                PERFORM public.stock_apply(v_row.item->>'variant_id', v_showroom, -v_qty, 'pos_sale', v_sale_id, v_receipt, v_actor);
            EXCEPTION WHEN SQLSTATE 'P0001' THEN
                RAISE EXCEPTION 'insufficient_stock:%', concat_ws(' ', v_row.item->>'title', v_row.item->>'label')
                    USING ERRCODE = 'P0001';
            END;
        ELSE
            -- A product with no options keeps its count on the product row.
            UPDATE public.products SET stock = stock - v_qty
            WHERE id = v_row.item->>'product_id' AND COALESCE(stock, 0) >= v_qty;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'insufficient_stock:%', v_row.item->>'title' USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END LOOP;

    -- Payments; change comes off the cash.
    FOR v_pay IN SELECT * FROM jsonb_array_elements(v_payments) LOOP
        v_amount := COALESCE((v_pay->>'amount')::NUMERIC, 0);
        v_method := v_pay->>'method';
        IF v_method = 'cash' AND v_change > 0 THEN
            v_share := LEAST(v_change, v_amount);
            v_amount := v_amount - v_share;
            v_change := v_change - v_share;
        END IF;
        IF v_amount <= 0 THEN CONTINUE; END IF;
        INSERT INTO public.pos_payments (sale_id, session_id, type, method, amount, reference, recorded_by)
        VALUES (v_sale_id, v_session.id, 'charge', v_method, v_amount,
                NULLIF(btrim(COALESCE(v_pay->>'reference', '')), ''), v_actor);
    END LOOP;

    IF v_coupon_id IS NOT NULL THEN
        INSERT INTO public.coupon_redemptions (coupon_id, pos_sale_id, amount)
        VALUES (v_coupon_id, v_sale_id, v_coupon_total);
    END IF;

    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'receipt_no', v_receipt,
        'total', v_total,
        'change_due', v_paid - v_total,
        'customer_id', v_customer_id
    );
END;
$$;

-- ----------------------------------------------------------------------
-- pos_return_sale: goods come back; money goes out.
--   { actor, sale_id, session_id, refund_method, reason, restock,
--     items: [{ sale_item_id, quantity }] }
-- The refund is each line's paid price, less its share of any bill discount.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_return_sale(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_sale public.pos_sales%ROWTYPE;
    v_item JSONB;
    v_line public.pos_sale_items%ROWTYPE;
    v_qty INTEGER;
    v_lines_total NUMERIC;
    v_factor NUMERIC;
    v_refund NUMERIC := 0;
    v_restock BOOLEAN := COALESCE((p->>'restock')::BOOLEAN, true);
    v_method TEXT := COALESCE(NULLIF(p->>'refund_method', ''), 'cash');
    v_session TEXT := NULLIF(p->>'session_id', '');
    v_return_id TEXT := gen_random_uuid()::text;
    v_done JSONB := '[]'::jsonb;
    v_left INTEGER;
BEGIN
    IF v_method NOT IN ('cash', 'card', 'bkash', 'nagad', 'other') THEN
        RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_sale FROM public.pos_sales WHERE id = p->>'sale_id' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sale_not_found' USING ERRCODE = '22023'; END IF;

    IF v_session IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.pos_sessions WHERE id = v_session AND status = 'open'
    ) THEN
        RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023';
    END IF;
    -- Cash leaves a drawer, so a cash refund needs an open one.
    IF v_method = 'cash' AND v_session IS NULL THEN
        RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(line_total), 0) INTO v_lines_total FROM public.pos_sale_items WHERE sale_id = v_sale.id;
    v_factor := CASE WHEN v_lines_total > 0 THEN v_sale.total / v_lines_total ELSE 0 END;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'items', '[]'::jsonb)) LOOP
        v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
        IF v_qty <= 0 THEN CONTINUE; END IF;

        SELECT * INTO v_line FROM public.pos_sale_items
        WHERE id = v_item->>'sale_item_id' AND sale_id = v_sale.id FOR UPDATE;
        IF NOT FOUND OR v_qty > v_line.quantity - v_line.returned_quantity THEN
            RAISE EXCEPTION 'invalid_return_quantity' USING ERRCODE = '22023';
        END IF;

        v_refund := v_refund + ROUND(v_line.line_total / v_line.quantity * v_qty * v_factor, 2);
        UPDATE public.pos_sale_items SET returned_quantity = returned_quantity + v_qty WHERE id = v_line.id;

        IF v_restock THEN
            IF v_line.variant_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_line.variant_id) THEN
                PERFORM public.stock_apply(v_line.variant_id, v_sale.showroom_id, v_qty, 'pos_return', v_return_id, v_sale.receipt_no, v_actor);
            ELSIF v_line.variant_id IS NULL THEN
                UPDATE public.products SET stock = COALESCE(stock, 0) + v_qty WHERE id = v_line.product_id;
            END IF;
        END IF;

        v_done := v_done || jsonb_build_array(jsonb_build_object(
            'sale_item_id', v_line.id, 'title', v_line.title, 'quantity', v_qty));
    END LOOP;

    IF jsonb_array_length(v_done) = 0 THEN
        RAISE EXCEPTION 'no_items' USING ERRCODE = '22023';
    END IF;

    v_refund := LEAST(v_refund, v_sale.total - v_sale.refunded_total);

    INSERT INTO public.pos_returns (id, sale_id, reason, refund_amount, refund_method, restocked, items, created_by)
    VALUES (v_return_id, v_sale.id, NULLIF(btrim(COALESCE(p->>'reason', '')), ''), v_refund, v_method, v_restock, v_done, v_actor);

    IF v_refund > 0 THEN
        INSERT INTO public.pos_payments (sale_id, session_id, type, method, amount, reference, recorded_by)
        VALUES (v_sale.id, v_session, 'refund', v_method, v_refund, v_return_id, v_actor);
    END IF;

    SELECT COALESCE(sum(quantity - returned_quantity), 0) INTO v_left
    FROM public.pos_sale_items WHERE sale_id = v_sale.id;

    UPDATE public.pos_sales
    SET refunded_total = refunded_total + v_refund,
        status = CASE WHEN v_left = 0 THEN 'refunded' ELSE 'partially_refunded' END
    WHERE id = v_sale.id;

    RETURN jsonb_build_object('return_id', v_return_id, 'refund_amount', v_refund);
END;
$$;

-- ----------------------------------------------------------------------
-- Cash drawer: what should be in it, and closing the day.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_session_summary(p_session_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'opening_float', s.opening_float,
        'sales_count', (SELECT count(*) FROM public.pos_sales x WHERE x.session_id = s.id),
        'sales_total', (SELECT COALESCE(sum(x.total), 0) FROM public.pos_sales x WHERE x.session_id = s.id),
        'refunds_total', (SELECT COALESCE(sum(y.amount), 0) FROM public.pos_payments y WHERE y.session_id = s.id AND y.type = 'refund'),
        'cash_moves', (SELECT COALESCE(sum(m.amount), 0) FROM public.pos_cash_moves m WHERE m.session_id = s.id),
        'by_method', (
            SELECT COALESCE(jsonb_object_agg(t.method, t.net), '{}'::jsonb)
            FROM (
                SELECT y.method, sum(CASE WHEN y.type = 'charge' THEN y.amount ELSE -y.amount END) AS net
                FROM public.pos_payments y WHERE y.session_id = s.id GROUP BY y.method
            ) t
        ),
        'expected_cash',
            s.opening_float
            + (SELECT COALESCE(sum(CASE WHEN y.type = 'charge' THEN y.amount ELSE -y.amount END), 0)
               FROM public.pos_payments y WHERE y.session_id = s.id AND y.method = 'cash')
            + (SELECT COALESCE(sum(m.amount), 0) FROM public.pos_cash_moves m WHERE m.session_id = s.id)
    )
    FROM public.pos_sessions s WHERE s.id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.pos_close_session(
    p_session_id TEXT, p_actor UUID, p_counted NUMERIC, p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_summary JSONB;
    v_expected NUMERIC;
BEGIN
    IF p_counted IS NULL OR p_counted < 0 THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.pos_sessions WHERE id = p_session_id AND status = 'open' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023'; END IF;

    v_summary := public.pos_session_summary(p_session_id);
    v_expected := (v_summary->>'expected_cash')::NUMERIC;

    UPDATE public.pos_sessions
    SET status = 'closed', closed_by = p_actor, closed_at = now(),
        expected_cash = v_expected, counted_cash = p_counted,
        difference = p_counted - v_expected,
        note = NULLIF(btrim(COALESCE(p_note, '')), '')
    WHERE id = p_session_id;

    RETURN v_summary || jsonb_build_object('counted_cash', p_counted, 'difference', p_counted - v_expected);
END;
$$;

-- ----------------------------------------------------------------------
-- Customers: one line of totals per customer, across site, shop and
-- custom jersey. Read by the customer list (service role).
-- ----------------------------------------------------------------------
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS marketing_opt_out BOOLEAN NOT NULL DEFAULT false;

DROP VIEW IF EXISTS public.customer_stats;
CREATE VIEW public.customer_stats AS
SELECT
    c.id AS customer_id,
    COALESCE(o.n, 0)      AS online_orders,
    COALESCE(o.spent, 0)  AS online_spent,
    COALESCE(s.n, 0)      AS shop_sales,
    COALESCE(s.spent, 0)  AS shop_spent,
    COALESCE(j.n, 0)      AS custom_orders,
    COALESCE(j.spent, 0)  AS custom_spent,
    COALESCE(o.spent, 0) + COALESCE(s.spent, 0) + COALESCE(j.spent, 0) AS total_spent,
    NULLIF(GREATEST(
        COALESCE(o.last_at, '-infinity'::timestamptz),
        COALESCE(s.last_at, '-infinity'::timestamptz),
        COALESCE(j.last_at, '-infinity'::timestamptz)
    ), '-infinity'::timestamptz) AS last_purchase_at
FROM public.customers c
LEFT JOIN (
    SELECT customer_id, count(*) AS n, sum(total_amount) AS spent, max(created_at) AS last_at
    FROM public.orders
    WHERE customer_id IS NOT NULL AND status NOT IN ('cancelled')
    GROUP BY customer_id
) o ON o.customer_id = c.id
LEFT JOIN (
    SELECT customer_id, count(*) AS n, sum(total - refunded_total) AS spent, max(created_at) AS last_at
    FROM public.pos_sales
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
) s ON s.customer_id = c.id
LEFT JOIN (
    SELECT co.customer_id, count(DISTINCT co.id) AS n,
           COALESCE(sum(cp.amount) FILTER (WHERE cp.status = 'successful'), 0) AS spent,
           max(co.created_at) AS last_at
    FROM public.custom_orders co
    LEFT JOIN public.custom_order_payments cp ON cp.custom_order_id = co.id
    WHERE co.customer_id IS NOT NULL AND co.status NOT IN ('rejected', 'cancelled')
    GROUP BY co.customer_id
) j ON j.customer_id = c.id;

REVOKE ALL ON public.customer_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_stats TO service_role;

-- ----------------------------------------------------------------------
-- Only the server may call these.
-- ----------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.stock_apply(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_receive(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_adjust(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_transfer(TEXT, TEXT, TEXT, INTEGER, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_create_sale(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_return_sale(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_session_summary(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_close_session(TEXT, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_apply(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, NUMERIC, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_receive(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_adjust(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.inventory_transfer(TEXT, TEXT, TEXT, INTEGER, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_create_sale(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_return_sale(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_session_summary(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_close_session(TEXT, UUID, NUMERIC, TEXT) TO service_role;
