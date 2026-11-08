-- Product option system (Phase 0).
--
-- Size and colour used to be the only two axes, each in its own table.
-- Sports products need more: a jersey has size + sleeve + kit colour, a
-- racket has colour + weight + grip, shoes have EU/UK sizes. This adds a
-- general option system:
--
--   product_option_types           Size, Colour, Sleeve, Weight, Grip, Shoe size, ...
--   product_option_values          S, M, L / Half, Full / 3U, 4U / ...
--   product_options                which option types a product uses, in order
--   product_variant_option_values  the value a variant has for each type
--
-- Each variant keeps its own SKU, stock and optional price
-- (product_variants.regular_price_override), so "full sleeve costs ৳100
-- more" is the full-sleeve variants' price. Variants also get a barcode
-- column for the POS and labels.
--
-- Compatibility: the existing sizes/colors tables and the color_id/size_id
-- columns stay, and the current product editor keeps working. Triggers copy
-- every size, colour and variant into the new tables, so both stay in step
-- until the editor moves to the general system.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.product_option_types (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
    name_en TEXT NOT NULL,
    name_bn TEXT,
    -- 'swatch' shows colour dots, 'buttons' a row of choices, 'select' a dropdown.
    display_style TEXT NOT NULL DEFAULT 'buttons' CHECK (display_style IN ('buttons', 'swatch', 'select')),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_option_values (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    option_type_id TEXT NOT NULL REFERENCES public.product_option_types(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label_en TEXT NOT NULL,
    label_bn TEXT,
    hex TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    legacy_size_id TEXT UNIQUE REFERENCES public.sizes(id) ON DELETE SET NULL,
    legacy_color_id TEXT UNIQUE REFERENCES public.colors(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (option_type_id, code)
);

CREATE TABLE IF NOT EXISTS public.product_options (
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    option_type_id TEXT NOT NULL REFERENCES public.product_option_types(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, option_type_id)
);

CREATE TABLE IF NOT EXISTS public.product_variant_option_values (
    variant_id TEXT NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    option_type_id TEXT NOT NULL REFERENCES public.product_option_types(id) ON DELETE RESTRICT,
    option_value_id TEXT NOT NULL REFERENCES public.product_option_values(id) ON DELETE RESTRICT,
    PRIMARY KEY (variant_id, option_type_id)
);
CREATE INDEX IF NOT EXISTS pvov_value_idx ON public.product_variant_option_values (option_value_id);

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_unique
    ON public.product_variants (barcode) WHERE barcode IS NOT NULL;

DROP TRIGGER IF EXISTS product_option_types_set_updated_at ON public.product_option_types;
CREATE TRIGGER product_option_types_set_updated_at
    BEFORE UPDATE ON public.product_option_types
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS product_option_values_set_updated_at ON public.product_option_values;
CREATE TRIGGER product_option_values_set_updated_at
    BEFORE UPDATE ON public.product_option_values
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------
-- Starting option types and values
-- ----------------------------------------------------------------------
INSERT INTO public.product_option_types (code, name_en, name_bn, display_style, display_order) VALUES
    ('size',      'Size',      'সাইজ',   'buttons', 10),
    ('color',     'Colour',    'রং',     'swatch',  20),
    ('sleeve',    'Sleeve',    'হাতা',   'buttons', 30),
    ('kit',       'Kit',       'কিট',    'buttons', 40),
    ('weight',    'Weight',    'ওজন',    'buttons', 50),
    ('grip',      'Grip size', 'গ্রিপ',   'buttons', 60),
    ('shoe_size', 'Shoe size', 'জুতার সাইজ', 'buttons', 70),
    ('ball_size', 'Ball size', 'বলের সাইজ', 'buttons', 80)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.product_option_values (option_type_id, code, label_en, label_bn, display_order)
SELECT t.id, v.code, v.label_en, v.label_bn, v.ord
FROM public.product_option_types t
JOIN (VALUES
    ('sleeve', 'half', 'Half sleeve', 'হাফ হাতা', 10),
    ('sleeve', 'full', 'Full sleeve', 'ফুল হাতা', 20),
    ('kit', 'home', 'Home', 'হোম', 10),
    ('kit', 'away', 'Away', 'অ্যাওয়ে', 20),
    ('kit', 'third', 'Third', 'থার্ড', 30),
    ('weight', '2u', '2U (90–94 g)', NULL, 10),
    ('weight', '3u', '3U (85–89 g)', NULL, 20),
    ('weight', '4u', '4U (80–84 g)', NULL, 30),
    ('weight', '5u', '5U (75–79 g)', NULL, 40),
    ('grip', 'g4', 'G4', NULL, 10),
    ('grip', 'g5', 'G5', NULL, 20),
    ('grip', 'g6', 'G6', NULL, 30),
    ('ball_size', '3', 'Size 3', NULL, 10),
    ('ball_size', '4', 'Size 4', NULL, 20),
    ('ball_size', '5', 'Size 5', NULL, 30)
) AS v(type_code, code, label_en, label_bn, ord) ON v.type_code = t.code
ON CONFLICT (option_type_id, code) DO NOTHING;

-- ----------------------------------------------------------------------
-- Keep sizes/colours mirrored as option values
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mirror_legacy_option_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_type_id TEXT;
BEGIN
    IF TG_TABLE_NAME = 'sizes' THEN
        SELECT id INTO v_type_id FROM public.product_option_types
        WHERE code = CASE WHEN NEW.type = 'shoe' THEN 'shoe_size' ELSE 'size' END;

        INSERT INTO public.product_option_values
            (option_type_id, code, label_en, display_order, is_active, legacy_size_id)
        VALUES (v_type_id, 'legacy_' || NEW.id, COALESCE(NULLIF(NEW.display_name, ''), NEW.name),
                COALESCE(NEW.sort_key, NEW.display_order, 0), COALESCE(NEW.is_active, true), NEW.id)
        ON CONFLICT (legacy_size_id) DO UPDATE
            SET label_en = EXCLUDED.label_en, display_order = EXCLUDED.display_order,
                is_active = EXCLUDED.is_active;
    ELSE
        SELECT id INTO v_type_id FROM public.product_option_types WHERE code = 'color';

        INSERT INTO public.product_option_values
            (option_type_id, code, label_en, hex, display_order, is_active, legacy_color_id)
        VALUES (v_type_id, 'legacy_' || NEW.id, NEW.name, NEW.hex,
                COALESCE(NEW.display_order, 0), COALESCE(NEW.is_active, true), NEW.id)
        ON CONFLICT (legacy_color_id) DO UPDATE
            SET label_en = EXCLUDED.label_en, hex = EXCLUDED.hex,
                display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sizes_mirror_option_value ON public.sizes;
CREATE TRIGGER sizes_mirror_option_value
    AFTER INSERT OR UPDATE ON public.sizes
    FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_option_value();

DROP TRIGGER IF EXISTS colors_mirror_option_value ON public.colors;
CREATE TRIGGER colors_mirror_option_value
    AFTER INSERT OR UPDATE ON public.colors
    FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_option_value();

-- Backfill: touching each row fires the mirror trigger.
UPDATE public.sizes SET name = name;
UPDATE public.colors SET name = name;

-- ----------------------------------------------------------------------
-- Keep variants' color_id/size_id mirrored as option values
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mirror_variant_legacy_options()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_value RECORD;
BEGIN
    -- Remove only the mirrored axes; values set through the new system for
    -- other types (sleeve, weight...) are left alone.
    DELETE FROM public.product_variant_option_values pvov
    USING public.product_option_values v
    WHERE pvov.variant_id = NEW.id
      AND pvov.option_value_id = v.id
      AND (v.legacy_size_id IS NOT NULL OR v.legacy_color_id IS NOT NULL);

    FOR v_value IN
        SELECT id, option_type_id FROM public.product_option_values
        WHERE (NEW.size_id IS NOT NULL AND legacy_size_id = NEW.size_id)
           OR (NEW.color_id IS NOT NULL AND legacy_color_id = NEW.color_id)
    LOOP
        INSERT INTO public.product_variant_option_values (variant_id, option_type_id, option_value_id)
        VALUES (NEW.id, v_value.option_type_id, v_value.id)
        ON CONFLICT (variant_id, option_type_id) DO UPDATE SET option_value_id = EXCLUDED.option_value_id;

        INSERT INTO public.product_options (product_id, option_type_id, position)
        SELECT NEW.product_id, v_value.option_type_id, t.display_order
        FROM public.product_option_types t WHERE t.id = v_value.option_type_id
        ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_mirror_options ON public.product_variants;
CREATE TRIGGER product_variants_mirror_options
    AFTER INSERT OR UPDATE OF color_id, size_id ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.mirror_variant_legacy_options();

-- Backfill existing variants.
UPDATE public.product_variants SET color_id = color_id;

-- ----------------------------------------------------------------------
-- Read helper: a variant's options as {"size": "M", "sleeve": "Full sleeve"}
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.variant_option_labels(p_variant_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(jsonb_object_agg(t.code, v.label_en ORDER BY t.display_order), '{}'::jsonb)
    FROM public.product_variant_option_values pvov
    JOIN public.product_option_types t ON t.id = pvov.option_type_id
    JOIN public.product_option_values v ON v.id = pvov.option_value_id
    WHERE pvov.variant_id = p_variant_id;
$$;

-- ----------------------------------------------------------------------
-- RLS: the storefront reads; products.manage writes.
-- ----------------------------------------------------------------------
ALTER TABLE public.product_option_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_option_values ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['product_option_types', 'product_option_values', 'product_options', 'product_variant_option_values']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public read" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Public read" ON public.%I FOR SELECT USING (true)', t);
        EXECUTE format('DROP POLICY IF EXISTS "Catalogue managers write" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "Catalogue managers write" ON public.%I FOR ALL
             USING (public.has_permission(''products.manage''))
             WITH CHECK (public.has_permission(''products.manage''))', t);
    END LOOP;
END $$;
