-- ======================================================================
-- POS returns: give back less than the full price.
-- When many items come back the shop often pays only part of their value
-- (worn, damaged, tags removed...). pos_return_sale now takes an optional
-- `refund_amount`: 0 .. the full value of the returned lines. Left out =
-- the full value, as before. pos_returns.full_amount keeps what the full
-- value was, so the kept part is visible later.
-- Re-runnable.
-- ======================================================================

ALTER TABLE public.pos_returns ADD COLUMN IF NOT EXISTS full_amount NUMERIC(12, 2);


-- ----------------------------------------------------------------------
-- pos_return_sale: goods come back; money goes out.
--   { actor, sale_id, session_id, refund_method, reason, restock,
--     items: [{ sale_item_id, quantity }], refund_amount? }
-- The full refund is each line's paid price, less its share of any bill discount.
-- refund_amount (optional) pays back less: 0 .. that full value.
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
    v_full NUMERIC;
    v_asked NUMERIC := NULLIF(btrim(COALESCE(p->>'refund_amount', '')), '')::NUMERIC;
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

    v_full := GREATEST(LEAST(v_refund, v_sale.total - v_sale.refunded_total), 0);
    IF v_asked IS NOT NULL THEN
        IF v_asked < 0 OR v_asked > v_full THEN
            RAISE EXCEPTION 'invalid_refund_amount' USING ERRCODE = '22023';
        END IF;
        v_refund := ROUND(v_asked, 2);
    ELSE
        v_refund := v_full;
    END IF;

    -- Cash leaves a drawer, so a cash refund needs an open one.
    IF v_method = 'cash' AND v_refund > 0 AND v_session IS NULL THEN
        RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pos_returns (id, sale_id, reason, refund_amount, full_amount, refund_method, restocked, items, created_by)
    VALUES (v_return_id, v_sale.id, NULLIF(btrim(COALESCE(p->>'reason', '')), ''), v_refund, v_full, v_method, v_restock, v_done, v_actor);

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

    RETURN jsonb_build_object('return_id', v_return_id, 'refund_amount', v_refund, 'full_amount', v_full);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_return_sale(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_return_sale(JSONB) TO service_role;
