-- Custom jersey team list: men/boys fit and made-to-measure sizes.
--   fit            'men' (default) or 'boys' (boys use sizes 20..34)
--   chest, length  inches; required when size = 'CUSTOM'
--   sleeve_length  inches, optional; can also be set on a standard size
-- Safe to re-run.

ALTER TABLE public.custom_order_roster
    ADD COLUMN IF NOT EXISTS fit TEXT NOT NULL DEFAULT 'men',
    ADD COLUMN IF NOT EXISTS chest NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS length NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS sleeve_length NUMERIC(4,1);

ALTER TABLE public.custom_order_roster DROP CONSTRAINT IF EXISTS custom_order_roster_fit_check;
ALTER TABLE public.custom_order_roster ADD CONSTRAINT custom_order_roster_fit_check CHECK (fit IN ('men', 'boys'));

ALTER TABLE public.custom_order_roster DROP CONSTRAINT IF EXISTS custom_order_roster_measure_check;
ALTER TABLE public.custom_order_roster ADD CONSTRAINT custom_order_roster_measure_check CHECK (
    (chest IS NULL OR chest BETWEEN 4 AND 80)
    AND (length IS NULL OR length BETWEEN 4 AND 80)
    AND (sleeve_length IS NULL OR sleeve_length BETWEEN 4 AND 80)
    AND (size <> 'CUSTOM' OR (chest IS NOT NULL AND length IS NOT NULL))
);
