-- 1. pos_register_grid: the register's product grid in one round trip.
-- 2. Payments: the browser can no longer write a "successful" payment.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. pos_register_grid(showroom, category, q, ids, limit, offset)
--    Returns { products: PosProduct[], scanned: variant_id | null, has_more }.
--    Browsing (no q / ids) is paged with p_limit/p_offset for lazy loading.
--    Picks products by: ids (copying a past sale) > q (exact barcode/SKU, else
--    title / variant SKU match, 12 max) > category (60 max) > first 60 by name.
--    Prices come from get_effective_prices(), the same source as checkout.
--    Called only by the server with the service key, after requirePermission.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pos_register_grid(TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.pos_register_grid(TEXT, TEXT, TEXT, TEXT[], INT, INT);
CREATE FUNCTION public.pos_register_grid(
    p_showroom_id TEXT,
    p_category_id TEXT DEFAULT NULL,
    p_q TEXT DEFAULT NULL,
    p_ids TEXT[] DEFAULT NULL,
    p_limit INT DEFAULT 60,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_q TEXT := NULLIF(btrim(COALESCE(p_q, '')), '');
    v_ids TEXT[];
    v_exact TEXT[];
    v_scanned TEXT;
    v_products JSONB;
    v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100);
    v_more BOOLEAN := FALSE;
BEGIN
    IF p_ids IS NOT NULL AND cardinality(p_ids) > 0 THEN
        v_ids := p_ids[1:100];
    ELSIF v_q IS NOT NULL THEN
        SELECT array_agg(pv.id) INTO v_exact
        FROM public.product_variants pv
        WHERE pv.barcode = v_q OR pv.sku = v_q;
        IF v_exact IS NOT NULL THEN
            IF cardinality(v_exact) = 1 THEN v_scanned := v_exact[1]; END IF;
            SELECT array_agg(DISTINCT pv.product_id) INTO v_ids
            FROM public.product_variants pv WHERE pv.id = ANY (v_exact);
        ELSE
            SELECT array_agg(id) INTO v_ids FROM (
                SELECT p.id FROM public.products p
                WHERE p.deleted_at IS NULL
                  AND (p.title ILIKE '%' || v_q || '%'
                       OR EXISTS (SELECT 1 FROM public.product_variants pv
                                  WHERE pv.product_id = p.id AND pv.sku ILIKE '%' || v_q || '%'))
                ORDER BY p.title LIMIT 12
            ) s;
        END IF;
    ELSE
        SELECT array_agg(id) INTO v_ids FROM (
            SELECT p.id FROM public.products p
            WHERE p.deleted_at IS NULL
              AND (p_category_id IS NULL OR p.category_id = p_category_id OR p.sub_category_id = p_category_id)
            ORDER BY p.title, p.id
            LIMIT v_limit + 1 OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) s;
        -- One extra row tells the register whether another page exists.
        IF cardinality(v_ids) > v_limit THEN
            v_more := TRUE;
            v_ids := v_ids[1:v_limit];
        END IF;
    END IF;

    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('products', '[]'::jsonb, 'scanned', NULL, 'has_more', FALSE);
    END IF;

    WITH prices AS (
        SELECT * FROM public.get_effective_prices(v_ids)
    ),
    vars AS (
        SELECT pv.product_id,
               jsonb_agg(jsonb_build_object(
                   'variant_id', pv.id,
                   'label', concat_ws(' / ', c.name, sz.name),
                   'sku', pv.sku,
                   'barcode', pv.barcode,
                   'available', GREATEST(0, COALESCE(ps.quantity, 0) - COALESCE(ps.reserved_quantity, 0))
               ) ORDER BY sz.name NULLS FIRST, c.name NULLS FIRST) AS list
        FROM public.product_variants pv
        LEFT JOIN public.colors c ON c.id = pv.color_id
        LEFT JOIN public.sizes sz ON sz.id = pv.size_id
        LEFT JOIN public.product_stock ps ON ps.variant_id = pv.id AND ps.showroom_id = p_showroom_id
        WHERE pv.product_id = ANY (v_ids) AND pv.is_active
        GROUP BY pv.product_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'product_id', p.id,
               'title', p.title,
               'image', CASE WHEN jsonb_typeof(to_jsonb(p.images)) = 'array' THEN to_jsonb(p.images) ->> 0 END,
               'price', pr.final_price,
               'base_price', pr.base_price,
               'variants', COALESCE(v.list, jsonb_build_array(jsonb_build_object(
                   'variant_id', NULL, 'label', '', 'sku', NULL, 'barcode', NULL,
                   'available', GREATEST(0, COALESCE(p.stock, 0))
               )))
           ) ORDER BY p.title), '[]'::jsonb)
    INTO v_products
    FROM public.products p
    JOIN prices pr ON pr.product_id = p.id
    LEFT JOIN vars v ON v.product_id = p.id
    WHERE p.id = ANY (v_ids);

    RETURN jsonb_build_object('products', v_products, 'scanned', v_scanned, 'has_more', v_more);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_register_grid(TEXT, TEXT, TEXT, TEXT[], INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_register_grid(TEXT, TEXT, TEXT, TEXT[], INT, INT) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Payments insert guard.
--    Before: "Anyone can create payments" WITH CHECK (true), so anyone holding
--    the public anon key could insert a 'successful' payment of any amount.
--    Now: admins may insert anything; everyone else may only add an
--    'initiated' charge, for their own (or a guest) order, no larger than the
--    order total. Gateways mark payments successful with the service key.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can create payments" ON public.payments;
DROP POLICY IF EXISTS "Customers create initiated charges" ON public.payments;
DROP POLICY IF EXISTS "Admins create payments" ON public.payments;

CREATE POLICY "Admins create payments" ON public.payments
    FOR INSERT WITH CHECK (public.is_admin());

-- Runs as owner so a guest (who cannot read orders) can still record its COD charge.
CREATE OR REPLACE FUNCTION public.payment_insert_allowed(p_order_id TEXT, p_user_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
          AND p_amount > 0
          AND p_amount <= o.total_amount
          AND (o.user_id IS NULL OR o.user_id = auth.uid())
          AND p_user_id IS NOT DISTINCT FROM o.user_id
    );
$fn$;

CREATE POLICY "Customers create initiated charges" ON public.payments
    FOR INSERT WITH CHECK (
        type = 'charge'
        AND status = 'initiated'
        AND public.payment_insert_allowed(order_id, user_id, amount)
    );
