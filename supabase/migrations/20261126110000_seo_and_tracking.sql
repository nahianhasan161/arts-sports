-- SEO text per product + ad-platform ids per order.
--
-- products.seo    Search title / description / keywords / picture text, in
--                 English and Bangla. Empty = the site builds them from the
--                 product itself (lib/seo/product-seo.ts). Written by the AI
--                 writer after a save (source "ai") or typed by staff in the
--                 product form's SEO tab (source "manual", never overwritten).
-- orders.tracking Browser ids the ad platforms match orders with (_fbp, _fbc,
--                 _ttp, ttclid, _epik, GA client id, IP, user agent), kept at
--                 checkout so the Purchase sent later by the payment webhook
--                 can carry them too. Not shown anywhere.
--
-- Safe to run again.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo JSONB NOT NULL DEFAULT '{}'::JSONB;
COMMENT ON COLUMN public.products.seo IS
  'Search text: {source: ai|manual, title_en, title_bn, description_en, description_bn, keywords[], image_alt_en, image_alt_bn, input_hash, generated_at}. Empty = built from the product.';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking JSONB NOT NULL DEFAULT '{}'::JSONB;
COMMENT ON COLUMN public.orders.tracking IS
  'Ad-platform ids from checkout (fbp, fbc, ttp, ttclid, epik, ga_client_id, ip, user_agent) for server-side conversion events.';
