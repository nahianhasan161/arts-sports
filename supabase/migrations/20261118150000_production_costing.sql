-- Custom jersey making cost: accessories stock + production batches.
--
-- How a custom jersey is made (and what it costs):
--   1. Raw material is bought from suppliers: fabric in kg (fabric_moves, 20261118140000)
--      and accessories in pieces (silicon logo / name / number, labels, tags...).
--   2. A production batch (PB-1001) takes fabric and accessories out of stock, sends the
--      fabric to an outside print shop, then to a garments factory for stitching.
--      One batch can hold several custom orders (or sample / shop-stock lines).
--   3. Batch cost = fabric + accessories (at average buying cost) + printing
--      + garments (pieces x rate by style) + travel / extra costs.
--      Cost per jersey = batch cost / pieces. Each order's share:
--        its own garments charge
--      + material taken out for that order
--      + shared costs (untagged material, printing, extras) split by pieces.
--
--   custom_accessories        accessory items (counted in pieces)
--   accessory_moves           every piece in or out (purchase / used / wastage / adjust)
--   accessory_stock (view)    on hand, bought, used, wasted, average cost per piece
--   production_batches        one print + stitching run
--   production_batch_lines    jerseys in the batch: order, pieces, style, garments rate
--   production_costs          travel / transport / labour / food / other
--   fabric_moves.batch_id     fabric taken out for a batch (cost snapshot at average cost)
--   production_batch_totals   (view) cost summary per batch
--   production_line_costs     (view) cost per line, i.e. per order
--   supplier_balances         now also adds accessories, printing and garments to the due
--
-- Printing and garments charges count toward the supplier's due while the batch is
-- not void. Rows of stock moves are never deleted; a wrong entry is voided with a reason.
-- Needs 20261118140000 (fabric stock) first. Safe to run again.

-- ----------------------------------------------------------------------
-- Accessories
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_accessories (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name_en TEXT NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 120),
    name_bn TEXT,
    kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('logo', 'name', 'number', 'label', 'tag', 'packaging', 'other')),
    per_jersey INTEGER CHECK (per_jersey IS NULL OR per_jersey >= 0),   -- usual pieces per jersey (prefills a batch)
    low_stock_pcs INTEGER CHECK (low_stock_pcs IS NULL OR low_stock_pcs >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS custom_accessories_set_updated_at ON public.custom_accessories;
CREATE TRIGGER custom_accessories_set_updated_at
    BEFORE UPDATE ON public.custom_accessories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.custom_accessories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custom_accessories FROM anon, authenticated;
GRANT ALL ON public.custom_accessories TO service_role;

-- ----------------------------------------------------------------------
-- Production batches
-- ----------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.production_batch_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.production_batches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    batch_number TEXT NOT NULL UNIQUE DEFAULT ('PB-' || nextval('public.production_batch_number_seq')::text),
    title TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'void')),
    -- Outside print shop
    print_supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
    print_basis TEXT NOT NULL DEFAULT 'kg' CHECK (print_basis IN ('kg', 'piece', 'lump')),
    print_qty NUMERIC(12, 3) CHECK (print_qty IS NULL OR print_qty >= 0),
    print_rate NUMERIC(12, 2) CHECK (print_rate IS NULL OR print_rate >= 0),
    print_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (print_cost >= 0),
    -- Garments factory (charge = sum of the lines)
    garments_supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    void_reason TEXT
);
CREATE INDEX IF NOT EXISTS production_batches_created_idx ON public.production_batches (created_at DESC);
DROP TRIGGER IF EXISTS production_batches_set_updated_at ON public.production_batches;
CREATE TRIGGER production_batches_set_updated_at
    BEFORE UPDATE ON public.production_batches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.production_batch_lines (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    batch_id TEXT NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
    custom_order_id TEXT REFERENCES public.custom_orders(id) ON DELETE SET NULL,
    label TEXT,                                   -- for lines without an order: "Sample", "Shop stock"
    pieces INTEGER NOT NULL CHECK (pieces > 0),
    sleeve TEXT NOT NULL DEFAULT 'short' CHECK (sleeve IN ('short', 'full')),
    collar TEXT NOT NULL DEFAULT 'round' CHECK (collar IN ('round', 'v', 'polo')),
    shorts INTEGER NOT NULL DEFAULT 0 CHECK (shorts >= 0),
    garment_rate NUMERIC(10, 2) NOT NULL CHECK (garment_rate >= 0),
    shorts_rate NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (shorts_rate >= 0),
    garment_cost NUMERIC(14, 2) GENERATED ALWAYS AS (pieces * garment_rate + shorts * shorts_rate) STORED,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS production_batch_lines_batch_idx ON public.production_batch_lines (batch_id, position);
CREATE INDEX IF NOT EXISTS production_batch_lines_order_idx ON public.production_batch_lines (custom_order_id) WHERE custom_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.production_costs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    batch_id TEXT NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('travel', 'transport', 'labour', 'food', 'other')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    note TEXT,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS production_costs_batch_idx ON public.production_costs (batch_id, position);

ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_batches, public.production_batch_lines, public.production_costs FROM anon, authenticated;
GRANT ALL ON public.production_batches, public.production_batch_lines, public.production_costs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.production_batch_number_seq TO service_role;

-- ----------------------------------------------------------------------
-- Accessory moves (pieces). + in, - out.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accessory_moves (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    accessory_id TEXT NOT NULL REFERENCES public.custom_accessories(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('purchase', 'used', 'wastage', 'adjust')),
    reason TEXT CHECK (reason IS NULL OR reason IN ('cutting', 'display', 'sample', 'damaged', 'misprint', 'other')),
    qty INTEGER NOT NULL CHECK (qty <> 0),
    cost_per_pc NUMERIC(12, 2) CHECK (cost_per_pc IS NULL OR cost_per_pc >= 0),
    total_cost NUMERIC(14, 2) CHECK (total_cost IS NULL OR total_cost >= 0),
    supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
    batch_id TEXT REFERENCES public.production_batches(id) ON DELETE SET NULL,
    custom_order_id TEXT REFERENCES public.custom_orders(id) ON DELETE SET NULL,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    void_reason TEXT,
    CONSTRAINT accessory_moves_shape CHECK (
        (kind = 'purchase' AND qty > 0 AND cost_per_pc IS NOT NULL)
        OR (kind IN ('used', 'wastage') AND qty < 0)
        OR kind = 'adjust'
    ),
    CONSTRAINT accessory_moves_reason CHECK ((kind = 'wastage') = (reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS accessory_moves_item_idx ON public.accessory_moves (accessory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS accessory_moves_supplier_idx ON public.accessory_moves (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS accessory_moves_batch_idx ON public.accessory_moves (batch_id) WHERE batch_id IS NOT NULL;
ALTER TABLE public.accessory_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accessory_moves FROM anon, authenticated;
GRANT ALL ON public.accessory_moves TO service_role;

-- Fabric taken out for a batch
ALTER TABLE public.fabric_moves
    ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES public.production_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fabric_moves_batch_idx ON public.fabric_moves (batch_id) WHERE batch_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- Accessory stock (voided rows left out)
-- ----------------------------------------------------------------------
DROP VIEW IF EXISTS public.accessory_stock;
CREATE VIEW public.accessory_stock AS
SELECT
    a.id AS accessory_id,
    COALESCE(sum(m.qty), 0)::INTEGER AS on_hand,
    COALESCE(sum(m.qty) FILTER (WHERE m.kind = 'purchase'), 0)::INTEGER AS bought_qty,
    COALESCE(sum(m.total_cost) FILTER (WHERE m.kind = 'purchase'), 0)::NUMERIC(14, 2) AS bought_cost,
    CASE WHEN COALESCE(sum(m.qty) FILTER (WHERE m.kind = 'purchase'), 0) > 0
         THEN (sum(m.total_cost) FILTER (WHERE m.kind = 'purchase') / sum(m.qty) FILTER (WHERE m.kind = 'purchase'))::NUMERIC(12, 2)
    END AS avg_cost,
    COALESCE(-sum(m.qty) FILTER (WHERE m.kind = 'used'), 0)::INTEGER AS used_qty,
    COALESCE(-sum(m.qty) FILTER (WHERE m.kind = 'wastage'), 0)::INTEGER AS wasted_qty,
    max(m.created_at) FILTER (WHERE m.kind = 'purchase') AS last_purchase_at
FROM public.custom_accessories a
LEFT JOIN public.accessory_moves m ON m.accessory_id = a.id AND m.voided_at IS NULL
GROUP BY a.id;
REVOKE ALL ON public.accessory_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accessory_stock TO service_role;

-- ----------------------------------------------------------------------
-- Cost views
-- ----------------------------------------------------------------------
DROP VIEW IF EXISTS public.production_line_costs;
DROP VIEW IF EXISTS public.production_batch_totals;

CREATE VIEW public.production_batch_totals AS
SELECT
    b.id AS batch_id,
    COALESCE(l.pieces, 0)::INTEGER AS pieces,
    COALESCE(l.garments, 0)::NUMERIC(14, 2) AS garments_cost,
    COALESCE(f.kg, 0)::NUMERIC(12, 3) AS fabric_kg,
    COALESCE(f.cost, 0)::NUMERIC(14, 2) AS fabric_cost,
    COALESCE(a.qty, 0)::INTEGER AS accessory_qty,
    COALESCE(a.cost, 0)::NUMERIC(14, 2) AS accessory_cost,
    b.print_cost,
    COALESCE(c.amount, 0)::NUMERIC(14, 2) AS extra_cost,
    (COALESCE(l.garments, 0) + COALESCE(f.cost, 0) + COALESCE(a.cost, 0) + b.print_cost + COALESCE(c.amount, 0))::NUMERIC(14, 2) AS total_cost,
    CASE WHEN COALESCE(l.pieces, 0) > 0 THEN
        ((COALESCE(l.garments, 0) + COALESCE(f.cost, 0) + COALESCE(a.cost, 0) + b.print_cost + COALESCE(c.amount, 0)) / l.pieces)::NUMERIC(12, 2)
    END AS cost_per_piece
FROM public.production_batches b
LEFT JOIN (SELECT batch_id, sum(pieces) AS pieces, sum(garment_cost) AS garments FROM public.production_batch_lines GROUP BY batch_id) l ON l.batch_id = b.id
LEFT JOIN (SELECT batch_id, -sum(kg) AS kg, sum(COALESCE(total_cost, 0)) AS cost FROM public.fabric_moves
           WHERE batch_id IS NOT NULL AND voided_at IS NULL GROUP BY batch_id) f ON f.batch_id = b.id
LEFT JOIN (SELECT batch_id, -sum(qty) AS qty, sum(COALESCE(total_cost, 0)) AS cost FROM public.accessory_moves
           WHERE batch_id IS NOT NULL AND voided_at IS NULL GROUP BY batch_id) a ON a.batch_id = b.id
LEFT JOIN (SELECT batch_id, sum(amount) AS amount FROM public.production_costs GROUP BY batch_id) c ON c.batch_id = b.id;

CREATE VIEW public.production_line_costs AS
WITH lines AS (
    SELECT l.*,
           sum(l.pieces) OVER (PARTITION BY l.batch_id) AS batch_pieces,
           sum(l.pieces) OVER (PARTITION BY l.batch_id, l.custom_order_id) AS order_pieces
    FROM public.production_batch_lines l
),
mat AS (
    SELECT batch_id, custom_order_id, sum(COALESCE(total_cost, 0)) AS cost
    FROM (
        SELECT batch_id, custom_order_id, total_cost FROM public.fabric_moves WHERE batch_id IS NOT NULL AND voided_at IS NULL
        UNION ALL
        SELECT batch_id, custom_order_id, total_cost FROM public.accessory_moves WHERE batch_id IS NOT NULL AND voided_at IS NULL
    ) x
    GROUP BY batch_id, custom_order_id
),
-- Material tagged to an order that is in the batch counts for that order only
direct AS (
    SELECT m.batch_id, m.custom_order_id, m.cost FROM mat m
    WHERE m.custom_order_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.production_batch_lines l WHERE l.batch_id = m.batch_id AND l.custom_order_id = m.custom_order_id)
),
shared AS (
    SELECT b.id AS batch_id,
           b.print_cost
           + COALESCE((SELECT sum(amount) FROM public.production_costs c WHERE c.batch_id = b.id), 0)
           + COALESCE((SELECT sum(cost) FROM mat WHERE mat.batch_id = b.id), 0)
           - COALESCE((SELECT sum(cost) FROM direct WHERE direct.batch_id = b.id), 0) AS cost
    FROM public.production_batches b
)
SELECT
    l.id AS line_id,
    l.batch_id,
    l.custom_order_id,
    l.pieces,
    l.garment_cost,
    COALESCE(d.cost * l.pieces / NULLIF(l.order_pieces, 0), 0)::NUMERIC(14, 2) AS direct_cost,
    COALESCE(s.cost * l.pieces / NULLIF(l.batch_pieces, 0), 0)::NUMERIC(14, 2) AS shared_cost,
    (l.garment_cost
     + COALESCE(d.cost * l.pieces / NULLIF(l.order_pieces, 0), 0)
     + COALESCE(s.cost * l.pieces / NULLIF(l.batch_pieces, 0), 0))::NUMERIC(14, 2) AS total_cost,
    ((l.garment_cost
      + COALESCE(d.cost * l.pieces / NULLIF(l.order_pieces, 0), 0)
      + COALESCE(s.cost * l.pieces / NULLIF(l.batch_pieces, 0), 0)) / l.pieces)::NUMERIC(12, 2) AS cost_per_piece
FROM lines l
LEFT JOIN direct d ON d.batch_id = l.batch_id AND d.custom_order_id = l.custom_order_id
LEFT JOIN shared s ON s.batch_id = l.batch_id;

REVOKE ALL ON public.production_batch_totals, public.production_line_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_batch_totals, public.production_line_costs TO service_role;

-- ----------------------------------------------------------------------
-- Supplier balances: goods + fabric + accessories + printing + garments
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
        UNION ALL
        SELECT supplier_id, total_cost, created_at
        FROM public.accessory_moves
        WHERE kind = 'purchase' AND supplier_id IS NOT NULL AND voided_at IS NULL
        UNION ALL
        SELECT print_supplier_id, print_cost, created_at
        FROM public.production_batches
        WHERE print_supplier_id IS NOT NULL AND status <> 'void' AND print_cost > 0
        UNION ALL
        SELECT b.garments_supplier_id, sum(l.garment_cost), b.created_at
        FROM public.production_batches b
        JOIN public.production_batch_lines l ON l.batch_id = b.id
        WHERE b.garments_supplier_id IS NOT NULL AND b.status <> 'void'
        GROUP BY b.id, b.garments_supplier_id, b.created_at
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
-- accessory_purchase: accessories bought from a supplier, optional payment now.
--   { actor, accessory_id, supplier_id?, qty, cost_per_pc, extra_cost?, note?,
--     paid?, method?, pay_reference?, from_drawer? }
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accessory_purchase(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_item TEXT := NULLIF(p->>'accessory_id', '');
    v_supplier TEXT := NULLIF(p->>'supplier_id', '');
    v_qty INTEGER := COALESCE(NULLIF(p->>'qty', '')::INTEGER, 0);
    v_rate NUMERIC := NULLIF(p->>'cost_per_pc', '')::NUMERIC;
    v_extra NUMERIC := COALESCE(NULLIF(p->>'extra_cost', '')::NUMERIC, 0);
    v_paid NUMERIC := COALESCE(NULLIF(p->>'paid', '')::NUMERIC, 0);
    v_name TEXT;
    v_id TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    SELECT name_en INTO v_name FROM public.custom_accessories WHERE id = v_item;
    IF v_name IS NULL THEN RAISE EXCEPTION 'accessory_not_found' USING ERRCODE = '22023'; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023'; END IF;
    IF v_rate IS NULL OR v_rate < 0 OR v_extra < 0 OR v_paid < 0 THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;
    IF v_paid > 0 AND v_supplier IS NULL THEN RAISE EXCEPTION 'supplier_required' USING ERRCODE = '22023'; END IF;
    IF v_supplier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier) THEN
        RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.accessory_moves (accessory_id, kind, qty, cost_per_pc, total_cost, supplier_id, note, created_by)
    VALUES (v_item, 'purchase', v_qty, v_rate, round(v_qty * v_rate + v_extra, 2), v_supplier,
            NULLIF(btrim(COALESCE(p->>'note', '')), ''), v_actor)
    RETURNING id INTO v_id;

    IF v_paid > 0 THEN
        PERFORM public.supplier_pay(jsonb_build_object(
            'actor', v_actor, 'supplier_id', v_supplier, 'amount', v_paid,
            'method', COALESCE(NULLIF(p->>'method', ''), 'cash'),
            'reference', p->>'pay_reference',
            'note', left('Accessory: ' || v_name || ' ' || v_qty || ' pcs', 200),
            'from_drawer', COALESCE((p->>'from_drawer')::BOOLEAN, false)
        ));
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accessory_purchase(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accessory_purchase(JSONB) TO service_role;

-- ----------------------------------------------------------------------
-- production_batch_save: create or update an open batch, with its lines and extra costs.
--   { actor, id?, title?, note?,
--     print_supplier_id?, print_basis: kg|piece|lump, print_qty?, print_rate?, print_cost? (lump),
--     garments_supplier_id?,
--     lines: [{ custom_order_id?, label?, pieces, sleeve, collar, shorts?, garment_rate, shorts_rate? }],
--     costs: [{ kind, amount, note? }] }
-- Lines and costs are replaced as a whole. Returns the batch id.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.production_batch_save(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_id TEXT := NULLIF(p->>'id', '');
    v_status TEXT;
    v_basis TEXT := COALESCE(NULLIF(p->>'print_basis', ''), 'kg');
    v_qty NUMERIC := NULLIF(p->>'print_qty', '')::NUMERIC;
    v_rate NUMERIC := NULLIF(p->>'print_rate', '')::NUMERIC;
    v_cost NUMERIC;
    v_print_sup TEXT := NULLIF(p->>'print_supplier_id', '');
    v_garm_sup TEXT := NULLIF(p->>'garments_supplier_id', '');
    v_line JSONB;
    v_c JSONB;
    v_pos INTEGER := 0;
    v_order TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    IF v_basis NOT IN ('kg', 'piece', 'lump') THEN RAISE EXCEPTION 'invalid_print_basis' USING ERRCODE = '22023'; END IF;
    IF (v_qty IS NOT NULL AND v_qty < 0) OR (v_rate IS NOT NULL AND v_rate < 0) THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;
    v_cost := CASE WHEN v_basis = 'lump' THEN COALESCE(NULLIF(p->>'print_cost', '')::NUMERIC, 0)
                   ELSE round(COALESCE(v_qty, 0) * COALESCE(v_rate, 0), 2) END;
    IF v_cost < 0 THEN RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023'; END IF;
    IF v_print_sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_print_sup) THEN
        RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = '22023';
    END IF;
    IF v_garm_sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_garm_sup) THEN
        RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = '22023';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.production_batches (title, note, print_supplier_id, print_basis, print_qty, print_rate, print_cost, garments_supplier_id, created_by)
        VALUES (NULLIF(btrim(COALESCE(p->>'title', '')), ''), NULLIF(btrim(COALESCE(p->>'note', '')), ''),
                v_print_sup, v_basis, v_qty, CASE WHEN v_basis = 'lump' THEN NULL ELSE v_rate END, v_cost, v_garm_sup, v_actor)
        RETURNING id INTO v_id;
    ELSE
        SELECT status INTO v_status FROM public.production_batches WHERE id = v_id FOR UPDATE;
        IF v_status IS NULL THEN RAISE EXCEPTION 'batch_not_found' USING ERRCODE = '22023'; END IF;
        IF v_status <> 'open' THEN RAISE EXCEPTION 'batch_not_open' USING ERRCODE = '22023'; END IF;
        UPDATE public.production_batches SET
            title = NULLIF(btrim(COALESCE(p->>'title', '')), ''),
            note = NULLIF(btrim(COALESCE(p->>'note', '')), ''),
            print_supplier_id = v_print_sup,
            print_basis = v_basis,
            print_qty = v_qty,
            print_rate = CASE WHEN v_basis = 'lump' THEN NULL ELSE v_rate END,
            print_cost = v_cost,
            garments_supplier_id = v_garm_sup
        WHERE id = v_id;
    END IF;

    IF p ? 'lines' THEN
        DELETE FROM public.production_batch_lines WHERE batch_id = v_id;
        FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p->'lines', '[]'::jsonb)) LOOP
            v_pos := v_pos + 1;
            v_order := NULLIF(v_line->>'custom_order_id', '');
            IF v_order IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.custom_orders WHERE id = v_order) THEN
                RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023';
            END IF;
            IF COALESCE(NULLIF(v_line->>'pieces', '')::INTEGER, 0) <= 0 THEN
                RAISE EXCEPTION 'invalid_pieces' USING ERRCODE = '22023';
            END IF;
            INSERT INTO public.production_batch_lines
                (batch_id, custom_order_id, label, pieces, sleeve, collar, shorts, garment_rate, shorts_rate, position)
            VALUES (v_id, v_order, NULLIF(btrim(COALESCE(v_line->>'label', '')), ''),
                    (v_line->>'pieces')::INTEGER,
                    COALESCE(NULLIF(v_line->>'sleeve', ''), 'short'),
                    COALESCE(NULLIF(v_line->>'collar', ''), 'round'),
                    COALESCE(NULLIF(v_line->>'shorts', '')::INTEGER, 0),
                    COALESCE(NULLIF(v_line->>'garment_rate', '')::NUMERIC, 0),
                    COALESCE(NULLIF(v_line->>'shorts_rate', '')::NUMERIC, 0),
                    v_pos);
        END LOOP;
    END IF;

    IF p ? 'costs' THEN
        DELETE FROM public.production_costs WHERE batch_id = v_id;
        v_pos := 0;
        FOR v_c IN SELECT * FROM jsonb_array_elements(COALESCE(p->'costs', '[]'::jsonb)) LOOP
            CONTINUE WHEN COALESCE(NULLIF(v_c->>'amount', '')::NUMERIC, 0) = 0;
            v_pos := v_pos + 1;
            INSERT INTO public.production_costs (batch_id, kind, amount, note, position)
            VALUES (v_id, COALESCE(NULLIF(v_c->>'kind', ''), 'other'), (v_c->>'amount')::NUMERIC,
                    NULLIF(btrim(COALESCE(v_c->>'note', '')), ''), v_pos);
        END LOOP;
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.production_batch_save(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.production_batch_save(JSONB) TO service_role;

-- ----------------------------------------------------------------------
-- production_use: take fabric (kg) or accessories (pieces) out of stock for an open batch.
-- The cost is the item's average buying cost right now, kept on the row.
--   { actor, batch_id, material: fabric|accessory, item_id, kind: used|wastage, reason?,
--     kg? (fabric), qty? (accessory), pieces? (jerseys, fabric only), custom_order_id?, note? }
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.production_use(p JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_batch TEXT := NULLIF(p->>'batch_id', '');
    v_item TEXT := NULLIF(p->>'item_id', '');
    v_kind TEXT := COALESCE(NULLIF(p->>'kind', ''), 'used');
    v_reason TEXT := NULLIF(p->>'reason', '');
    v_order TEXT := NULLIF(p->>'custom_order_id', '');
    v_note TEXT := NULLIF(btrim(COALESCE(p->>'note', '')), '');
    v_status TEXT;
    v_avg NUMERIC;
    v_kg NUMERIC;
    v_qty INTEGER;
    v_id TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    SELECT status INTO v_status FROM public.production_batches WHERE id = v_batch;
    IF v_status IS NULL THEN RAISE EXCEPTION 'batch_not_found' USING ERRCODE = '22023'; END IF;
    IF v_status <> 'open' THEN RAISE EXCEPTION 'batch_not_open' USING ERRCODE = '22023'; END IF;
    IF v_kind NOT IN ('used', 'wastage') THEN RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023'; END IF;
    IF v_kind = 'wastage' AND v_reason IS NULL THEN v_reason := 'other'; END IF;
    IF v_kind = 'used' THEN v_reason := NULL; END IF;
    IF v_order IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.custom_orders WHERE id = v_order) THEN
        RAISE EXCEPTION 'order_not_found' USING ERRCODE = '22023';
    END IF;

    IF p->>'material' = 'fabric' THEN
        IF NOT EXISTS (SELECT 1 FROM public.custom_fabrics WHERE id = v_item) THEN
            RAISE EXCEPTION 'fabric_not_found' USING ERRCODE = '22023';
        END IF;
        v_kg := NULLIF(p->>'kg', '')::NUMERIC;
        IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'invalid_kg' USING ERRCODE = '22023'; END IF;
        SELECT avg_cost_per_kg INTO v_avg FROM public.fabric_stock WHERE fabric_id = v_item;
        INSERT INTO public.fabric_moves (fabric_id, kind, reason, kg, pieces, cost_per_kg, total_cost, batch_id, custom_order_id, note, created_by)
        VALUES (v_item, v_kind, v_reason, -v_kg, NULLIF(p->>'pieces', '')::INTEGER, v_avg,
                CASE WHEN v_avg IS NULL THEN NULL ELSE round(v_kg * v_avg, 2) END,
                v_batch, v_order, v_note, v_actor)
        RETURNING id INTO v_id;
    ELSIF p->>'material' = 'accessory' THEN
        IF NOT EXISTS (SELECT 1 FROM public.custom_accessories WHERE id = v_item) THEN
            RAISE EXCEPTION 'accessory_not_found' USING ERRCODE = '22023';
        END IF;
        v_qty := NULLIF(p->>'qty', '')::INTEGER;
        IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE = '22023'; END IF;
        SELECT avg_cost INTO v_avg FROM public.accessory_stock WHERE accessory_id = v_item;
        INSERT INTO public.accessory_moves (accessory_id, kind, reason, qty, cost_per_pc, total_cost, batch_id, custom_order_id, note, created_by)
        VALUES (v_item, v_kind, v_reason, -v_qty, v_avg,
                CASE WHEN v_avg IS NULL THEN NULL ELSE round(v_qty * v_avg, 2) END,
                v_batch, v_order, v_note, v_actor)
        RETURNING id INTO v_id;
    ELSE
        RAISE EXCEPTION 'invalid_material' USING ERRCODE = '22023';
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.production_use(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.production_use(JSONB) TO service_role;

-- ----------------------------------------------------------------------
-- production_batch_status: { actor, id, status: open|done|void, reason? }
--   done  locks the batch (costs final). open  reopens a done batch.
--   void  needs a reason; gives the batch's fabric and accessories back to stock
--         and takes its printing / garments charge off the suppliers' due. Final.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.production_batch_status(p JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := NULLIF(p->>'actor', '')::UUID;
    v_id TEXT := NULLIF(p->>'id', '');
    v_to TEXT := p->>'status';
    v_reason TEXT := NULLIF(btrim(COALESCE(p->>'reason', '')), '');
    v_status TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    SELECT status INTO v_status FROM public.production_batches WHERE id = v_id FOR UPDATE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'batch_not_found' USING ERRCODE = '22023'; END IF;
    IF v_status = 'void' THEN RAISE EXCEPTION 'batch_void' USING ERRCODE = '22023'; END IF;

    IF v_to = 'done' THEN
        IF NOT EXISTS (SELECT 1 FROM public.production_batch_lines WHERE batch_id = v_id) THEN
            RAISE EXCEPTION 'batch_empty' USING ERRCODE = '22023';
        END IF;
        UPDATE public.production_batches SET status = 'done', done_at = now() WHERE id = v_id;
    ELSIF v_to = 'open' THEN
        UPDATE public.production_batches SET status = 'open', done_at = NULL WHERE id = v_id;
    ELSIF v_to = 'void' THEN
        IF v_reason IS NULL THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
        PERFORM set_config('app.audit_reason', v_reason, true);
        UPDATE public.fabric_moves SET voided_at = now(), voided_by = v_actor, void_reason = 'Batch void: ' || v_reason
        WHERE batch_id = v_id AND voided_at IS NULL;
        UPDATE public.accessory_moves SET voided_at = now(), voided_by = v_actor, void_reason = 'Batch void: ' || v_reason
        WHERE batch_id = v_id AND voided_at IS NULL;
        UPDATE public.production_batches
        SET status = 'void', voided_at = now(), voided_by = v_actor, void_reason = v_reason
        WHERE id = v_id;
    ELSE
        RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.production_batch_status(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.production_batch_status(JSONB) TO service_role;

-- ----------------------------------------------------------------------
-- Audit log: who changed what
-- ----------------------------------------------------------------------
DO $$
BEGIN
    IF to_regproc('public.audit_row_change') IS NULL THEN RETURN; END IF;
    DROP TRIGGER IF EXISTS audit_custom_accessories ON public.custom_accessories;
    CREATE TRIGGER audit_custom_accessories AFTER INSERT OR UPDATE OR DELETE ON public.custom_accessories
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
    DROP TRIGGER IF EXISTS audit_accessory_moves ON public.accessory_moves;
    CREATE TRIGGER audit_accessory_moves AFTER INSERT OR UPDATE OR DELETE ON public.accessory_moves
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
    DROP TRIGGER IF EXISTS audit_production_batches ON public.production_batches;
    CREATE TRIGGER audit_production_batches AFTER INSERT OR UPDATE OR DELETE ON public.production_batches
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
    DROP TRIGGER IF EXISTS audit_production_batch_lines ON public.production_batch_lines;
    CREATE TRIGGER audit_production_batch_lines AFTER INSERT OR UPDATE OR DELETE ON public.production_batch_lines
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
    DROP TRIGGER IF EXISTS audit_production_costs ON public.production_costs;
    CREATE TRIGGER audit_production_costs AFTER INSERT OR UPDATE OR DELETE ON public.production_costs
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
END $$;
