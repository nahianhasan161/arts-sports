-- Audit log (Phase 0).
--
-- Who changed a price, stock, an order, a payment, a coupon or a role, and
-- when. Written only by triggers, so no code path can skip it, and nobody
-- can edit or delete an entry (no UPDATE/DELETE policy, inserts only from
-- the SECURITY DEFINER trigger).
--
-- Updates store only the columns that changed. Columns that churn on every
-- write (updated_at, reserved stock) are ignored so the log stays readable.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id UUID,
    actor_email TEXT,
    -- 'user' for a signed-in person, 'system' for jobs/webhooks, 'anon' for guest checkout.
    actor_kind TEXT NOT NULL DEFAULT 'user',
    action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_time_idx ON public.audit_log (occurred_at DESC);

/*
 * Trigger arguments: ignored column names. For an update, only columns whose
 * value changed are recorded, as {"col": {"from": .., "to": ..}}; if nothing
 * but ignored columns changed, nothing is written.
 */
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

    v_entity_id := COALESCE(v_new ->> 'id', v_old ->> 'id',
                            v_new ->> 'code', v_old ->> 'code', NULL);
    -- Join tables have composite keys.
    IF v_entity_id IS NULL THEN
        v_entity_id := concat_ws(':',
            COALESCE(v_new ->> 'role_id', v_old ->> 'role_id'),
            COALESCE(v_new ->> 'user_id', v_old ->> 'user_id', v_new ->> 'permission_code', v_old ->> 'permission_code'));
    END IF;

    IF v_uid IS NOT NULL THEN
        SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    END IF;

    INSERT INTO public.audit_log (actor_id, actor_email, actor_kind, action, entity_type, entity_id, changes)
    VALUES (
        v_uid,
        v_email,
        CASE WHEN v_uid IS NOT NULL THEN 'user'
             WHEN v_role = 'anon' THEN 'anon'
             ELSE 'system' END,
        lower(TG_OP),
        TG_TABLE_NAME,
        v_entity_id,
        v_changes
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ----------------------------------------------------------------------
-- What is audited
-- ----------------------------------------------------------------------
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        -- table, ignored columns
        ('products',          ARRAY['rating', 'reviews_count', 'stock']),
        ('product_variants',  ARRAY['stock']),
        ('product_stock',     ARRAY['reserved_quantity']),
        ('orders',            ARRAY[]::TEXT[]),
        ('payments',          ARRAY['gateway_synced_at']),
        ('coupons',           ARRAY['used_count', 'times_used', 'redemption_count']),
        ('promotions',        ARRAY[]::TEXT[]),
        ('refunds',           ARRAY[]::TEXT[]),
        ('customers',         ARRAY[]::TEXT[]),
        ('roles',             ARRAY[]::TEXT[]),
        ('role_permissions',  ARRAY[]::TEXT[]),
        ('staff_roles',       ARRAY['assigned_at']),
        ('app_settings',      ARRAY[]::TEXT[])
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

-- ----------------------------------------------------------------------
-- Access: read with audit.view; nobody writes directly.
-- ----------------------------------------------------------------------
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit readers" ON public.audit_log;
CREATE POLICY "Audit readers" ON public.audit_log
    FOR SELECT USING (public.has_permission('audit.view'));

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon, authenticated;
