-- Removes everything supabase/demo/seed.sql added. Every demo row has an id
-- that starts with "demo-", so nothing else is touched.
-- Run with: node scripts/demo-data.mjs remove
DELETE FROM public.pos_payments      WHERE sale_id LIKE 'demo-%';
DELETE FROM public.pos_sale_items    WHERE sale_id LIKE 'demo-%';
DELETE FROM public.pos_sales         WHERE id LIKE 'demo-%';
DELETE FROM public.pos_sessions      WHERE id LIKE 'demo-%';
DELETE FROM public.order_items       WHERE order_id LIKE 'demo-%';
DELETE FROM public.orders            WHERE id LIKE 'demo-%';
DELETE FROM public.custom_orders     WHERE id LIKE 'demo-%';
DELETE FROM public.product_reviews   WHERE id LIKE 'demo-%';
DELETE FROM public.product_questions WHERE id LIKE 'demo-%';
DELETE FROM public.coupons           WHERE id LIKE 'demo-%';
DELETE FROM public.inventory_movements WHERE variant_id LIKE 'demo-%' OR showroom_id LIKE 'demo-%';
DELETE FROM public.product_stock     WHERE variant_id LIKE 'demo-%' OR showroom_id LIKE 'demo-%';
DELETE FROM public.product_variants  WHERE id LIKE 'demo-%';
DELETE FROM public.products          WHERE id LIKE 'demo-%';
DELETE FROM public.suppliers         WHERE id LIKE 'demo-%';
DELETE FROM public.showrooms         WHERE id LIKE 'demo-%';
DELETE FROM public.customers         WHERE id LIKE 'demo-%';
DELETE FROM public.categories        WHERE id LIKE 'demo-%';
