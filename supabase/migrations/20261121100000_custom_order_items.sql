-- Custom jersey: several designs in one order, and pants per player.
--
--   custom_orders.items          [{ id, title, jersey, fabric_id, fabric_name, jersey_type,
--                                   choice, pant: { option, fabric_id, fabric_name }, notes,
--                                   files: [indexes into custom_orders.files] }]
--                                empty on orders taken before (they are one design).
--   custom_order_roster.item_id  which design the player belongs to (items[].id)
--   custom_order_roster.pant_size the player's pant size (a jersey size or custom text); null = no pant
--
-- The old one-design columns (fabric_id, sleeve, collar, with_*) are still filled
-- from the first design so lists, production and reports keep working.
-- Safe to run again.

ALTER TABLE public.custom_orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.custom_order_roster
    ADD COLUMN IF NOT EXISTS item_id TEXT,
    ADD COLUMN IF NOT EXISTS pant_size TEXT;

ALTER TABLE public.custom_order_roster DROP CONSTRAINT IF EXISTS custom_order_roster_pant_size_check;
ALTER TABLE public.custom_order_roster ADD CONSTRAINT custom_order_roster_pant_size_check
    CHECK (pant_size IS NULL OR char_length(pant_size) BETWEEN 1 AND 20);

ALTER TABLE public.custom_order_roster DROP CONSTRAINT IF EXISTS custom_order_roster_item_id_check;
ALTER TABLE public.custom_order_roster ADD CONSTRAINT custom_order_roster_item_id_check
    CHECK (item_id IS NULL OR char_length(item_id) BETWEEN 1 AND 20);
