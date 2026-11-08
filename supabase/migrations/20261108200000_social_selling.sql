-- Phase 1: selling from social media.
--
--   * delivery charges and the free-delivery line become admin settings
--     (the order RPC used to hard-code 60 / 120 / 1500)
--   * structured address (division, district, thana) on orders
--   * payment plan: full now, COD with the delivery charge paid first, or COD
--   * risk score and confirmation state on every order
--   * courier booking and status, and COD reconciliation
--   * where the order came from (UTM, fbclid, landing page)
--   * leads: checkouts that stopped after the phone number was typed

-- ------------------------------------------------------------------
-- Lock app_settings
--
-- It had row level security off and full grants to anon, so anyone with
-- the public key could change it. Harmless while it only held the media
-- URL prefix; not once it holds delivery charges and risk thresholds.
-- Everyone may read it; only staff with settings.manage may write.
-- ------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.app_settings FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.app_settings FROM authenticated;
DROP POLICY IF EXISTS "Anyone reads settings" ON public.app_settings;
CREATE POLICY "Anyone reads settings" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff write settings" ON public.app_settings;
CREATE POLICY "Staff write settings" ON public.app_settings
    FOR ALL TO authenticated
    USING (public.has_permission('settings.manage'))
    WITH CHECK (public.has_permission('settings.manage'));

-- ------------------------------------------------------------------
-- Settings
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.setting_numeric(p_key TEXT, p_default NUMERIC)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT CASE WHEN value ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN value::NUMERIC END
           FROM public.app_settings WHERE key = p_key),
        p_default
    );
$$;

INSERT INTO public.app_settings (key, value) VALUES
    ('delivery_fee_dhaka',    '60'),
    ('delivery_fee_outside',  '120'),
    ('free_delivery_over',    '1500'),
    -- Advance asked for when the delivery charge is 0 (free delivery) but the
    -- order still needs something paid first.
    ('cod_min_advance',       '120'),
    -- Risk score bands (0-100). At or below low_max: confirmed by itself.
    -- At or above high_min: COD only with an advance.
    ('risk_low_max',          '30'),
    ('risk_high_min',         '70'),
    -- A new customer's COD order above this needs an advance.
    ('cod_high_value',        '5000'),
    ('courier_dhaka',         'pathao'),
    ('courier_outside',       'steadfast'),
    -- JSON array of thana names that count as inside Dhaka; empty means the
    -- built-in Dhaka city list.
    ('dhaka_inside_thanas',   '')
ON CONFLICT (key) DO NOTHING;

-- What the checkout page needs, readable by anyone.
CREATE OR REPLACE FUNCTION public.checkout_settings()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'delivery_fee_dhaka',   public.setting_numeric('delivery_fee_dhaka', 60),
        'delivery_fee_outside', public.setting_numeric('delivery_fee_outside', 120),
        'free_delivery_over',   public.setting_numeric('free_delivery_over', 1500),
        'cod_min_advance',      public.setting_numeric('cod_min_advance', 120),
        'dhaka_inside_thanas',  (SELECT NULLIF(value, '') FROM public.app_settings WHERE key = 'dhaka_inside_thanas')
    );
$$;
GRANT EXECUTE ON FUNCTION public.checkout_settings() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.setting_numeric(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- Orders
-- ------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS division            TEXT,
    ADD COLUMN IF NOT EXISTS district            TEXT,
    ADD COLUMN IF NOT EXISTS thana               TEXT,
    ADD COLUMN IF NOT EXISTS address_line        TEXT,
    ADD COLUMN IF NOT EXISTS payment_plan        TEXT NOT NULL DEFAULT 'cod'
        CHECK (payment_plan IN ('full', 'cod_advance', 'cod')),
    ADD COLUMN IF NOT EXISTS advance_amount      NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS risk_score          INTEGER,
    ADD COLUMN IF NOT EXISTS risk_level          TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
    ADD COLUMN IF NOT EXISTS risk_reasons        JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed'
        CHECK (confirmation_status IN ('unconfirmed', 'needs_call', 'awaiting_payment', 'confirmed', 'rejected')),
    ADD COLUMN IF NOT EXISTS confirmed_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_by        UUID,
    ADD COLUMN IF NOT EXISTS confirmed_via       TEXT,
    ADD COLUMN IF NOT EXISTS signed_in           BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS client_ip_hash      TEXT,
    ADD COLUMN IF NOT EXISTS device_id           TEXT,
    ADD COLUMN IF NOT EXISTS utm_source          TEXT,
    ADD COLUMN IF NOT EXISTS utm_medium          TEXT,
    ADD COLUMN IF NOT EXISTS utm_campaign        TEXT,
    ADD COLUMN IF NOT EXISTS utm_content         TEXT,
    ADD COLUMN IF NOT EXISTS utm_term            TEXT,
    ADD COLUMN IF NOT EXISTS fbclid              TEXT,
    ADD COLUMN IF NOT EXISTS landing_page        TEXT,
    ADD COLUMN IF NOT EXISTS referrer            TEXT,
    ADD COLUMN IF NOT EXISTS courier             TEXT CHECK (courier IN ('steadfast', 'pathao', 'redx', 'manual')),
    ADD COLUMN IF NOT EXISTS courier_consignment_id TEXT,
    ADD COLUMN IF NOT EXISTS courier_tracking_code  TEXT,
    ADD COLUMN IF NOT EXISTS courier_status      TEXT,
    ADD COLUMN IF NOT EXISTS courier_booked_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS courier_fee         NUMERIC,
    ADD COLUMN IF NOT EXISTS shipped_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cod_expected        NUMERIC,
    ADD COLUMN IF NOT EXISTS cod_collected       NUMERIC,
    ADD COLUMN IF NOT EXISTS cod_settled_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cod_settled_amount  NUMERIC;

-- Existing orders were taken before confirmation existed; treat them as confirmed.
UPDATE public.orders SET confirmation_status = 'confirmed'
 WHERE confirmation_status = 'unconfirmed' AND status <> 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS orders_courier_consignment_uidx
    ON public.orders (courier, courier_consignment_id) WHERE courier_consignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_confirmation_idx ON public.orders (confirmation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_created_idx ON public.orders (customer_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_ip_created_idx ON public.orders (client_ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_device_created_idx ON public.orders (device_id, created_at DESC);

-- ------------------------------------------------------------------
-- Courier events (webhooks and status checks), stored once each
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courier_events (
    id            BIGSERIAL PRIMARY KEY,
    courier       TEXT NOT NULL,
    order_id      TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    consignment_id TEXT,
    status        TEXT,
    payload       JSONB NOT NULL DEFAULT '{}'::JSONB,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courier_events_order_idx ON public.courier_events (order_id, received_at DESC);
ALTER TABLE public.courier_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read courier events" ON public.courier_events;
CREATE POLICY "Staff read courier events" ON public.courier_events
    FOR SELECT USING (public.has_permission('orders.view'));

-- ------------------------------------------------------------------
-- Leads: a checkout that got as far as a phone number
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_leads (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     TEXT NOT NULL UNIQUE,
    phone          TEXT NOT NULL,
    name           TEXT,
    email          TEXT,
    address        JSONB NOT NULL DEFAULT '{}'::JSONB,
    items          JSONB NOT NULL DEFAULT '[]'::JSONB,
    subtotal       NUMERIC,
    attribution    JSONB NOT NULL DEFAULT '{}'::JSONB,
    customer_id    TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    order_id       TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'no_answer', 'call_later', 'sold', 'not_interested')),
    next_call_at   TIMESTAMPTZ,
    notes          TEXT,
    handled_by     UUID,
    call_count     INTEGER NOT NULL DEFAULT 0,
    last_called_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkout_leads_open_idx ON public.checkout_leads (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS checkout_leads_phone_idx ON public.checkout_leads (phone);

ALTER TABLE public.checkout_leads ENABLE ROW LEVEL SECURITY;
-- Written by the server with the service key; staff read and work them.
DROP POLICY IF EXISTS "Staff read leads" ON public.checkout_leads;
CREATE POLICY "Staff read leads" ON public.checkout_leads
    FOR SELECT USING (public.has_permission('leads.manage'));
DROP POLICY IF EXISTS "Staff update leads" ON public.checkout_leads;
CREATE POLICY "Staff update leads" ON public.checkout_leads
    FOR UPDATE USING (public.has_permission('leads.manage'))
    WITH CHECK (public.has_permission('leads.manage'));

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_checkout_leads') THEN
        CREATE TRIGGER audit_checkout_leads AFTER INSERT OR UPDATE OR DELETE ON public.checkout_leads
            FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('updated_at', 'items', 'attribution');
    END IF;
END $$;

-- ------------------------------------------------------------------
-- Staff confirm or reject an order (call or WhatsApp)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_order_confirmation(
    p_order_id TEXT, p_decision TEXT, p_via TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    IF NOT public.has_permission('orders.manage') THEN
        RAISE EXCEPTION 'forbidden';
    END IF;
    IF p_decision NOT IN ('confirmed', 'rejected', 'needs_call') THEN
        RAISE EXCEPTION 'invalid_decision';
    END IF;
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

    UPDATE public.orders SET
        confirmation_status = p_decision,
        confirmed_at = CASE WHEN p_decision = 'confirmed' THEN now() ELSE confirmed_at END,
        confirmed_by = CASE WHEN p_decision = 'confirmed' THEN auth.uid() ELSE confirmed_by END,
        confirmed_via = CASE WHEN p_decision = 'confirmed' THEN COALESCE(p_via, 'call') ELSE confirmed_via END,
        status = CASE WHEN p_decision = 'confirmed' AND status = 'pending' THEN 'processing' ELSE status END
    WHERE id = p_order_id;

    RETURN jsonb_build_object('order_id', p_order_id, 'confirmation_status', p_decision);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_order_confirmation(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_order_confirmation(TEXT, TEXT, TEXT) TO authenticated;

-- A paid advance or a paid order confirms it.
CREATE OR REPLACE FUNCTION public.orders_confirm_on_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'processing' AND OLD.status = 'pending'
       AND NEW.confirmation_status IN ('unconfirmed', 'awaiting_payment', 'needs_call') THEN
        NEW.confirmation_status := 'confirmed';
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
        NEW.confirmed_via := COALESCE(NEW.confirmed_via, 'payment');
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_confirm_on_processing ON public.orders;
CREATE TRIGGER orders_confirm_on_processing BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_confirm_on_processing();

-- ------------------------------------------------------------------
-- Order RPC: delivery charges from settings instead of constants
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_with_reservations(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order_id      TEXT := COALESCE(
        NULLIF(payload->>'order_id', ''),
        'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    );
    -- (a) Not seeded from the payload. The delivery charge is derived in
    -- this function from the subtotal it has just computed, so a client
    -- cannot set the fee on its own order.
    v_shipping      NUMERIC;
    v_city          TEXT := COALESCE(payload->>'city', '');
    v_notes         TEXT := NULLIF(LEFT(TRIM(COALESCE(payload->>'notes', '')), 500), '');
    v_items         JSONB := COALESCE(payload->'items', '[]'::JSONB);
    v_coupon_code   TEXT := upper(btrim(COALESCE(payload->>'coupon_code', '')));
    v_coupon_id     TEXT;
    v_coupon_name   TEXT;
    v_coupon_result JSONB;
    v_coupon_alloc  JSONB;
    v_coupon_amount NUMERIC := 0;
    v_reason        TEXT;

    v_prices        JSONB;
    v_price         JSONB;
    v_lines         JSONB := '[]'::JSONB;
    v_line          JSONB;
    v_item          JSONB;
    v_row           RECORD;
    v_quantity      INTEGER;
    v_promo_final   NUMERIC;
    v_base_price    NUMERIC;
    v_coupon_share  NUMERIC;
    v_line_final    NUMERIC;
    v_unit_price    NUMERIC;

    v_subtotal          NUMERIC := 0;
    v_discount_total    NUMERIC := 0;
    v_coupon_discount   NUMERIC := 0;

    v_stock         public.product_stock%ROWTYPE;
    v_item_id       TEXT;
    v_reservation_id TEXT;
    v_coupon_per_line NUMERIC;

    -- Delivery rules. Kept in one place on purpose: the checkout page and
    -- this function have to quote the same numbers, or the customer is
    -- shown one total and charged another.
    c_free_over     NUMERIC := public.setting_numeric('free_delivery_over', 1500);
    c_dhaka_fee     NUMERIC := public.setting_numeric('delivery_fee_dhaka', 60);
    c_outside_fee   NUMERIC := public.setting_numeric('delivery_fee_outside', 120);
BEGIN
    IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'empty_order' USING ERRCODE = '22023';
    END IF;

    -- ------------------------------------------------------------
    -- Coupon: lock, re-validate, price. Never trusted from the client.
    -- ------------------------------------------------------------
    IF v_coupon_code <> '' THEN
        SELECT c.id, c.code INTO v_coupon_id, v_coupon_name
        FROM public.coupons c
        WHERE upper(c.code) = v_coupon_code
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'coupon_not_found' USING ERRCODE = '22023';
        END IF;

        v_reason := public.coupon_ineligibility_reason(v_coupon_id);
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
        END IF;

        v_coupon_result := public.coupon_allocations(v_coupon_id, v_items);
        -- Unwrap the array explicitly. `result -> 0` would look up a
        -- KEY named "0" on the object and silently return NULL, which
        -- COALESCE would then quietly turn into a zero discount.
        v_coupon_alloc  := COALESCE(v_coupon_result->'allocations', '[]'::JSONB);
        v_coupon_amount := COALESCE((v_coupon_result->>'discount_amount')::NUMERIC, 0);
    END IF;

    -- ------------------------------------------------------------
    -- Server-authoritative prices for every product in the cart
    -- ------------------------------------------------------------
    SELECT COALESCE(jsonb_object_agg(e.product_id, to_jsonb(e)), '{}'::JSONB)
    INTO v_prices
    FROM public.get_effective_prices(ARRAY(
        SELECT DISTINCT t.item->>'product_id'
        FROM jsonb_array_elements(v_items) AS t(item)
        WHERE NULLIF(t.item->>'product_id', '') IS NOT NULL
    )) e;

    -- ------------------------------------------------------------
    -- Resolve each line once: post-promotion price, then the coupon
    -- share, then the final unit price actually charged.
    -- ------------------------------------------------------------
    FOR v_row IN
        SELECT t.item AS item, t.ord AS ord
        FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(item, ord)
        ORDER BY t.ord
    LOOP
        v_item     := v_row.item;
        v_quantity := COALESCE((v_row.item->>'quantity')::INTEGER, 0);
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
        END IF;

        v_price := v_prices -> (v_row.item->>'product_id');
        IF v_price IS NULL THEN
            RAISE EXCEPTION 'product_not_found:%', v_row.item->>'product_id'
                USING ERRCODE = '22023';
        END IF;

        v_promo_final := (v_price->>'final_price')::NUMERIC;
        v_base_price  := (v_price->>'base_price')::NUMERIC;

        -- Positional lookup: coupon_allocations() is index-aligned
        -- with v_items, and v_item.ord is that same 1-based position.
        v_coupon_share := COALESCE(
            (v_coupon_alloc -> (v_row.ord - 1)::INTEGER)::NUMERIC, 0
        );

        v_line_final := ROUND((v_promo_final * v_quantity) - v_coupon_share, 2);
        IF v_line_final < 0 THEN
            -- Cannot go negative even if a discount were misconfigured.
            v_line_final    := 0;
            v_coupon_share  := ROUND(v_promo_final * v_quantity, 2);
        END IF;

        v_unit_price := ROUND(v_line_final / v_quantity, 2);

        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'item',          v_row.item,
            'quantity',      v_quantity,
            'promo_final',   v_promo_final,
            'base_price',    v_base_price,
            'unit_price',    v_unit_price,
            -- Recomputed from the stored unit_price, not from the
            -- allocation, so the per-line coupon figure is the truth.
            'coupon_amount', GREATEST(
                ROUND(v_promo_final * v_quantity, 2)
                - ROUND(v_unit_price * v_quantity, 2), 0),
            'discount_type',    v_price->>'discount_type',
            'discount_value',   v_price->>'discount_value',
            'promotion_id',     NULLIF(v_price->>'promotion_id', ''),
            'promotion_name',   v_price->>'promotion_name'
        ));
    END LOOP;

    -- ------------------------------------------------------------
    -- Totals, derived from the unit_price we just committed to
    -- ------------------------------------------------------------
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
        v_quantity       := (v_line->>'quantity')::INTEGER;
        v_base_price     := (v_line->>'base_price')::NUMERIC;
        v_unit_price     := (v_line->>'unit_price')::NUMERIC;
        v_coupon_per_line:= (v_line->>'coupon_amount')::NUMERIC;

        v_subtotal        := v_subtotal + ROUND(v_unit_price * v_quantity, 2);
        v_discount_total  := v_discount_total
                             + (ROUND(v_base_price * v_quantity, 2)
                                - ROUND(v_unit_price * v_quantity, 2));
        v_coupon_discount := v_coupon_discount + v_coupon_per_line;
    END LOOP;

    v_subtotal        := ROUND(v_subtotal, 2);
    v_discount_total  := ROUND(v_discount_total, 2);
    v_coupon_discount := ROUND(v_coupon_discount, 2);

    -- ------------------------------------------------------------
    -- (c) Delivery charge, derived from the authoritative subtotal.
    --
    -- The client's figure is ignored. Anything outside Dhaka pays the
    -- outside rate, an empty or unrecognised city is treated as inside
    -- Dhaka (the cheaper of the two, so a missing value can never
    -- overcharge), and the order is free at or over the threshold.
    --
    -- The city arrives as the human label ("Outside Dhaka") because the
    -- route maps the form's code before calling this function, so the
    -- match is on either spelling -- comparing against the bare code
    -- would silently charge every order the Dhaka rate.
    -- ------------------------------------------------------------
    IF v_subtotal >= c_free_over OR v_subtotal <= 0 THEN
        v_shipping := 0;
    ELSIF v_city ILIKE 'outside%' THEN
        v_shipping := c_outside_fee;
    ELSE
        v_shipping := c_dhaka_fee;
    END IF;

    -- ------------------------------------------------------------
    -- Order row
    -- ------------------------------------------------------------
    INSERT INTO public.orders (
        id, user_id, customer_name, customer_phone, customer_email,
        delivery_address, city, subtotal, discount_total, shipping_fee,
        total_amount, payment_method, status, notes,
        coupon_id, coupon_code, coupon_discount_total
    ) VALUES (
        v_order_id,
        auth.uid(),
        payload->>'customer_name',
        payload->>'customer_phone',
        NULLIF(payload->>'customer_email', ''),
        payload->>'delivery_address',
        payload->>'city',
        v_subtotal,
        v_discount_total,
        v_shipping,
        v_subtotal + v_shipping,
        COALESCE(NULLIF(payload->>'payment_method', ''), 'cod'),
        'pending',
        v_notes,
        v_coupon_id,
        v_coupon_name,
        v_coupon_discount
    );

    -- ------------------------------------------------------------
    -- Reserve stock and write lines, reading the already-resolved
    -- values so the rows cannot disagree with the totals above.
    -- ------------------------------------------------------------
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
        v_item     := v_line->'item';
        v_quantity := (v_line->>'quantity')::INTEGER;

        SELECT st.* INTO v_stock
        FROM public.product_stock st
        JOIN public.showrooms s ON s.id = st.showroom_id
        WHERE st.variant_id = v_item->>'variant_id'
          AND s.is_active
          AND st.quantity - st.reserved_quantity >= v_quantity
        ORDER BY s.fulfillment_priority ASC, st.showroom_id
        LIMIT 1
        FOR UPDATE OF st;

        IF NOT FOUND THEN
            -- Two very different failures used to share one message. A
            -- variant with no allocation at all is a configuration fault --
            -- no showroom, or a stock row that was never written -- and
            -- reporting it to a customer as "sold out" both lost the sale
            -- and hid the fault from the store owner. The allocation is
            -- distinguished from a genuinely exhausted one by dropping the
            -- quantity predicate from the same lookup.
            IF NOT EXISTS (
                SELECT 1
                FROM public.product_stock st2
                JOIN public.showrooms s2 ON s2.id = st2.showroom_id
                WHERE st2.variant_id = v_item->>'variant_id'
                  AND s2.is_active
            ) THEN
                RAISE EXCEPTION 'variant_unallocated:%', v_item->>'variant_id'
                    USING ERRCODE = 'P0001';
            END IF;

            RAISE EXCEPTION 'insufficient_stock:%', v_item->>'variant_id'
                USING ERRCODE = 'P0001';
        END IF;

        UPDATE public.product_stock
        SET reserved_quantity = reserved_quantity + v_quantity, updated_at = now()
        WHERE variant_id = v_stock.variant_id AND showroom_id = v_stock.showroom_id;

        INSERT INTO public.order_items (
            order_id, product_id, title, size, color, quantity,
            unit_price, base_price, image, variant_id, showroom_id,
            applied_discount_type, applied_discount_value,
            promotion_id, promotion_name,
            coupon_id, coupon_code, coupon_discount_total
        ) VALUES (
            v_order_id,
            v_item->>'product_id',
            v_item->>'title',
            COALESCE(v_item->>'size', ''),
            COALESCE(v_item->>'color', ''),
            v_quantity,
            (v_line->>'unit_price')::NUMERIC,
            (v_line->>'base_price')::NUMERIC,
            NULLIF(v_item->>'image', ''),
            v_item->>'variant_id',
            v_stock.showroom_id,
            (v_line->>'discount_type')::TEXT,
            (v_line->>'discount_value')::NUMERIC,
            v_line->>'promotion_id',
            v_line->>'promotion_name',
            v_coupon_id,
            v_coupon_name,
            (v_line->>'coupon_amount')::NUMERIC
        ) RETURNING id INTO v_item_id;

        INSERT INTO public.stock_reservations (variant_id, showroom_id, order_item_id, quantity, status, expires_at)
        VALUES (v_stock.variant_id, v_stock.showroom_id, v_item_id, v_quantity, 'reserved', now() + interval '30 minutes')
        RETURNING id INTO v_reservation_id;

        INSERT INTO public.inventory_movements (variant_id, showroom_id, delta, reason, reference_id)
        VALUES (v_stock.variant_id, v_stock.showroom_id, 0, 'reservation', v_reservation_id);
    END LOOP;

    -- ------------------------------------------------------------
    -- Redemption, inside the same transaction. If any statement above
    -- raised, this row is rolled back with the order, so a failed
    -- checkout can never burn a use.
    -- ------------------------------------------------------------
    IF v_coupon_id IS NOT NULL THEN
        INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, amount)
        VALUES (v_coupon_id, auth.uid(), v_order_id, v_coupon_discount)
        ON CONFLICT (coupon_id, order_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'status', 'reserved',
        'subtotal', v_subtotal,
        'discount_total', v_discount_total,
        'coupon_discount_total', v_coupon_discount,
        'coupon_code', v_coupon_name,
        'shipping_fee', v_shipping,
        'total_amount', v_subtotal + v_shipping
    );
END;
$function$;
