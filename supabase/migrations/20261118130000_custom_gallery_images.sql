-- Design catalogue: several pictures per design. Re-runnable. Needs 20261118120000.

-- A design can have several pictures (front, back, detail...). `images` holds all
-- of them in order; images[1] is the cover and is kept equal to image_url, so code
-- that only reads image_url keeps working.
ALTER TABLE public.custom_gallery ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';
UPDATE public.custom_gallery SET images = ARRAY[image_url]
    WHERE cardinality(images) = 0 AND image_url IS NOT NULL;
