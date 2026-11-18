-- Fabric stock (raw material for custom jerseys), counted in kg.
--
--   custom_fabrics.kg_per_piece   how much fabric one jersey takes
--   custom_fabrics.low_stock_kg   warn when stock falls to this
--   fabric_moves                  every kg in or out:
--       purchase  bought from a supplier (kg, price per kg) -> adds to the supplier's due
--       used      cut for a custom order
--       wastage   lost: cutting waste, display piece, sample / test, damaged, misprint, other
--       adjust    a count correction (+ or -)
--   fabric_stock (view)           kg on hand, bought, used, wasted, average cost per kg
--
-- Rows are never deleted; a wrong entry is voided with a reason.
-- Needs 20261113100000 (custom jersey) and 20261117130000 (supplier corrections) first.
-- Safe to run again.

ALTER TABLE public.custom_fabrics
    ADD COLUMN IF NOT EXISTS kg_per_piece NUMERIC(8, 3),
    ADD COLUMN IF NOT EXISTS low_stock_kg NUMERIC(10, 2);
ALTER TABLE public.custom_fabrics DROP CONSTRAINT IF EXISTS custom_fabrics_kg_check;
ALTER TABLE public.custom_fabrics
    ADD CONSTRAINT custom_fabrics_kg_check CHECK (
        (kg_per_piece IS NULL OR kg_per_piece >= 0) AND (low_stock_kg IS NULL OR low_stock_kg >= 0)
    );

CREATE TABLE IF NOT EXISTS public.fabric_moves (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    fabric_id TEXT NOT NULL REFERENCES public.custom_fabrics(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('purchase', 'used', 'wastage', 'adjust')),
    reason TEXT CHECK (reason IS NULL OR reason IN ('cutting', 'display', 'sample', 'damaged', 'misprint', 'other')),
    kg NUMERIC(12, 3) NOT NULL CHECK (kg <> 0),          -- + in, - out
    pieces INTEGER CHECK (pieces IS NULL OR pieces >= 0),
    cost_per_kg NUMERIC(12, 2) CHECK (cost_per_kg IS NULL OR cost_per_kg >= 0),
    total_cost NUMERIC(14, 2) CHECK (total_cost IS NULL OR total_cost >= 0),
    supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
    custom_order_id TEXT REFERENCES public.custom_orders(id) ON DELETE SET NULL,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    void_reason TEXT,
    CONSTRAINT fabric_moves_shape CHECK (
        (kind = 'purchase' AND kg > 0 AND cost_per_kg IS NOT NULL)
        OR (kind IN ('used', 'wastage') AND kg < 0)
        OR kind = 'adjust'
    ),
    CONSTRAINT fabric_moves_reason CHECK ((kind = 'wastage') = (reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS fabric_moves_fabric_idx ON public.fabric_moves (fabric_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fabric_moves_supplier_idx ON public.fabric_moves (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fabric_moves_order_idx ON public.fabric_moves (custom_order_id) WHERE custom_order_id IS NOT NULL;

ALTER TABLE public.fabric_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fabric_moves FROM anon, authenticated;
GRANT ALL ON public.fabric_moves TO service_role;

-- ----------------------------------------------------------------------
-- Stock per fabric (voided rows left out)
-- ----------------------------------------------------------------------
DROP VIEW IF EXISTS public.fabric_stock;
CREATE VIEW public.fabric_stock AS
SELECT
    f.id AS fabric_id,
    COALESCE(sum(m.kg), 0)::NUMERIC(12, 3) AS on_hand_kg,
    COALESCE(sum(m.kg) FILTER (WHERE m.kind = 'purchase'), 0)::NUMERIC(12, 3) AS bought_kg,
    COALESCE(sum(m.total_cost) FILTER (WHERE m.kind = 'purchase'), 0)::NUMERIC(14, 2) AS bought_cost,
    CASE WHEN COALESCE(sum(m.kg) FILTER (WHERE m.kind = 'purchase'), 0) > 0
         THEN (sum(m.total_cost) FILTER (WHERE m.kind = 'purchase') / sum(m.kg) FILTER (WHERE m.kind = 'purchase'))::NUMERIC(12, 2)
    END AS avg_cost_per_kg,
    COALESCE(-sum(m.kg) FILTER (WHERE m.kind = 'used'), 0)::NUMERIC(12, 3) AS used_kg,
    COALESCE(sum(m.pieces) FILTER (WHERE m.kind = 'used'), 0)::INTEGER AS used_pieces,
    COALESCE(-sum(m.kg) FILTER (WHERE m.kind = 'wastage'), 0)::NUMERIC(12, 3) AS wasted_kg,
    COALESCE(sum(m.pieces) FILTER (WHERE m.kind = 'wastage'), 0)::INTEGER AS wasted_pieces,
    max(m.created_at) FILTER (WHERE m.kind = 'purchase') AS last_purchase_at
FROM public.custom_fabrics f
LEFT JOIN public.fabric_moves m ON m.fabric_id = f.id AND m.voided_at IS NULL
GROUP BY f.id;
REVOKE ALL ON public.fabric_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fabric_stock TO service_role;

-- ----------------------------------------------------------------------
-- Supplier balances now include fabric bought from them
-- (same columns as before, so the supplier screens keep working)
-- ----------------------------------------------------------------------
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
    SELECT supplier_id, count(*) AS purchases, sum(amount) AS bought, max(created_at) AS last_purchase_at
    FROM (
        SELECT supplier_id, (total_cost - discount + extra_cost) AS amount, created_at
        FROM public.stock_receipts
        WHERE supplier_id IS NOT NULL
        UNION ALL
        SELECT supplier_id, total_cost, created_at
        FROM public.fabric_moves
        WHERE kind = 'purchase' AND supplier_id IS NOT NULL AND voided_at IS NULL
    ) x
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
-- fabric_purchase: fabric bought from a supplier, with an optional payment now.
--   { actor, fabric_id, supplier_id?, kg, cost_per_kg, extra_cost?, note?,
--     paid?, method?, pay_reference?, from_drawer? }
-- total_cost = kg * cost_per_kg + extra_cost (transport, labour).
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fabric_purchase(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_fabric TEXT := NULLIF(p->>'fabric_id', '');
    v_supplier TEXT := NULLIF(p->>'supplier_id', '');
    v_kg NUMERIC := COALESCE(NULLIF(p->>'kg', '')::NUMERIC, 0);
    v_rate NUMERIC := NULLIF(p->>'cost_per_kg', '')::NUMERIC;
    v_extra NUMERIC := COALESCE(NULLIF(p->>'extra_cost', '')::NUMERIC, 0);
    v_paid NUMERIC := COALESCE(NULLIF(p->>'paid', '')::NUMERIC, 0);
    v_name TEXT;
    v_id TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    SELECT name_en INTO v_name FROM public.custom_fabrics WHERE id = v_fabric;
    IF v_name IS NULL THEN RAISE EXCEPTION 'fabric_not_found' USING ERRCODE = '22023'; END IF;
    IF v_kg <= 0 THEN RAISE EXCEPTION 'invalid_kg' USING ERRCODE = '22023'; END IF;
    IF v_rate IS NULL OR v_rate < 0 OR v_extra < 0 OR v_paid < 0 THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;
    IF v_paid > 0 AND v_supplier IS NULL THEN RAISE EXCEPTION 'supplier_required' USING ERRCODE = '22023'; END IF;
    IF v_supplier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier) THEN
        RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.fabric_moves (fabric_id, kind, kg, cost_per_kg, total_cost, supplier_id, note, created_by)
    VALUES (v_fabric, 'purchase', v_kg, v_rate, round(v_kg * v_rate + v_extra, 2), v_supplier,
            NULLIF(btrim(COALESCE(p->>'note', '')), ''), v_actor)
    RETURNING id INTO v_id;

    IF v_paid > 0 THEN
        PERFORM public.supplier_pay(jsonb_build_object(
            'actor', v_actor, 'supplier_id', v_supplier, 'amount', v_paid,
            'method', COALESCE(NULLIF(p->>'method', ''), 'cash'),
            'reference', p->>'pay_reference',
            'note', left('Fabric: ' || v_name || ' ' || v_kg || ' kg', 200),
            'from_drawer', COALESCE((p->>'from_drawer')::BOOLEAN, false)
        ));
    END IF;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fabric_purchase(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fabric_purchase(JSONB) TO service_role;

-- Audit log: who added or voided a fabric entry
DO $$
BEGIN
    IF to_regproc('public.audit_row_change') IS NULL THEN RETURN; END IF;
    DROP TRIGGER IF EXISTS audit_fabric_moves ON public.fabric_moves;
    CREATE TRIGGER audit_fabric_moves AFTER INSERT OR UPDATE OR DELETE ON public.fabric_moves
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
END $$;
