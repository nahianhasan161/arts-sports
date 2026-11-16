-- Supplier purchases: buy goods from a supplier like a bill at the counter,
-- keep each supplier's full details, and follow what we owe them.
-- Needs 20261114100000_pos_stock_crm.sql first. Safe to run again.

-- ----------------------------------------------------------------------
-- More about each supplier
-- ----------------------------------------------------------------------
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS alt_phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS payment_info TEXT,          -- bank / bKash / Nagad numbers
    ADD COLUMN IF NOT EXISTS opening_due NUMERIC(14, 2) NOT NULL DEFAULT 0; -- owed before this system

-- ----------------------------------------------------------------------
-- A purchase = a stock_receipts row. Give it a number and the bill's extras.
-- ----------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.stock_receipt_seq START 1001;

ALTER TABLE public.stock_receipts
    ADD COLUMN IF NOT EXISTS receipt_no BIGINT DEFAULT nextval('public.stock_receipt_seq'),
    ADD COLUMN IF NOT EXISTS invoice_date DATE,
    ADD COLUMN IF NOT EXISTS discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS extra_cost NUMERIC(14, 2) NOT NULL DEFAULT 0;  -- transport, labour

ALTER TABLE public.stock_receipts DROP CONSTRAINT IF EXISTS stock_receipts_money_check;
ALTER TABLE public.stock_receipts
    ADD CONSTRAINT stock_receipts_money_check CHECK (discount >= 0 AND extra_cost >= 0);

CREATE INDEX IF NOT EXISTS stock_receipts_supplier_idx ON public.stock_receipts (supplier_id, created_at DESC);

-- ----------------------------------------------------------------------
-- Money paid to a supplier (with a purchase, or later against the due)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    supplier_id TEXT NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    receipt_id TEXT REFERENCES public.stock_receipts(id) ON DELETE SET NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'bkash', 'nagad', 'bank', 'other')),
    reference TEXT,
    note TEXT,
    -- Set when the cash came out of an open register drawer.
    cash_move_id TEXT REFERENCES public.pos_cash_moves(id) ON DELETE SET NULL,
    paid_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON public.supplier_payments (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_payments_receipt_idx ON public.supplier_payments (receipt_id);

-- What we bought, paid and still owe, per supplier.
-- A negative due means we paid in advance.
DROP VIEW IF EXISTS public.supplier_balances;
CREATE VIEW public.supplier_balances AS
SELECT
    s.id AS supplier_id,
    COALESCE(r.purchases, 0)::INTEGER AS purchases,
    COALESCE(r.bought, 0)::NUMERIC(14, 2) AS bought,
    COALESCE(pay.paid, 0)::NUMERIC(14, 2) AS paid,
    (s.opening_due + COALESCE(r.bought, 0) - COALESCE(pay.paid, 0))::NUMERIC(14, 2) AS due,
    r.last_purchase_at
FROM public.suppliers s
LEFT JOIN (
    SELECT supplier_id, count(*) AS purchases,
           sum(total_cost - discount + extra_cost) AS bought,
           max(created_at) AS last_purchase_at
    FROM public.stock_receipts
    WHERE supplier_id IS NOT NULL
    GROUP BY supplier_id
) r ON r.supplier_id = s.id
LEFT JOIN (
    SELECT supplier_id, sum(amount) AS paid
    FROM public.supplier_payments
    GROUP BY supplier_id
) pay ON pay.supplier_id = s.id;

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_payments FROM anon, authenticated;
REVOKE ALL ON public.supplier_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_balances TO service_role;
GRANT ALL ON public.supplier_payments TO service_role;
REVOKE ALL ON SEQUENCE public.stock_receipt_seq FROM anon, authenticated;

-- ----------------------------------------------------------------------
-- supplier_pay: money to a supplier.
--   { actor, supplier_id, receipt_id?, amount, method, reference, note, from_drawer }
-- from_drawer = the cash came out of the actor's open register drawer.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_pay(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_supplier TEXT := NULLIF(p->>'supplier_id', '');
    v_receipt TEXT := NULLIF(p->>'receipt_id', '');
    v_amount NUMERIC := COALESCE(NULLIF(p->>'amount', '')::NUMERIC, 0);
    v_method TEXT := COALESCE(NULLIF(p->>'method', ''), 'cash');
    v_name TEXT;
    v_session TEXT;
    v_move TEXT;
    v_id TEXT;
BEGIN
    SELECT name INTO v_name FROM public.suppliers WHERE id = v_supplier;
    IF v_name IS NULL THEN RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = '22023'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
    IF v_method NOT IN ('cash', 'card', 'bkash', 'nagad', 'bank', 'other') THEN
        RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
    END IF;
    IF v_receipt IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.stock_receipts WHERE id = v_receipt AND supplier_id = v_supplier
    ) THEN
        RAISE EXCEPTION 'purchase_not_found' USING ERRCODE = '22023';
    END IF;

    IF COALESCE((p->>'from_drawer')::BOOLEAN, false) THEN
        IF v_method <> 'cash' THEN RAISE EXCEPTION 'drawer_cash_only' USING ERRCODE = '22023'; END IF;
        SELECT id INTO v_session FROM public.pos_sessions
        WHERE opened_by = v_actor AND status = 'open'
        ORDER BY opened_at DESC LIMIT 1;
        IF v_session IS NULL THEN RAISE EXCEPTION 'session_not_open' USING ERRCODE = '22023'; END IF;
        INSERT INTO public.pos_cash_moves (session_id, amount, reason, created_by)
        VALUES (v_session, -v_amount, left('Supplier: ' || v_name, 200), v_actor)
        RETURNING id INTO v_move;
    END IF;

    INSERT INTO public.supplier_payments (supplier_id, receipt_id, amount, method, reference, note, cash_move_id, paid_by)
    VALUES (v_supplier, v_receipt, v_amount, v_method,
            NULLIF(btrim(COALESCE(p->>'reference', '')), ''),
            NULLIF(btrim(COALESCE(p->>'note', '')), ''),
            v_move, v_actor)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------
-- supplier_purchase: one purchase bill, all or nothing.
--   inventory_receive's payload plus
--   { invoice_date, discount, extra_cost, paid, method, pay_reference, from_drawer }
-- Stock goes up through inventory_receive -> stock_apply.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_purchase(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_supplier TEXT := NULLIF(p->>'supplier_id', '');
    v_discount NUMERIC := COALESCE(NULLIF(p->>'discount', '')::NUMERIC, 0);
    v_extra NUMERIC := COALESCE(NULLIF(p->>'extra_cost', '')::NUMERIC, 0);
    v_paid NUMERIC := COALESCE(NULLIF(p->>'paid', '')::NUMERIC, 0);
    v_total NUMERIC;
    v_id TEXT;
BEGIN
    IF v_supplier IS NULL OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier) THEN
        RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = '22023';
    END IF;
    IF v_discount < 0 OR v_extra < 0 OR v_paid < 0 THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    v_id := public.inventory_receive(p);

    SELECT total_cost INTO v_total FROM public.stock_receipts WHERE id = v_id;
    IF v_discount > v_total THEN RAISE EXCEPTION 'discount_over_total' USING ERRCODE = '22023'; END IF;

    UPDATE public.stock_receipts
    SET discount = v_discount,
        extra_cost = v_extra,
        invoice_date = NULLIF(p->>'invoice_date', '')::DATE
    WHERE id = v_id;

    IF v_paid > 0 THEN
        PERFORM public.supplier_pay(jsonb_build_object(
            'actor', p->>'actor',
            'supplier_id', v_supplier,
            'receipt_id', v_id,
            'amount', v_paid,
            'method', p->>'method',
            'reference', p->>'pay_reference',
            'from_drawer', COALESCE(p->'from_drawer', 'false'::jsonb)
        ));
    END IF;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_pay(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_purchase(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_pay(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.supplier_purchase(JSONB) TO service_role;
