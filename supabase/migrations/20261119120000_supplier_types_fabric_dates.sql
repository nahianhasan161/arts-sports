-- Shop feedback, round 1 (2026-11-19):
--
--   1. suppliers.categories        what a supplier sells us: products, fabric, accessories,
--                                  printing, garments (several allowed; empty = not sorted yet).
--                                  Existing suppliers are tagged from what they already supplied.
--   2. fabric_moves.move_date      the day the fabric was bought / used (Dhaka), so a purchase
--                                  entered late keeps its real date. fabric_purchase() takes `date`.
--   3. pos_sales.customer_address  the address on a shop bill (home delivery);
--      customers.address           the last address we have for that customer.
--
-- (The custom-jersey logo type needs no column: it is kept in custom_orders.estimate_breakdown,
--  next to the logo price it decided.)
--
-- Needs 20261114100000, 20261117120000, 20261118140000, 20261118150000 first. Safe to run again.

-- ----------------------------------------------------------------------
-- 1. Supplier types
-- ----------------------------------------------------------------------
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_categories_check;
ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_categories_check
    CHECK (categories <@ ARRAY['products', 'fabric', 'accessories', 'printing', 'garments']::TEXT[]);
CREATE INDEX IF NOT EXISTS suppliers_categories_idx ON public.suppliers USING gin (categories);

-- Suppliers not sorted yet get the types they have already supplied.
UPDATE public.suppliers s
SET categories = x.cats
FROM (
    SELECT s2.id,
           array_remove(ARRAY[
               CASE WHEN EXISTS (SELECT 1 FROM public.stock_receipts r WHERE r.supplier_id = s2.id) THEN 'products' END,
               CASE WHEN EXISTS (SELECT 1 FROM public.fabric_moves f WHERE f.supplier_id = s2.id AND f.kind = 'purchase') THEN 'fabric' END,
               CASE WHEN EXISTS (SELECT 1 FROM public.accessory_moves a WHERE a.supplier_id = s2.id AND a.kind = 'purchase') THEN 'accessories' END,
               CASE WHEN EXISTS (SELECT 1 FROM public.production_batches b WHERE b.print_supplier_id = s2.id) THEN 'printing' END,
               CASE WHEN EXISTS (SELECT 1 FROM public.production_batches b WHERE b.garments_supplier_id = s2.id) THEN 'garments' END
           ]::TEXT[], NULL) AS cats
    FROM public.suppliers s2
    WHERE s2.categories = '{}'
) x
WHERE s.id = x.id AND x.cats <> '{}';

-- ----------------------------------------------------------------------
-- 2. Fabric: the date of each entry
-- ----------------------------------------------------------------------
ALTER TABLE public.fabric_moves ADD COLUMN IF NOT EXISTS move_date DATE;
UPDATE public.fabric_moves SET move_date = (created_at AT TIME ZONE 'Asia/Dhaka')::DATE WHERE move_date IS NULL;
ALTER TABLE public.fabric_moves ALTER COLUMN move_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::DATE);
ALTER TABLE public.fabric_moves ALTER COLUMN move_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS fabric_moves_date_idx ON public.fabric_moves (move_date DESC, created_at DESC);

-- Same as 20261118140000 plus `date` (YYYY-MM-DD; default today in Dhaka; not in the future).
--   { actor, fabric_id, supplier_id?, kg, cost_per_kg, extra_cost?, note?, date?,
--     paid?, method?, pay_reference?, from_drawer? }
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
    v_today DATE := (now() AT TIME ZONE 'Asia/Dhaka')::DATE;
    v_date DATE;
    v_name TEXT;
    v_id TEXT;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(v_actor::TEXT, ''), true);
    BEGIN
        v_date := COALESCE(NULLIF(p->>'date', '')::DATE, v_today);
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
    END;
    IF v_date > v_today OR v_date < v_today - 3650 THEN RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023'; END IF;
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

    INSERT INTO public.fabric_moves (fabric_id, kind, kg, cost_per_kg, total_cost, supplier_id, note, created_by, move_date)
    VALUES (v_fabric, 'purchase', v_kg, v_rate, round(v_kg * v_rate + v_extra, 2), v_supplier,
            NULLIF(btrim(COALESCE(p->>'note', '')), ''), v_actor, v_date)
    RETURNING id INTO v_id;

    IF v_paid > 0 THEN
        PERFORM public.supplier_pay(jsonb_build_object(
            'actor', v_actor, 'supplier_id', v_supplier, 'amount', v_paid,
            'method', COALESCE(NULLIF(p->>'method', ''), 'cash'),
            'reference', p->>'pay_reference',
            'note', left('Fabric: ' || v_name || ' ' || v_kg || ' kg (' || to_char(v_date, 'DD Mon YYYY') || ')', 200),
            'from_drawer', COALESCE((p->>'from_drawer')::BOOLEAN, false)
        ));
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fabric_purchase(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fabric_purchase(JSONB) TO service_role;

-- ----------------------------------------------------------------------
-- 3. Address on a shop bill, and the customer's last address
-- ----------------------------------------------------------------------
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.pos_sales DROP CONSTRAINT IF EXISTS pos_sales_customer_address_check;
ALTER TABLE public.pos_sales
    ADD CONSTRAINT pos_sales_customer_address_check
    CHECK (customer_address IS NULL OR char_length(customer_address) <= 500);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_address_check;
ALTER TABLE public.customers
    ADD CONSTRAINT customers_address_check
    CHECK (address IS NULL OR char_length(address) <= 500);
