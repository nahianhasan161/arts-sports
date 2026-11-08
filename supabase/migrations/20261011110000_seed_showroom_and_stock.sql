-- Migration: seed the showroom and the stock allocations that make checkout work.
--
-- The storefront could not sell anything. Every checkout ended in
-- `insufficient_stock` -> "An item just sold out.", and the order was rolled
-- back, so nothing was placed. The cause was not that anything sold out.
--
-- Two tables were empty:
--
--   * showrooms had zero rows.
--   * product_stock had zero rows.
--
-- `admin_save_product()` seeds product_stock with
--
--     INSERT INTO product_stock (...)
--     SELECT v.id, s.id, 0, 0 FROM product_variants v CROSS JOIN showrooms s ...
--
-- so with no showrooms that INSERT selects nothing, silently. Variants were
-- created -- product_variants has rows -- but no allocation was ever made
-- against them, and create_order_with_reservations() reserves only from
-- product_stock joined to an active showroom. Every product saved while
-- showrooms was empty is therefore unsellable, with no error raised at the
-- time to say so.
--
-- This migration is the data fix. The code fix is the companion migration
-- 20261011110000_inventory_allocation_guard.sql, which stops a product being
-- saved without an allocation.

-- ------------------------------------------------------------
-- 1. The showroom. One is the minimum for allocation to be possible.
-- ------------------------------------------------------------
INSERT INTO public.showrooms (id, name, slug, address, is_active, fulfillment_priority)
VALUES (
  'main-warehouse',
  'Main Warehouse',
  'main-warehouse',
  'Dhaka',
  true,
  1
)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Allocate every existing variant from the number the editor holds.
--
-- `product_variants.stock` is the total an admin typed into the product
-- editor; `product_stock.quantity` is what checkout actually reserves. The
-- seeding function writes 0 for a brand-new variant and then leaves the row
-- alone, so the two have never been reconciled for the variants that already
-- exist. Copying across -- rather than inserting zeros -- is what makes the
-- existing catalogue purchasable at the quantities the admin intended.
-- ------------------------------------------------------------
INSERT INTO public.product_stock (variant_id, showroom_id, quantity, reserved_quantity, updated_at)
SELECT v.id, s.id, GREATEST(COALESCE(v.stock, 0), 0), 0, now()
FROM public.product_variants v
CROSS JOIN public.showrooms s
WHERE s.is_active
  AND v.is_active
  AND COALESCE(v.stock, 0) > 0
ON CONFLICT (variant_id, showroom_id)
DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();

-- ------------------------------------------------------------
-- 3. Nothing may hold a negative or absurd quantity.
-- ------------------------------------------------------------
UPDATE public.product_stock
SET quantity = GREATEST(quantity, 0), updated_at = now()
WHERE quantity < 0;

UPDATE public.product_stock
SET reserved_quantity = LEAST(GREATEST(reserved_quantity, 0), quantity), updated_at = now()
WHERE reserved_quantity < 0 OR reserved_quantity > quantity;
