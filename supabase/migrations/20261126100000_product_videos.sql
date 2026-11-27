-- Product videos: a short list of links (YouTube, Facebook, TikTok...) and
-- small uploaded clips (shrunk in the admin's browser, stored in R2).
-- Written only by PUT/POST /api/admin/products/[productId]/videos, which
-- checks every entry (src/lib/media/video.ts). Safe to run again.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS videos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_videos_is_array;
ALTER TABLE public.products
  ADD CONSTRAINT products_videos_is_array CHECK (jsonb_typeof(videos) = 'array' AND jsonb_array_length(videos) <= 6);

COMMENT ON COLUMN public.products.videos IS
  'List of {kind, id?, url, vertical?, storage_path?, poster_path?, poster?, mime?, bytes?, seconds?}. kind: youtube|vimeo|facebook|tiktok|instagram|drive|file.';
