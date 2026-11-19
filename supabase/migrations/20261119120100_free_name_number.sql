-- Custom jersey prices: names and numbers are printed free (owner, 2026-11-19).
-- Full sleeve, polo collar and the paid logo types (DTF, silicon, embroidery) keep their prices.
--
-- A data change in the stored price table (app_settings.custom_jersey_pricing, JSON as text).
-- When no price table has been saved yet the code defaults already give 0, so nothing is written.
-- Running it again sets both back to 0; change them on the Jersey prices page afterwards if needed.

UPDATE public.app_settings
SET value = jsonb_set(
        jsonb_set(value::JSONB, '{extras,name}', '0'::JSONB, true),
        '{extras,number}', '0'::JSONB, true
    )::TEXT,
    updated_at = now()
WHERE key = 'custom_jersey_pricing'
  AND value IS NOT NULL
  AND value ~ '^\s*\{'
  AND (value::JSONB) ? 'extras';
