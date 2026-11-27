-- Pictures and videos per colour, and the variation shown first.
--
-- products.color_images = { "<colour name, lower case>": ["<one of products.images>" | "video:<key>", ...] }
-- (see src/lib/products/color-images.ts). Set from the product form (Variations
-- tab → "Colour pictures & videos"), through
-- PUT /api/admin/products/[productId]/color-images. The product page shows the
-- first picture on the colour button and, when a colour is picked, shows that
-- colour's media first in the gallery. Kept apart from products.colors on purpose: admin_save_product
-- rebuilds that column from product_colors on every save.
--
-- Safe to run again.

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS color_images JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_color_images_object;
ALTER TABLE public.products
    ADD CONSTRAINT products_color_images_object CHECK (jsonb_typeof(color_images) = 'object');

-- products.default_variant = { "color": "<colour, lower case>", "size": "<size, lower case>" },
-- both optional. The product page opens on it and product cards show that
-- colour's first picture. Empty = first colour/size in stock (old behaviour).
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS default_variant JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_default_variant_object;
ALTER TABLE public.products
    ADD CONSTRAINT products_default_variant_object CHECK (jsonb_typeof(default_variant) = 'object');
