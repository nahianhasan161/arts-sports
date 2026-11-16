-- Categories get an optional picture (shown on the register's category tiles
-- and settable from the register's quick-add panel). Safe to re-run.
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS image_url TEXT;
