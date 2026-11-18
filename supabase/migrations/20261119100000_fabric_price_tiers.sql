-- Fabric price by quantity. Re-runnable. Needs 20261113100000.
--
-- price_tiers: [{"min": 5, "price": 420}, {"min": 10, "price": 400}]
--   From `min` pieces upwards the customer price per piece is `price`.
--   Below the smallest min, price_per_piece is used.
--   When a fabric has tiers, the general % quantity discount
--   (app_settings.custom_jersey_pricing.tiers) is not applied to it.
--   Empty array = old behaviour (price_per_piece less the % discount).
ALTER TABLE public.custom_fabrics ADD COLUMN IF NOT EXISTS price_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_fabrics DROP CONSTRAINT IF EXISTS custom_fabrics_price_tiers_array;
ALTER TABLE public.custom_fabrics ADD CONSTRAINT custom_fabrics_price_tiers_array
    CHECK (jsonb_typeof(price_tiers) = 'array');
