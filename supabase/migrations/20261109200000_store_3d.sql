-- ==========================================================
-- 3D STORE DATA (arts-sports-3d site, later the Flutter app)
--
-- Three things the 3D storefront needs that the catalog does not have:
--
--   store_scenes      the whole shop (walls, hotspots, rail) as one JSON
--                     document, so the web and the app draw the same shop
--                     and an admin edit changes both.
--   jersey_templates  layered front/back art for the custom jersey preview.
--   product_3d        per-product extras: transparent cut-outs for the
--                     jersey rail, name/number print price, 360° frames.
--
-- WHY product_3d IS A SEPARATE TABLE AND NOT NEW COLUMNS ON product_images
--
-- The plan (docs/3d-store-and-app.md) suggested adding a `spin` kind to the
-- media table. That table is projected into products.images by triggers
-- (20260926160000_product_media.sql) and capped at 12 rows per product. A
-- spin row there would land in products.images as a broken image on the
-- current storefront and eat into the cap. Cut-outs have the same problem:
-- they are not gallery images. A one-row-per-product side table changes
-- nothing on the existing site.
--
-- Print price lives here, in the database, because the order total is always
-- computed on the server (order_pricing_integrity). A price that only exists
-- in page code could be edited by a shopper.
--
-- Written for the shared Supabase project; applied from the artssports repo
-- so there is a single migration history.
-- ==========================================================

-- ------------------------------------------------------------
-- 1. store_scenes
--
-- `version` goes up on every change to `data`. Clients (the Flutter app in
-- particular) keep their cached scene until they see a higher version.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_scenes (
    id           TEXT PRIMARY KEY,                -- 'main' for the shop
    version      INTEGER NOT NULL DEFAULT 1,
    data         JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by   UUID REFERENCES auth.users ON DELETE SET NULL,
    CONSTRAINT store_scenes_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE OR REPLACE FUNCTION public.store_scenes_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.data IS DISTINCT FROM OLD.data THEN
        NEW.version := OLD.version + 1;
    ELSE
        -- Never let a client write the version by hand: an app holding a
        -- higher number would stop downloading real changes.
        NEW.version := OLD.version;
    END IF;
    NEW.updated_at := timezone('utc'::text, now());
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_scenes_bump_version ON public.store_scenes;
CREATE TRIGGER store_scenes_bump_version
    BEFORE UPDATE ON public.store_scenes
    FOR EACH ROW EXECUTE FUNCTION public.store_scenes_bump_version();

ALTER TABLE public.store_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read published store scenes" ON public.store_scenes;
CREATE POLICY "Read published store scenes"
    ON public.store_scenes FOR SELECT
    USING (is_published OR public.is_admin());

DROP POLICY IF EXISTS "Admins write store scenes" ON public.store_scenes;
CREATE POLICY "Admins write store scenes"
    ON public.store_scenes FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 2. jersey_templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jersey_templates (
    id          TEXT PRIMARY KEY,                 -- slug, e.g. 'striker-01'
    name        TEXT NOT NULL,
    sport       TEXT NOT NULL DEFAULT 'football',
    data        JSONB NOT NULL,                   -- { front: {...}, back: {...} }
    is_active   BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT jersey_templates_id_slug CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT jersey_templates_has_sides CHECK (data ? 'front' AND data ? 'back')
);

DROP TRIGGER IF EXISTS jersey_templates_set_updated_at ON public.jersey_templates;
CREATE TRIGGER jersey_templates_set_updated_at
    BEFORE UPDATE ON public.jersey_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.jersey_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read active jersey templates" ON public.jersey_templates;
CREATE POLICY "Read active jersey templates"
    ON public.jersey_templates FOR SELECT
    USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS "Admins write jersey templates" ON public.jersey_templates;
CREATE POLICY "Admins write jersey templates"
    ON public.jersey_templates FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 3. product_3d
--
-- Image columns hold storage paths relative to the media base URL
-- (e.g. 'cutout/sky-stripe-home/front'), without size or extension: the
-- client appends '/480.webp' etc. from the sizes the upload script wrote.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_3d (
    product_id        TEXT PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    cutout_front      TEXT,
    cutout_back       TEXT,
    cutout_sizes      INTEGER[] NOT NULL DEFAULT '{480,960}',

    print_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    print_price       NUMERIC(10,2),
    print_name_max    INTEGER NOT NULL DEFAULT 12,

    spin_frame_count  INTEGER,
    spin_frame_path   TEXT,                       -- 'spin/<slug>/{size}/{n}.webp'
    spin_sizes        INTEGER[],

    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT product_3d_print_price CHECK (
        NOT print_enabled OR (print_price IS NOT NULL AND print_price >= 0)
    ),
    CONSTRAINT product_3d_print_name_max CHECK (print_name_max BETWEEN 1 AND 20),
    CONSTRAINT product_3d_spin_complete CHECK (
        (spin_frame_count IS NULL AND spin_frame_path IS NULL)
        OR (spin_frame_count BETWEEN 8 AND 72 AND spin_frame_path IS NOT NULL
            AND spin_sizes IS NOT NULL AND cardinality(spin_sizes) > 0)
    ),
    -- Same traversal guard the media RPCs use.
    CONSTRAINT product_3d_paths_safe CHECK (
        COALESCE(cutout_front, '') NOT LIKE '%..%'
        AND COALESCE(cutout_back, '') NOT LIKE '%..%'
        AND COALESCE(spin_frame_path, '') NOT LIKE '%..%'
    )
);

DROP TRIGGER IF EXISTS product_3d_set_updated_at ON public.product_3d;
CREATE TRIGGER product_3d_set_updated_at
    BEFORE UPDATE ON public.product_3d
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_3d ENABLE ROW LEVEL SECURITY;

-- Readable exactly when the product itself is: the products read policy
-- already hides drafts and retired rows, and this subquery runs under it.
DROP POLICY IF EXISTS "Read product_3d of visible products" ON public.product_3d;
CREATE POLICY "Read product_3d of visible products"
    ON public.product_3d FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id));

DROP POLICY IF EXISTS "Admins write product_3d" ON public.product_3d;
CREATE POLICY "Admins write product_3d"
    ON public.product_3d FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 4. Starting scene
--
-- Unpublished, so nothing changes for shoppers until an admin publishes it.
-- Image paths point at the placeholder files the 3D site ships in /public.
-- ------------------------------------------------------------
INSERT INTO public.store_scenes (id, data, is_published)
VALUES (
    'main',
    '{
      "entrance": {
        "facade": "scene/facade",
        "tagline_bn": "আপনার স্পোর্টসের বিশ্বস্ত ঠিকানা",
        "subline": "Jersey · Sportswear · Sports accessories",
        "hours": "10 AM – 10 PM"
      },
      "walls": [
        { "id": "jersey", "side": "left",  "image": "scene/jersey-wall",      "title": "Football Jerseys",   "subtitle": "Club · National · Retro · Fan & Player edition", "link": "/jerseys" },
        { "id": "acc",    "side": "right", "image": "scene/accessories-wall", "title": "Sports Accessories", "subtitle": "Cricket · Badminton · Football · Gear",          "link": "/accessories" },
        { "id": "custom", "side": "back",  "image": null,                     "title": "Custom Jersey Desk", "subtitle": "Your name & number, team kits, club orders",     "link": "/custom-jersey" }
      ],
      "hotspots": [],
      "rail": { "category": "football-jersey", "max": 11, "filters": ["club", "national", "retro", "player-edition"] }
    }'::JSONB,
    FALSE
)
ON CONFLICT (id) DO NOTHING;
