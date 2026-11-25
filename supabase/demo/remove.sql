-- Removes everything supabase/demo/seed.sql and seed-extra.sql added. Every demo
-- row has an id that starts with "demo-" (checkout_leads: session_id), so real
-- data is never touched. Rows you make by hand while testing keep their own ids
-- and stay, except payments, returns, stock moves and other rows that belong to
-- a demo order, sale, product or supplier: those go with it.
-- Run with: node scripts/demo-data.mjs remove
DELETE FROM public.refunds               WHERE id LIKE 'demo-%' OR order_id LIKE 'demo-%';
DELETE FROM public.returns               WHERE id LIKE 'demo-%' OR order_id LIKE 'demo-%';
DELETE FROM public.cancellations         WHERE id LIKE 'demo-%' OR order_id LIKE 'demo-%';
DELETE FROM public.payments              WHERE id LIKE 'demo-%' OR order_id LIKE 'demo-%';
DELETE FROM public.pos_returns           WHERE sale_id LIKE 'demo-%';
DELETE FROM public.pos_payments          WHERE sale_id LIKE 'demo-%';
DELETE FROM public.pos_sale_items        WHERE sale_id LIKE 'demo-%';
DELETE FROM public.pos_sales             WHERE id LIKE 'demo-%';
DELETE FROM public.pos_cash_moves        WHERE session_id LIKE 'demo-%';
DELETE FROM public.pos_sessions          WHERE id LIKE 'demo-%';
DELETE FROM public.order_items           WHERE order_id LIKE 'demo-%';
DELETE FROM public.orders                WHERE id LIKE 'demo-%';
DELETE FROM public.checkout_leads        WHERE session_id LIKE 'demo-%';
DELETE FROM public.fabric_moves          WHERE id LIKE 'demo-%' OR fabric_id LIKE 'demo-%';
DELETE FROM public.accessory_moves       WHERE id LIKE 'demo-%' OR accessory_id LIKE 'demo-%';
DELETE FROM public.production_batches    WHERE id LIKE 'demo-%';
DELETE FROM public.custom_accessories    WHERE id LIKE 'demo-%';
DELETE FROM public.custom_order_payments WHERE custom_order_id LIKE 'demo-%';
DELETE FROM public.custom_orders         WHERE id LIKE 'demo-%';
DELETE FROM public.custom_gallery        WHERE id LIKE 'demo-%';
DELETE FROM public.custom_fabrics        WHERE id LIKE 'demo-%';
DELETE FROM public.supplier_payments     WHERE supplier_id LIKE 'demo-%';
DELETE FROM public.stock_receipts        WHERE id LIKE 'demo-%';
DELETE FROM public.product_reviews       WHERE id LIKE 'demo-%';
DELETE FROM public.product_questions     WHERE id LIKE 'demo-%';
DELETE FROM public.coupons               WHERE id LIKE 'demo-%';
DELETE FROM public.promotions            WHERE id LIKE 'demo-%';
DELETE FROM public.collections           WHERE id LIKE 'demo-%';
DELETE FROM public.product_terms         WHERE term_id LIKE 'demo-%';
DELETE FROM public.catalog_terms         WHERE id LIKE 'demo-%';
DELETE FROM public.stock_reservations    WHERE variant_id LIKE 'demo-%' OR showroom_id LIKE 'demo-%';
DELETE FROM public.inventory_movements   WHERE variant_id LIKE 'demo-%' OR showroom_id LIKE 'demo-%';
DELETE FROM public.product_stock         WHERE variant_id LIKE 'demo-%' OR showroom_id LIKE 'demo-%';
DELETE FROM public.product_variants      WHERE id LIKE 'demo-%';
DELETE FROM public.products              WHERE id LIKE 'demo-%';
DELETE FROM public.suppliers             WHERE id LIKE 'demo-%';
DELETE FROM public.showrooms             WHERE id LIKE 'demo-%';
DELETE FROM public.customers             WHERE id LIKE 'demo-%';
DELETE FROM public.categories            WHERE id LIKE 'demo-%';
-- A demo colour or size you put on a product of your own stays.
DELETE FROM public.product_option_values o WHERE (o.legacy_size_id LIKE 'demo-%' OR o.legacy_color_id LIKE 'demo-%')
    AND NOT EXISTS (SELECT 1 FROM public.product_variant_option_values v WHERE v.option_value_id = o.id);
DELETE FROM public.colors c WHERE c.id LIKE 'demo-%'
    AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.color_id = c.id) AND NOT EXISTS (SELECT 1 FROM public.product_colors v WHERE v.color_id = c.id);
DELETE FROM public.sizes s WHERE s.id LIKE 'demo-%'
    AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.size_id = s.id) AND NOT EXISTS (SELECT 1 FROM public.product_sizes v WHERE v.size_id = s.id);
