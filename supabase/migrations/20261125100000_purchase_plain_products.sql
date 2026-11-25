-- Buy products that have no size/colour from a supplier.
-- Such a product has no product_variants row; its count is products.stock
-- (as in pos_create_sale). Purchase lines name it 'product:<product id>'.
-- Needs 20261117130000 first. Safe to run again.

ALTER TABLE public.stock_receipt_items ALTER COLUMN variant_id DROP NOT NULL;
ALTER TABLE public.stock_receipt_items
    ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.stock_receipt_items DROP CONSTRAINT IF EXISTS stock_receipt_items_one_item;
ALTER TABLE public.stock_receipt_items
    ADD CONSTRAINT stock_receipt_items_one_item CHECK (num_nonnulls(variant_id, product_id) = 1);
CREATE INDEX IF NOT EXISTS stock_receipt_items_product_idx
    ON public.stock_receipt_items (product_id) WHERE product_id IS NOT NULL;

-- Stock of a product without options. Never below zero.
CREATE OR REPLACE FUNCTION public.plain_stock_apply(p_product_id TEXT, p_delta INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_title TEXT;
    v_stock INTEGER;
BEGIN
    SELECT title, COALESCE(stock, 0) INTO v_title, v_stock
    FROM public.products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found:%', p_product_id USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = p_product_id) THEN
        RAISE EXCEPTION 'variant_required:%', v_title USING ERRCODE = '22023';
    END IF;
    IF v_stock + p_delta < 0 THEN
        RAISE EXCEPTION 'insufficient_stock:%', v_title USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.products SET stock = v_stock + p_delta WHERE id = p_product_id;
END;
$$;

-- As in 20261114100000, plus 'product:<id>' lines.
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
    v_product TEXT;
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

        -- A product without options: 'product:<id>', counted on the product row.
        IF v_item->>'variant_id' LIKE 'product:%' THEN
            v_product := substr(v_item->>'variant_id', 9);
            INSERT INTO public.stock_receipt_items (receipt_id, product_id, quantity, unit_cost)
            SELECT v_id, pr.id, v_qty, v_cost FROM public.products pr WHERE pr.id = v_product;
            PERFORM public.plain_stock_apply(v_product, v_qty);
            IF v_cost IS NOT NULL THEN
                UPDATE public.products SET cost_price = v_cost WHERE id = v_product;
                v_total := v_total + v_cost * v_qty;
            END IF;
            CONTINUE;
        END IF;

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

-- As in 20261117130000, plus 'product:<id>' lines.
CREATE OR REPLACE FUNCTION public.stock_receipt_snapshot(p_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'reference', r.reference,
        'invoice_date', r.invoice_date,
        'note', r.note,
        'subtotal', r.total_cost,
        'discount', r.discount,
        'extra_cost', r.extra_cost,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('variant_id', COALESCE(i.variant_id, 'product:' || i.product_id), 'quantity', i.quantity, 'unit_cost', i.unit_cost) ORDER BY COALESCE(i.variant_id, 'product:' || i.product_id))
            FROM public.stock_receipt_items i WHERE i.receipt_id = r.id
        ), '[]'::jsonb)
    )
    FROM public.stock_receipts r WHERE r.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.supplier_purchase_edit(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_id TEXT := p->>'receipt_id';
    v_reason TEXT := btrim(COALESCE(p->>'reason', ''));
    v_discount NUMERIC := COALESCE(NULLIF(p->>'discount', '')::NUMERIC, 0);
    v_extra NUMERIC := COALESCE(NULLIF(p->>'extra_cost', '')::NUMERIC, 0);
    r public.stock_receipts%ROWTYPE;
    v_before JSONB;
    v_line RECORD;
    v_total NUMERIC;
    v_product TEXT; -- set when the line is a product without options
BEGIN
    IF v_reason = '' THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO r FROM public.stock_receipts WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'purchase_not_found' USING ERRCODE = '22023'; END IF;
    IF v_discount < 0 OR v_extra < 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;

    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    PERFORM set_config('app.audit_reason', left(v_reason, 500), true);
    v_before := public.stock_receipt_snapshot(v_id);

    CREATE TEMP TABLE IF NOT EXISTS _purchase_edit (variant_id TEXT PRIMARY KEY, quantity INTEGER, unit_cost NUMERIC) ON COMMIT DROP;
    TRUNCATE _purchase_edit;
    INSERT INTO _purchase_edit (variant_id, quantity, unit_cost)
    SELECT x.variant_id, sum(COALESCE(x.quantity, 0)), max(x.unit_cost)
    FROM jsonb_to_recordset(COALESCE(p->'items', '[]'::jsonb)) AS x(variant_id TEXT, quantity INTEGER, unit_cost NUMERIC)
    WHERE x.variant_id IS NOT NULL
    GROUP BY x.variant_id;

    IF EXISTS (SELECT 1 FROM _purchase_edit WHERE quantity < 0) THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM _purchase_edit WHERE unit_cost < 0) THEN RAISE EXCEPTION 'invalid_cost' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM _purchase_edit WHERE quantity > 0) THEN RAISE EXCEPTION 'no_items' USING ERRCODE = '22023'; END IF;

    FOR v_line IN
        SELECT COALESCE(n.variant_id, o.variant_id) AS variant_id,
               COALESCE(o.qty, 0) AS old_qty, COALESCE(o.n_rows, 0) AS old_rows, o.cost AS old_cost,
               COALESCE(n.quantity, 0) AS new_qty, n.unit_cost AS new_cost
        FROM (
            SELECT COALESCE(i.variant_id, 'product:' || i.product_id) AS variant_id, sum(i.quantity)::INTEGER AS qty, count(*) AS n_rows, max(i.unit_cost) AS cost
            FROM public.stock_receipt_items i WHERE i.receipt_id = v_id GROUP BY 1
        ) o
        FULL JOIN _purchase_edit n ON n.variant_id = o.variant_id
    LOOP
        v_product := CASE WHEN v_line.variant_id LIKE 'product:%' THEN substr(v_line.variant_id, 9) END;

        IF v_line.new_qty <> v_line.old_qty AND v_product IS NOT NULL THEN
            PERFORM public.plain_stock_apply(v_product, v_line.new_qty - v_line.old_qty);
        ELSIF v_line.new_qty <> v_line.old_qty THEN
            PERFORM public.stock_apply(v_line.variant_id, r.showroom_id, v_line.new_qty - v_line.old_qty,
                                       'stock_in_fix', v_id, v_reason, v_actor, v_line.new_cost);
        END IF;

        IF v_line.new_qty = 0 THEN
            DELETE FROM public.stock_receipt_items WHERE receipt_id = v_id AND COALESCE(variant_id, 'product:' || product_id) = v_line.variant_id;
        ELSIF v_line.old_rows = 1 THEN
            UPDATE public.stock_receipt_items SET quantity = v_line.new_qty, unit_cost = v_line.new_cost
            WHERE receipt_id = v_id AND COALESCE(variant_id, 'product:' || product_id) = v_line.variant_id
              AND (quantity IS DISTINCT FROM v_line.new_qty OR unit_cost IS DISTINCT FROM v_line.new_cost);
        ELSE
            DELETE FROM public.stock_receipt_items WHERE receipt_id = v_id AND COALESCE(variant_id, 'product:' || product_id) = v_line.variant_id;
            INSERT INTO public.stock_receipt_items (receipt_id, variant_id, product_id, quantity, unit_cost)
            VALUES (v_id, CASE WHEN v_product IS NULL THEN v_line.variant_id END, v_product, v_line.new_qty, v_line.new_cost);
        END IF;

        -- A corrected buying price becomes the item's buying price, as on receive.
        IF v_line.new_qty > 0 AND v_line.new_cost IS NOT NULL AND v_line.new_cost IS DISTINCT FROM v_line.old_cost THEN
            UPDATE public.product_variants SET cost_price = v_line.new_cost
            WHERE id = v_line.variant_id AND cost_price IS DISTINCT FROM v_line.new_cost;
            UPDATE public.products pr SET cost_price = v_line.new_cost
            FROM public.product_variants v
            WHERE v.id = v_line.variant_id AND pr.id = v.product_id AND pr.cost_price IS DISTINCT FROM v_line.new_cost;
            UPDATE public.products SET cost_price = v_line.new_cost
            WHERE id = v_product AND cost_price IS DISTINCT FROM v_line.new_cost;
        END IF;
    END LOOP;

    SELECT COALESCE(sum(quantity * unit_cost), 0) INTO v_total
    FROM public.stock_receipt_items WHERE receipt_id = v_id AND unit_cost IS NOT NULL;
    IF v_discount > v_total THEN RAISE EXCEPTION 'discount_over_total' USING ERRCODE = '22023'; END IF;

    UPDATE public.stock_receipts
    SET reference = NULLIF(btrim(COALESCE(p->>'reference', '')), ''),
        invoice_date = NULLIF(p->>'invoice_date', '')::DATE,
        note = NULLIF(btrim(COALESCE(p->>'note', '')), ''),
        discount = v_discount,
        extra_cost = v_extra,
        total_cost = v_total
    WHERE id = v_id;

    INSERT INTO public.stock_receipt_edits (receipt_id, kind, reason, before_state, after_state, edited_by)
    VALUES (v_id, 'edit', left(v_reason, 500), v_before, public.stock_receipt_snapshot(v_id), v_actor);
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.plain_stock_apply(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plain_stock_apply(TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.inventory_receive(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_receive(JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.stock_receipt_snapshot(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_receipt_snapshot(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.supplier_purchase_edit(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_purchase_edit(JSONB) TO service_role;
