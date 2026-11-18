-- Custom jersey design catalogue: our own designs, grouped by category, that a
-- customer can pick to have one made like it. Kept apart from the product
-- catalogue. Categories are rows staff can add (Club jersey, Player Edition...).
-- Re-runnable.

CREATE TABLE IF NOT EXISTS public.custom_design_categories (
    slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
    name_en TEXT NOT NULL,
    name_bn TEXT,
    image_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.custom_design_categories (slug, name_en, name_bn, display_order) VALUES
    ('club', 'Club jersey', 'ক্লাব জার্সি', 10),
    ('country', 'Country jersey', 'দেশের জার্সি', 20),
    ('designer', 'Designer Edition', 'ডিজাইনার এডিশন', 30),
    ('player', 'Player Edition', 'প্লেয়ার এডিশন', 40),
    ('special', 'Special Edition', 'স্পেশাল এডিশন', 50),
    ('other', 'Other', 'অন্যান্য', 1000)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.custom_design_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads active design categories" ON public.custom_design_categories;
CREATE POLICY "Anyone reads active design categories" ON public.custom_design_categories
    FOR SELECT USING (is_active);

-- Designs (custom_gallery rows) get a name and a category.
-- NULL category = an older photo, shown under "other".
ALTER TABLE public.custom_gallery ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.custom_gallery ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.custom_gallery DROP CONSTRAINT IF EXISTS custom_gallery_category_check;
UPDATE public.custom_gallery g SET category = 'other'
    WHERE category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.custom_design_categories c WHERE c.slug = g.category);
ALTER TABLE public.custom_gallery DROP CONSTRAINT IF EXISTS custom_gallery_category_fkey;
ALTER TABLE public.custom_gallery ADD CONSTRAINT custom_gallery_category_fkey
    FOREIGN KEY (category) REFERENCES public.custom_design_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL;

DROP INDEX IF EXISTS public.custom_gallery_category_idx;
CREATE INDEX custom_gallery_category_idx
    ON public.custom_gallery (category, is_published, display_order, created_at DESC);
