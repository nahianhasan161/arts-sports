-- Custom jersey money + raw material guards (found by scripts/test-custom-jersey-flow.mjs).
--
--   1. Custom-jersey payments taken at the counter belong to the cashier's open drawer
--      (custom_order_payments.session_id), so the day's expected cash includes them.
--   2. custom_order_take_payment(): staff payment under a lock on the order; refuses
--      more than what is left to pay (two staff at once can no longer overpay).
--   3. Fabric (kg) and accessories (pcs) can't go below zero: checked on every new
--      out-move, negative adjust and purchase void, whichever screen writes it.
--
-- Needs 20261113100000, 20261114100000, 20261118140000, 20261118150000 first. Safe to run again.

-- ----------------------------------------------------------------------
-- 1. Drawer link
-- ----------------------------------------------------------------------
ALTER TABLE public.custom_order_payments
    ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS custom_order_payments_session_idx
    ON public.custom_order_payments (session_id) WHERE session_id IS NOT NULL;

-- Same keys as before plus custom_count / custom_total; by_method and expected_cash
-- now include custom-jersey payments taken in this drawer.
CREATE OR REPLACE FUNCTION public.pos_session_summary(p_session_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH money AS (
        SELECT y.method, CASE WHEN y.type = 'charge' THEN y.amount ELSE -y.amount END AS net
        FROM public.pos_payments y WHERE y.session_id = p_session_id
        UNION ALL
        SELECT c.method, c.amount
        FROM public.custom_order_payments c
        WHERE c.session_id = p_session_id AND c.status = 'successful'
    )
    SELECT jsonb_build_object(
        'opening_float', s.opening_float,
        'sales_count', (SELECT count(*) FROM public.pos_sales x WHERE x.session_id = s.id),
        'sales_total', (SELECT COALESCE(sum(x.total), 0) FROM public.pos_sales x WHERE x.session_id = s.id),
        'refunds_total', (SELECT COALESCE(sum(y.amount), 0) FROM public.pos_payments y WHERE y.session_id = s.id AND y.type = 'refund'),
        'custom_count', (SELECT count(*) FROM public.custom_order_payments c WHERE c.session_id = s.id AND c.status = 'successful'),
        'custom_total', (SELECT COALESCE(sum(c.amount), 0) FROM public.custom_order_payments c WHERE c.session_id = s.id AND c.status = 'successful'),
        'cash_moves', (SELECT COALESCE(sum(m.amount), 0) FROM public.pos_cash_moves m WHERE m.session_id = s.id),
        'by_method', (
            SELECT COALESCE(jsonb_object_agg(t.method, t.net), '{}'::jsonb)
            FROM (SELECT method, sum(net) AS net FROM money GROUP BY method) t
        ),
        'expected_cash',
            s.opening_float
            + (SELECT COALESCE(sum(net), 0) FROM money WHERE method = 'cash')
            + (SELECT COALESCE(sum(m.amount), 0) FROM public.pos_cash_moves m WHERE m.session_id = s.id)
    )
    FROM public.pos_sessions s WHERE s.id = p_session_id;
$$;
REVOKE ALL ON FUNCTION public.pos_session_summary(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_session_summary(TEXT) TO service_role;

-- ----------------------------------------------------------------------
-- 2. Staff payment on a custom order
--   { actor, order_id, amount, method, kind?, trx_id?, note?, at_counter? }
-- at_counter: cash needs the actor's open drawer; other methods are tied to it when open.
-- Returns custom_order_settle_payment's JSON.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_order_take_payment(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_amount NUMERIC := COALESCE(NULLIF(p->>'amount', '')::NUMERIC, 0);
    v_method TEXT := NULLIF(p->>'method', '');
    v_kind TEXT := COALESCE(NULLIF(p->>'kind', ''), 'balance');
    v_counter BOOLEAN := COALESCE((p->>'at_counter')::BOOLEAN, false);
    v_order public.custom_orders%ROWTYPE;
    v_left NUMERIC;
    v_session TEXT;
    v_id TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    SELECT * INTO v_order FROM public.custom_orders WHERE id = NULLIF(p->>'order_id', '') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023'; END IF;
    IF v_order.final_price IS NULL OR v_order.status IN
        ('submitted', 'in_review', 'changes_needed', 'mockup_sent', 'revision_requested', 'rejected', 'cancelled') THEN
        RAISE EXCEPTION 'not_payable' USING ERRCODE = '22023';
    END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
    IF v_method IS NULL OR v_method NOT IN ('cash', 'card', 'bkash', 'nagad', 'bank', 'cod') THEN
        RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
    END IF;
    IF v_kind NOT IN ('advance', 'balance', 'other') THEN v_kind := 'balance'; END IF;

    v_left := v_order.final_price + v_order.delivery_charge - public.custom_order_paid(v_order.id);
    IF v_amount > v_left + 0.001 THEN
        RAISE EXCEPTION 'more_than_due:%', GREATEST(v_left, 0) USING ERRCODE = '22023';
    END IF;

    IF v_counter AND v_actor IS NOT NULL THEN
        SELECT id INTO v_session FROM public.pos_sessions
        WHERE opened_by = v_actor AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
    END IF;
    IF v_counter AND v_method = 'cash' AND v_session IS NULL THEN
        RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.custom_order_payments
        (custom_order_id, kind, method, amount, status, trx_id, note, recorded_by, session_id)
    VALUES (v_order.id, v_kind, v_method, v_amount, 'initiated',
            NULLIF(btrim(COALESCE(p->>'trx_id', '')), ''), NULLIF(btrim(COALESCE(p->>'note', '')), ''),
            v_actor, v_session)
    RETURNING id INTO v_id;

    RETURN public.custom_order_settle_payment(v_id, 'successful', NULL, NULLIF(btrim(COALESCE(p->>'trx_id', '')), ''));
END;
$$;
REVOKE ALL ON FUNCTION public.custom_order_take_payment(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_order_take_payment(JSONB) TO service_role;

-- ----------------------------------------------------------------------
-- 3. Stock can't go below zero
-- Error text: not_enough_stock:<on hand>
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fabric_moves_stock_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_delta NUMERIC := 0;
    v_on_hand NUMERIC;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.voided_at IS NULL AND NEW.kg < 0 THEN
        v_delta := NEW.kg;
    ELSIF TG_OP = 'UPDATE' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL AND OLD.kg > 0 THEN
        v_delta := -OLD.kg;   -- voiding a purchase / plus adjust takes it back out
    END IF;
    IF v_delta >= 0 THEN RETURN NEW; END IF;

    PERFORM 1 FROM public.custom_fabrics WHERE id = NEW.fabric_id FOR UPDATE;   -- one writer per fabric
    SELECT COALESCE(sum(kg), 0) INTO v_on_hand FROM public.fabric_moves
    WHERE fabric_id = NEW.fabric_id AND voided_at IS NULL;
    IF v_on_hand + v_delta < -0.0005 THEN
        RAISE EXCEPTION 'not_enough_stock:%', round(v_on_hand, 3) USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fabric_moves_stock_guard ON public.fabric_moves;
CREATE TRIGGER fabric_moves_stock_guard BEFORE INSERT OR UPDATE OF voided_at ON public.fabric_moves
    FOR EACH ROW EXECUTE FUNCTION public.fabric_moves_stock_guard();

CREATE OR REPLACE FUNCTION public.accessory_moves_stock_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_delta INTEGER := 0;
    v_on_hand INTEGER;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.voided_at IS NULL AND NEW.qty < 0 THEN
        v_delta := NEW.qty;
    ELSIF TG_OP = 'UPDATE' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL AND OLD.qty > 0 THEN
        v_delta := -OLD.qty;
    END IF;
    IF v_delta >= 0 THEN RETURN NEW; END IF;

    PERFORM 1 FROM public.custom_accessories WHERE id = NEW.accessory_id FOR UPDATE;
    SELECT COALESCE(sum(qty), 0) INTO v_on_hand FROM public.accessory_moves
    WHERE accessory_id = NEW.accessory_id AND voided_at IS NULL;
    IF v_on_hand + v_delta < 0 THEN
        RAISE EXCEPTION 'not_enough_stock:%', v_on_hand USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS accessory_moves_stock_guard ON public.accessory_moves;
CREATE TRIGGER accessory_moves_stock_guard BEFORE INSERT OR UPDATE OF voided_at ON public.accessory_moves
    FOR EACH ROW EXECUTE FUNCTION public.accessory_moves_stock_guard();
