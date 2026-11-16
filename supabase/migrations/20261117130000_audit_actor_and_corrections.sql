-- Who did it, and fixing mistakes with a history.
--
-- 1. The audit trigger now names the staff member for changes made through
--    the server (service role). The API sends the signed-in staff id in the
--    `x-actor-id` header (lib/supabase/service.ts); SQL functions can also set
--    `app.actor_id`. Before this, those changes were logged as "system".
-- 2. An optional reason on each audit entry (`app.audit_reason`).
-- 3. Suppliers, purchases, supplier payments and cash drawer moves are audited.
-- 4. A saved purchase can be corrected and a supplier payment undone (kept,
--    marked void). Both need a reason and are kept in stock_receipt_edits.
--
-- Needs 20261108130000_audit_log.sql and 20261117120000_supplier_purchases.sql. Safe to run again.

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_changes JSONB := '{}'::jsonb;
    v_key TEXT;
    v_ignored TEXT[] := COALESCE(TG_ARGV::TEXT[], '{}') || ARRAY['updated_at'];
    v_uid UUID := auth.uid();
    v_role TEXT := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    v_email TEXT;
    v_entity_id TEXT;
    v_actor TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        v_changes := v_new;
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_changes := v_old;
    ELSE
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
            IF v_key <> ALL (v_ignored) AND (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
                v_changes := v_changes || jsonb_build_object(
                    v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
            END IF;
        END LOOP;
        IF v_changes = '{}'::jsonb THEN
            RETURN NEW;
        END IF;
    END IF;

    -- A server-side change: the staff member the API or a function named.
    -- The header is trusted only from the service role (a browser cannot use it).
    IF v_uid IS NULL THEN
        v_actor := NULLIF(current_setting('app.actor_id', true), '');
        IF v_actor IS NULL AND (v_role = 'service_role' OR current_setting('role', true) = 'service_role') THEN
            BEGIN
                v_actor := NULLIF(current_setting('request.headers', true)::jsonb ->> 'x-actor-id', '');
            EXCEPTION WHEN others THEN
                v_actor := NULL;
            END;
        END IF;
        IF v_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_uid := v_actor::UUID;
        END IF;
    END IF;

    v_entity_id := COALESCE(v_new ->> 'id', v_old ->> 'id',
                            v_new ->> 'code', v_old ->> 'code', NULL);
    -- Join tables have composite keys.
    IF v_entity_id IS NULL THEN
        v_entity_id := concat_ws(':',
            COALESCE(v_new ->> 'role_id', v_old ->> 'role_id', v_new ->> 'variant_id', v_old ->> 'variant_id'),
            COALESCE(v_new ->> 'user_id', v_old ->> 'user_id', v_new ->> 'permission_code', v_old ->> 'permission_code',
                     v_new ->> 'supplier_id', v_old ->> 'supplier_id', v_new ->> 'showroom_id', v_old ->> 'showroom_id'));
    END IF;

    IF v_uid IS NOT NULL THEN
        SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    END IF;

    INSERT INTO public.audit_log (actor_id, actor_email, actor_kind, action, entity_type, entity_id, changes, reason)
    VALUES (
        v_uid,
        v_email,
        CASE WHEN v_uid IS NOT NULL THEN 'user'
             WHEN v_role = 'anon' THEN 'anon'
             ELSE 'system' END,
        lower(TG_OP),
        TG_TABLE_NAME,
        v_entity_id,
        v_changes,
        NULLIF(current_setting('app.audit_reason', true), '')
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ----------------------------------------------------------------------
-- Undoing a supplier payment keeps the row
-- ----------------------------------------------------------------------
ALTER TABLE public.supplier_payments
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voided_by UUID,
    ADD COLUMN IF NOT EXISTS void_reason TEXT;

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
    WHERE voided_at IS NULL
    GROUP BY supplier_id
) pay ON pay.supplier_id = s.id;
REVOKE ALL ON public.supplier_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_balances TO service_role;

-- ----------------------------------------------------------------------
-- The readable history of corrections to a purchase
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_receipt_edits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    receipt_id TEXT NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('edit', 'payment_void')),
    reason TEXT NOT NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    edited_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_receipt_edits_receipt_idx ON public.stock_receipt_edits (receipt_id, created_at DESC);
ALTER TABLE public.stock_receipt_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_receipt_edits FROM anon, authenticated;
GRANT ALL ON public.stock_receipt_edits TO service_role;

-- ----------------------------------------------------------------------
-- More tables in the audit log
-- ----------------------------------------------------------------------
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('suppliers',           ARRAY[]::TEXT[]),
        ('supplier_stock',      ARRAY[]::TEXT[]),
        ('stock_receipts',      ARRAY[]::TEXT[]),
        ('stock_receipt_items', ARRAY[]::TEXT[]),
        ('supplier_payments',   ARRAY[]::TEXT[]),
        ('pos_cash_moves',      ARRAY[]::TEXT[]),
        ('showrooms',           ARRAY[]::TEXT[])
    ) AS v(tbl, ignored)
    LOOP
        IF to_regclass('public.' || t.tbl) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t.tbl);
        EXECUTE format(
            'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
             FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(%2$s)',
            t.tbl,
            COALESCE((SELECT string_agg(quote_literal(c), ', ') FROM unnest(t.ignored) c), '')
        );
    END LOOP;
END $$;

-- A snapshot of a purchase, for the before/after in its history.
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
            SELECT jsonb_agg(jsonb_build_object('variant_id', i.variant_id, 'quantity', i.quantity, 'unit_cost', i.unit_cost) ORDER BY i.variant_id)
            FROM public.stock_receipt_items i WHERE i.receipt_id = r.id
        ), '[]'::jsonb)
    )
    FROM public.stock_receipts r WHERE r.id = p_id;
$$;

-- ----------------------------------------------------------------------
-- supplier_purchase_edit: correct a saved purchase.
--   { actor, receipt_id, reason, reference, invoice_date, note, discount, extra_cost,
--     items: [{ variant_id, quantity, unit_cost }] }   quantity 0 = remove the line
-- Stock moves by the difference only (reason 'stock_in_fix'), so pieces
-- already sold are not touched. Fails if the shop no longer has the pieces
-- being taken off.
-- ----------------------------------------------------------------------
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
            SELECT variant_id, sum(quantity)::INTEGER AS qty, count(*) AS n_rows, max(unit_cost) AS cost
            FROM public.stock_receipt_items WHERE receipt_id = v_id GROUP BY variant_id
        ) o
        FULL JOIN _purchase_edit n ON n.variant_id = o.variant_id
    LOOP
        IF v_line.new_qty <> v_line.old_qty THEN
            PERFORM public.stock_apply(v_line.variant_id, r.showroom_id, v_line.new_qty - v_line.old_qty,
                                       'stock_in_fix', v_id, v_reason, v_actor, v_line.new_cost);
        END IF;

        IF v_line.new_qty = 0 THEN
            DELETE FROM public.stock_receipt_items WHERE receipt_id = v_id AND variant_id = v_line.variant_id;
        ELSIF v_line.old_rows = 1 THEN
            UPDATE public.stock_receipt_items SET quantity = v_line.new_qty, unit_cost = v_line.new_cost
            WHERE receipt_id = v_id AND variant_id = v_line.variant_id
              AND (quantity IS DISTINCT FROM v_line.new_qty OR unit_cost IS DISTINCT FROM v_line.new_cost);
        ELSE
            DELETE FROM public.stock_receipt_items WHERE receipt_id = v_id AND variant_id = v_line.variant_id;
            INSERT INTO public.stock_receipt_items (receipt_id, variant_id, quantity, unit_cost)
            VALUES (v_id, v_line.variant_id, v_line.new_qty, v_line.new_cost);
        END IF;

        -- A corrected buying price becomes the item's buying price, as on receive.
        IF v_line.new_qty > 0 AND v_line.new_cost IS NOT NULL AND v_line.new_cost IS DISTINCT FROM v_line.old_cost THEN
            UPDATE public.product_variants SET cost_price = v_line.new_cost
            WHERE id = v_line.variant_id AND cost_price IS DISTINCT FROM v_line.new_cost;
            UPDATE public.products pr SET cost_price = v_line.new_cost
            FROM public.product_variants v
            WHERE v.id = v_line.variant_id AND pr.id = v.product_id AND pr.cost_price IS DISTINCT FROM v_line.new_cost;
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

-- ----------------------------------------------------------------------
-- supplier_payment_void: undo a payment entered by mistake.
--   { actor, payment_id, reason }
-- The row stays (struck out). Cash taken from a drawer that is still open
-- goes back into it; a closed drawer is left as counted.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_payment_void(p JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_reason TEXT := btrim(COALESCE(p->>'reason', ''));
    pay public.supplier_payments%ROWTYPE;
    v_session TEXT;
    v_back BOOLEAN := false;
BEGIN
    IF v_reason = '' THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO pay FROM public.supplier_payments WHERE id = p->>'payment_id' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found' USING ERRCODE = '22023'; END IF;
    IF pay.voided_at IS NOT NULL THEN RAISE EXCEPTION 'payment_already_void' USING ERRCODE = '22023'; END IF;

    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    PERFORM set_config('app.audit_reason', left(v_reason, 500), true);

    IF pay.cash_move_id IS NOT NULL THEN
        SELECT s.id INTO v_session
        FROM public.pos_cash_moves m JOIN public.pos_sessions s ON s.id = m.session_id
        WHERE m.id = pay.cash_move_id AND s.status = 'open';
        IF v_session IS NOT NULL THEN
            INSERT INTO public.pos_cash_moves (session_id, amount, reason, created_by)
            VALUES (v_session, pay.amount, left('Undo supplier payment: ' || v_reason, 200), v_actor);
            v_back := true;
        END IF;
    END IF;

    UPDATE public.supplier_payments
    SET voided_at = now(), voided_by = v_actor, void_reason = left(v_reason, 500)
    WHERE id = pay.id;

    IF pay.receipt_id IS NOT NULL THEN
        INSERT INTO public.stock_receipt_edits (receipt_id, kind, reason, before_state, after_state, edited_by)
        VALUES (pay.receipt_id, 'payment_void', left(v_reason, 500),
                jsonb_build_object('payment_id', pay.id, 'amount', pay.amount, 'method', pay.method, 'paid_at', pay.created_at),
                jsonb_build_object('cash_back_in_drawer', v_back),
                v_actor);
    END IF;
    RETURN v_back;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_receipt_snapshot(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_purchase_edit(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_payment_void(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_receipt_snapshot(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.supplier_purchase_edit(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.supplier_payment_void(JSONB) TO service_role;
