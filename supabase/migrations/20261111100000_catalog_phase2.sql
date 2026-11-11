-- Phase 2: a sports-store catalogue.
--
--   catalog_terms / product_terms   teams, leagues, players, seasons, brands and
--                                   editions. Filters and /team/<slug> pages.
--   collections / collection_products   campaign or hand-picked lists
--                                   ("BPL 2027", "Eid offer", "New", "Bestseller").
--   product_reviews                 verified-buyer reviews, approved by staff
--   product_questions               questions and answers on a product page
--   social proof                    real numbers only, thresholds from app_settings
--
-- Every number shown to a shopper is computed from real rows. A figure under
-- its threshold is returned as NULL so the page hides it.
--
-- Staff access uses products.manage (catalogue) for everything here.
-- Safe to re-run.

-- ----------------------------------------------------------------------
-- Terms (team, league, player, season, brand, edition)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_terms (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type TEXT NOT NULL CHECK (type IN ('team', 'league', 'player', 'season', 'brand', 'edition')),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
    name_en TEXT NOT NULL,
    name_bn TEXT,
    description_en TEXT,
    description_bn TEXT,
    image_url TEXT,
    -- For editions: fabric, fit, logo, price_note, image. Free-form JSON the
    -- admin edits; the product page renders the keys it knows.
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (type, slug)
);
CREATE INDEX IF NOT EXISTS catalog_terms_type_idx ON public.catalog_terms (type, display_order);

CREATE TABLE IF NOT EXISTS public.product_terms (
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    term_id TEXT NOT NULL REFERENCES public.catalog_terms(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, term_id)
);
CREATE INDEX IF NOT EXISTS product_terms_term_idx ON public.product_terms (term_id);

-- ----------------------------------------------------------------------
-- Collections
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
    title_en TEXT NOT NULL,
    title_bn TEXT,
    description_en TEXT,
    description_bn TEXT,
    banner_url TEXT,
    -- manual: the products listed in collection_products.
    -- new: published in the last 30 days. bestseller: most sold in 30 days.
    kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'new', 'bestseller')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    -- Countdown only counts down to the real ends_at.
    show_countdown BOOLEAN NOT NULL DEFAULT false,
    show_in_menu BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_products (
    collection_id TEXT NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS collection_products_product_idx ON public.collection_products (product_id);

-- ----------------------------------------------------------------------
-- Reviews and questions
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title TEXT,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 3 AND 3000),
    photos TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(photos) <= 4),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    staff_reply TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON public.product_reviews (product_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_questions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    question TEXT NOT NULL CHECK (char_length(question) BETWEEN 3 AND 1000),
    answer TEXT,
    answered_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_questions_product_idx ON public.product_questions (product_id, status, created_at DESC);

-- updated_at triggers
DROP TRIGGER IF EXISTS catalog_terms_set_updated_at ON public.catalog_terms;
CREATE TRIGGER catalog_terms_set_updated_at BEFORE UPDATE ON public.catalog_terms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS collections_set_updated_at ON public.collections;
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON public.collections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------
ALTER TABLE public.catalog_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read terms" ON public.catalog_terms;
CREATE POLICY "Public read terms" ON public.catalog_terms FOR SELECT
    USING (is_active OR public.has_permission('products.manage'));
DROP POLICY IF EXISTS "Staff write terms" ON public.catalog_terms;
CREATE POLICY "Staff write terms" ON public.catalog_terms FOR ALL TO authenticated
    USING (public.has_permission('products.manage')) WITH CHECK (public.has_permission('products.manage'));

DROP POLICY IF EXISTS "Public read product terms" ON public.product_terms;
CREATE POLICY "Public read product terms" ON public.product_terms FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff write product terms" ON public.product_terms;
CREATE POLICY "Staff write product terms" ON public.product_terms FOR ALL TO authenticated
    USING (public.has_permission('products.manage')) WITH CHECK (public.has_permission('products.manage'));

DROP POLICY IF EXISTS "Public read collections" ON public.collections;
CREATE POLICY "Public read collections" ON public.collections FOR SELECT
    USING (
        public.has_permission('products.manage')
        OR (is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()))
    );
DROP POLICY IF EXISTS "Staff write collections" ON public.collections;
CREATE POLICY "Staff write collections" ON public.collections FOR ALL TO authenticated
    USING (public.has_permission('products.manage')) WITH CHECK (public.has_permission('products.manage'));

DROP POLICY IF EXISTS "Public read collection products" ON public.collection_products;
CREATE POLICY "Public read collection products" ON public.collection_products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff write collection products" ON public.collection_products;
CREATE POLICY "Staff write collection products" ON public.collection_products FOR ALL TO authenticated
    USING (public.has_permission('products.manage')) WITH CHECK (public.has_permission('products.manage'));

-- Reviews and questions are written through the RPCs below (which check
-- the buyer); the table itself is read-only to shoppers.
DROP POLICY IF EXISTS "Public read approved reviews" ON public.product_reviews;
CREATE POLICY "Public read approved reviews" ON public.product_reviews FOR SELECT
    USING (status = 'approved' OR user_id = auth.uid() OR public.has_permission('products.manage'));
DROP POLICY IF EXISTS "Staff moderate reviews" ON public.product_reviews;
CREATE POLICY "Staff moderate reviews" ON public.product_reviews FOR UPDATE TO authenticated
    USING (public.has_permission('products.manage')) WITH CHECK (public.has_permission('products.manage'));
DROP POLICY IF EXISTS "Staff delete reviews" ON public.product_reviews;
CREATE POLICY "Staff delete reviews" ON public.product_reviews FOR DELETE TO authenticated
    USING (public.has_permission('products.manage'));

DROP POLICY IF EXISTS "Public read approved questions" ON public.product_questions;
CREATE POLICY "Public read approved questions" ON public.product_questions FOR SELECT
    USING (status = 'approved' OR user_id = auth.uid() OR public.has_permission('products.manage'));
DROP POLICY IF EXISTS "Staff answer questions" ON public.product_questions;
CREATE POLICY "Staff answer questions" ON public.product_questions FOR UPDATE TO authenticated
    USING (public.has_permission('products.manage')) WITH CHECK (public.has_permission('products.manage'));
DROP POLICY IF EXISTS "Staff delete questions" ON public.product_questions;
CREATE POLICY "Staff delete questions" ON public.product_questions FOR DELETE TO authenticated
    USING (public.has_permission('products.manage'));

-- ----------------------------------------------------------------------
-- Which orders count. A sale is any order that is not cancelled or
-- refunded; a delivered order is what lets someone review.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_bought_product(p_product_id TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        LEFT JOIN public.customers c ON c.user_id = p_user_id
        WHERE oi.product_id = p_product_id
          AND (o.user_id = p_user_id OR (c.phone IS NOT NULL AND o.customer_phone = c.phone))
          AND (o.delivered_at IS NOT NULL OR o.status = 'delivered')
    );
$$;
REVOKE EXECUTE ON FUNCTION public.has_bought_product(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------
-- Reviews
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_review(
    p_product_id TEXT, p_rating INTEGER, p_title TEXT, p_body TEXT, p_photos TEXT[] DEFAULT '{}'
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_name TEXT;
    v_id TEXT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
    IF NOT public.has_bought_product(p_product_id, v_uid) THEN RAISE EXCEPTION 'not_a_buyer'; END IF;

    SELECT COALESCE(NULLIF(c.name, ''), NULLIF(pr.full_name, ''), 'Customer')
      INTO v_name
      FROM (SELECT 1) x
      LEFT JOIN public.customers c ON c.user_id = v_uid
      LEFT JOIN public.profiles pr ON pr.id = v_uid;

    INSERT INTO public.product_reviews (product_id, user_id, author_name, rating, title, body, photos)
    VALUES (p_product_id, v_uid, split_part(v_name, ' ', 1), p_rating,
            NULLIF(left(trim(COALESCE(p_title, '')), 120), ''), trim(p_body),
            COALESCE(p_photos, '{}'))
    ON CONFLICT (product_id, user_id) DO UPDATE
        SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body,
            photos = EXCLUDED.photos, status = 'pending', reviewed_at = NULL
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_review(TEXT, INTEGER, TEXT, TEXT, TEXT[]) TO authenticated;

-- Can this signed-in person review the product, and have they already?
CREATE OR REPLACE FUNCTION public.my_review_state(p_product_id TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'signed_in', auth.uid() IS NOT NULL,
        'can_review', auth.uid() IS NOT NULL AND public.has_bought_product(p_product_id, auth.uid()),
        'review', (SELECT to_jsonb(r) FROM public.product_reviews r
                    WHERE r.product_id = p_product_id AND r.user_id = auth.uid())
    );
$$;
GRANT EXECUTE ON FUNCTION public.my_review_state(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.product_rating_summary(p_product_id TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'count', COUNT(*),
        'average', CASE WHEN COUNT(*) > 0 THEN round(AVG(rating)::numeric, 1) END,
        'stars', jsonb_build_object(
            '1', COUNT(*) FILTER (WHERE rating = 1), '2', COUNT(*) FILTER (WHERE rating = 2),
            '3', COUNT(*) FILTER (WHERE rating = 3), '4', COUNT(*) FILTER (WHERE rating = 4),
            '5', COUNT(*) FILTER (WHERE rating = 5))
    )
    FROM public.product_reviews WHERE product_id = p_product_id AND status = 'approved';
$$;
GRANT EXECUTE ON FUNCTION public.product_rating_summary(TEXT) TO anon, authenticated;

-- Verified-buyer flag for approved reviews, without exposing orders.
CREATE OR REPLACE FUNCTION public.approved_reviews(p_product_id TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (id TEXT, author_name TEXT, rating INTEGER, title TEXT, body TEXT, photos TEXT[],
               staff_reply TEXT, created_at TIMESTAMPTZ, verified BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT r.id, r.author_name, r.rating, r.title, r.body, r.photos, r.staff_reply, r.created_at,
           public.has_bought_product(r.product_id, r.user_id)
    FROM public.product_reviews r
    WHERE r.product_id = p_product_id AND r.status = 'approved'
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;
GRANT EXECUTE ON FUNCTION public.approved_reviews(TEXT, INTEGER) TO anon, authenticated;

-- ----------------------------------------------------------------------
-- Questions
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ask_question(p_product_id TEXT, p_question TEXT, p_name TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id TEXT;
    v_name TEXT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
    IF (SELECT count(*) FROM public.product_questions
         WHERE user_id = v_uid AND created_at > now() - interval '1 hour') >= 5 THEN
        RAISE EXCEPTION 'too_many_questions';
    END IF;
    SELECT COALESCE(NULLIF(trim(p_name), ''), NULLIF(c.name, ''), NULLIF(pr.full_name, ''), 'Customer')
      INTO v_name
      FROM (SELECT 1) x
      LEFT JOIN public.customers c ON c.user_id = v_uid
      LEFT JOIN public.profiles pr ON pr.id = v_uid;
    INSERT INTO public.product_questions (product_id, user_id, author_name, question)
    VALUES (p_product_id, v_uid, split_part(v_name, ' ', 1), trim(p_question))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ask_question(TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------
-- Social proof settings (app_settings) and the numbers
-- ----------------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES
    ('proof_low_stock_max',     '5'),
    ('proof_recent_sales_min',  '5'),
    ('proof_viewers_min',       '3'),
    ('proof_bestseller_min',    '10'),
    ('proof_recent_popup',      'off'),
    ('proof_enabled',           'on')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.setting_text(p_key TEXT, p_default TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = p_key), p_default); $$;
REVOKE EXECUTE ON FUNCTION public.setting_text(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Units sold in a window, from real orders that were not cancelled or refunded.
CREATE OR REPLACE FUNCTION public.units_sold(p_product_id TEXT, p_since TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(SUM(oi.quantity), 0)::INTEGER
    FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id AND o.created_at >= p_since
      AND o.status NOT IN ('cancelled', 'refunded', 'failed');
$$;
REVOKE EXECUTE ON FUNCTION public.units_sold(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- Everything the product page shows as proof, thresholds already applied:
-- a field is NULL when it is under its limit, so the page just hides it.
CREATE OR REPLACE FUNCTION public.product_social_proof(p_product_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_on BOOLEAN := public.setting_text('proof_enabled', 'on') = 'on';
    v_24h INTEGER; v_30d INTEGER;
    v_published TIMESTAMPTZ;
    v_recent_min INTEGER := public.setting_numeric('proof_recent_sales_min', 5)::INTEGER;
    v_best_min INTEGER := public.setting_numeric('proof_bestseller_min', 10)::INTEGER;
BEGIN
    IF NOT v_on THEN RETURN jsonb_build_object('enabled', false); END IF;
    v_24h := public.units_sold(p_product_id, now() - interval '24 hours');
    v_30d := public.units_sold(p_product_id, now() - interval '30 days');
    SELECT published_at INTO v_published FROM public.products WHERE id = p_product_id;
    RETURN jsonb_build_object(
        'enabled', true,
        'sold_24h', CASE WHEN v_24h >= v_recent_min THEN v_24h END,
        'is_bestseller', v_30d >= v_best_min,
        'is_new', v_published IS NOT NULL AND v_published > now() - interval '30 days',
        'low_stock_max', public.setting_numeric('proof_low_stock_max', 5)::INTEGER,
        'viewers_min', public.setting_numeric('proof_viewers_min', 3)::INTEGER
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.product_social_proof(TEXT) TO anon, authenticated;

-- Bestseller and new flags for a list of products (cards in the grid).
CREATE OR REPLACE FUNCTION public.product_badges_bulk(p_product_ids TEXT[])
RETURNS TABLE (product_id TEXT, is_bestseller BOOLEAN, is_new BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.id,
           (public.setting_text('proof_enabled', 'on') = 'on'
              AND public.units_sold(p.id, now() - interval '30 days') >= public.setting_numeric('proof_bestseller_min', 10)),
           (public.setting_text('proof_enabled', 'on') = 'on'
              AND p.published_at IS NOT NULL AND p.published_at > now() - interval '30 days')
    FROM public.products p WHERE p.id = ANY (p_product_ids);
$$;
GRANT EXECUTE ON FUNCTION public.product_badges_bulk(TEXT[]) TO anon, authenticated;

-- Most-sold products over 30 days, for the Bestsellers collection.
CREATE OR REPLACE FUNCTION public.bestseller_product_ids(p_limit INTEGER DEFAULT 24)
RETURNS TABLE (product_id TEXT, units INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT oi.product_id, SUM(oi.quantity)::INTEGER AS units
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.products p ON p.id = oi.product_id
    WHERE o.created_at > now() - interval '30 days'
      AND o.status NOT IN ('cancelled', 'refunded', 'failed')
      AND p.status = 'published' AND p.deleted_at IS NULL
    GROUP BY oi.product_id
    ORDER BY units DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;
GRANT EXECUTE ON FUNCTION public.bestseller_product_ids(INTEGER) TO anon, authenticated;

-- Small "someone in Rajshahi bought ..." popup: district and product only,
-- never a name or phone. Empty unless an admin turned it on.
CREATE OR REPLACE FUNCTION public.recent_purchases(p_limit INTEGER DEFAULT 5)
RETURNS TABLE (district TEXT, product_title TEXT, product_slug TEXT, image TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT o.district, oi.title, p.slug, oi.image, o.created_at
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.products p ON p.id = oi.product_id
    WHERE public.setting_text('proof_recent_popup', 'off') = 'on'
      AND o.status NOT IN ('cancelled', 'refunded', 'failed')
      AND o.district IS NOT NULL AND o.district <> ''
      AND o.created_at > now() - interval '3 days'
      AND p.status = 'published' AND p.deleted_at IS NULL
    ORDER BY o.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 10);
$$;
GRANT EXECUTE ON FUNCTION public.recent_purchases(INTEGER) TO anon, authenticated;

-- ----------------------------------------------------------------------
-- Starting data: the four sports' editions. Teams/leagues are added by the
-- admin in /admin/catalog.
-- ----------------------------------------------------------------------
INSERT INTO public.catalog_terms (type, slug, name_en, name_bn, details, display_order) VALUES
    ('edition', 'player-edition', 'Player Edition', 'প্লেয়ার এডিশন',
     '{"fabric":"Lightweight performance mesh, same as on-pitch kits","fit":"Slim, athletic cut","logo":"Heat-pressed logos and badges","price_note":"Higher price, match-day quality"}'::jsonb, 10),
    ('edition', 'fan-edition', 'Fan Edition', 'ফ্যান এডিশন',
     '{"fabric":"Soft everyday mesh","fit":"Regular, relaxed cut","logo":"Embroidered or printed logos","price_note":"Everyday price, made for supporters"}'::jsonb, 20)
ON CONFLICT (type, slug) DO NOTHING;

INSERT INTO public.collections (slug, title_en, title_bn, kind, show_in_menu, display_order) VALUES
    ('new-arrivals', 'New arrivals', 'নতুন এসেছে', 'new', true, 10),
    ('bestsellers', 'Bestsellers', 'বেস্টসেলার', 'bestseller', true, 20)
ON CONFLICT (slug) DO NOTHING;
