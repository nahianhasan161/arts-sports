-- Second part of the demo data (scripts/demo-data.mjs runs it after seed.sql):
-- products without sizes, teams, collections, a promotion, suppliers with dues,
-- purchases, fabric, accessories, production batches, designs, a custom order in
-- every status, payments, returns, refunds, leads and 45 days of sales.
--
-- Ids start with "demo-" (checkout_leads: session_id, its id is a UUID).
-- Fabric and accessories are demo items of their own, so the real ones' stock and
-- average cost never change.

DO $$
DECLARE
    v_admin UUID := (SELECT id FROM public.profiles WHERE role IN ('super_admin', 'admin') ORDER BY (role = 'super_admin') DESC, id LIMIT 1);
    v_main TEXT := COALESCE((SELECT id FROM public.showrooms WHERE is_active AND id NOT LIKE 'demo-%' ORDER BY fulfillment_priority LIMIT 1), 'demo-shop-uttara');
    v_today DATE := (now() AT TIME ZONE 'Asia/Dhaka')::DATE;
    p RECORD;
    r RECORD;
    i INTEGER;
    v_id TEXT;
    v_variant TEXT;
    v_price NUMERIC;
    v_qty INTEGER;
    v_at TIMESTAMPTZ;
    v_method TEXT;
BEGIN
    -- ---------------------------------------------------------------- products
    -- 9 and 10 have no sizes (counted on products.stock); 10 is sold out. 11 is a draft.
    INSERT INTO public.products (id, slug, title, title_bn, category_id, description, description_bn, price, original_price, regular_price,
                                 discount_type, discount_value, discount_percent, discount_mode, status, images, colors, sizes, stock, is_featured, cost_price, tags)
    VALUES
        ('demo-prod-9',  'demo-football',   'Match Football (demo)',  'ম্যাচ ফুটবল (ডেমো)',  'demo-cat-casual', 'Demo product without sizes.', 'সাইজ ছাড়া ডেমো পণ্য।', 1200, 1200, 1200, 'percentage', 0, 0, 'none', 'published', '["/demo/club-white.svg"]', '[]', '[]', 15, false, 700, ARRAY['demo']),
        ('demo-prod-10', 'demo-shin-guard', 'Shin Guard (demo)',      'শিন গার্ড (ডেমো)',     'demo-cat-casual', 'Demo product, sold out.',     'স্টক শেষ, ডেমো পণ্য।',  450,  450,  450,  'percentage', 0, 0, 'none', 'published', '["/demo/trouser.svg"]',    '[]', '[]', 0,  false, 220, ARRAY['demo']),
        ('demo-prod-11', 'demo-draft',      'Draft Jersey (demo)',    'খসড়া জার্সি (ডেমো)',   'demo-cat-jersey', 'Demo draft, not on the site.', 'ডেমো খসড়া।',           900,  900,  900,  'percentage', 0, 0, 'none', 'draft',     '["/demo/brazil.svg"]',     '[]', '[]', 0,  false, 400, ARRAY['demo']);

    INSERT INTO public.catalog_terms (id, type, slug, name_en, name_bn, is_featured, display_order, is_active) VALUES
        ('demo-term-argentina',  'team', 'demo-argentina',  'Argentina (demo)',  'আর্জেন্টিনা (ডেমো)', true, 90, true),
        ('demo-term-brazil',     'team', 'demo-brazil',     'Brazil (demo)',     'ব্রাজিল (ডেমো)',     true, 91, true),
        ('demo-term-bangladesh', 'team', 'demo-bangladesh', 'Bangladesh (demo)', 'বাংলাদেশ (ডেমো)',    true, 92, true);
    INSERT INTO public.product_terms (product_id, term_id) VALUES
        ('demo-prod-1', 'demo-term-argentina'), ('demo-prod-2', 'demo-term-brazil'), ('demo-prod-3', 'demo-term-bangladesh');

    INSERT INTO public.collections (id, slug, title_en, title_bn, kind, starts_at, ends_at, show_countdown, show_in_menu, display_order, is_active)
    VALUES ('demo-collection-1', 'demo-world-cup', 'World Cup (demo)', 'বিশ্বকাপ (ডেমো)', 'manual', now() - interval '1 day', now() + interval '30 days', true, false, 90, true);
    INSERT INTO public.collection_products (collection_id, product_id, position) VALUES
        ('demo-collection-1', 'demo-prod-1', 1), ('demo-collection-1', 'demo-prod-2', 2), ('demo-collection-1', 'demo-prod-3', 3);

    INSERT INTO public.promotions (id, name, description, discount_type, discount_value, starts_at, ends_at, status, badge_label, badge_type)
    VALUES ('demo-promo-1', 'Trouser sale (demo)', 'DEMO', 'percentage', 20, now() - interval '1 day', now() + interval '30 days', 'active', 'SALE', 'discount');
    INSERT INTO public.promotion_products (promotion_id, product_id) VALUES ('demo-promo-1', 'demo-prod-8');
    UPDATE public.products SET discount_mode = 'promotion' WHERE id = 'demo-prod-8';

    INSERT INTO public.coupons (id, code, description, applies_to, discount_type, discount_value, minimum_order_value, max_uses_per_user, starts_at, ends_at, status)
    VALUES ('demo-coupon-2', 'DEMO100', 'Demo coupon: 100 taka off over 1000', 'order', 'flat', 100, 1000, 5, now() - interval '1 day', now() + interval '90 days', 'active'),
           ('demo-coupon-3', 'DEMOOLD', 'Demo coupon that has ended', 'order', 'flat', 50, 0, 1, now() - interval '30 days', now() - interval '5 days', 'active');

    -- --------------------------------------------------------------- suppliers
    UPDATE public.suppliers SET categories = ARRAY['products'], contact_person = 'করিম (ডেমো)' WHERE id = 'demo-supplier-1';
    INSERT INTO public.suppliers (id, name, phone, address, notes, lead_days, is_active, opening_due, categories) VALUES
        ('demo-supplier-2', 'ইসলামপুর নিট ফ্যাব্রিক (ডেমো)',  '01900000012', 'ইসলামপুর, ঢাকা', 'DEMO', 3, true, 5000, ARRAY['fabric']),
        ('demo-supplier-3', 'সাবলিমেশন প্রিন্ট হাউস (ডেমো)',   '01900000013', 'মিরপুর, ঢাকা',   'DEMO', 2, true, 0,    ARRAY['printing']),
        ('demo-supplier-4', 'আল-আমিন গার্মেন্টস (ডেমো)',      '01900000014', 'সাভার, ঢাকা',    'DEMO', 4, true, 0,    ARRAY['garments']),
        ('demo-supplier-5', 'লোগো ও এক্সেসরিজ হাউস (ডেমো)',   '01900000015', 'চকবাজার, ঢাকা',  'DEMO', 2, true, 0,    ARRAY['accessories', 'products']);
    UPDATE public.suppliers SET phone = '01900000011' WHERE id = 'demo-supplier-1';

    -- Purchases: one part-paid, one unpaid, one fully paid.
    FOR p IN SELECT * FROM (VALUES
            (1, 'demo-supplier-1', 1, 20, 520, 200, 150, 10000, 'bank', 30),
            (2, 'demo-supplier-1', 3, 10, 580, 0,   0,   0,     'cash', 12),
            (3, 'demo-supplier-5', 5, 10, 380, 0,   100, 3900,  'bkash', 4)
        ) AS t(n, supplier_id, product_n, qty, cost, discount, extra, paid, method, days)
    LOOP
        v_variant := 'demo-var-' || p.product_n || '-m';
        v_at := now() - make_interval(days => p.days);
        INSERT INTO public.stock_receipts (id, supplier_id, showroom_id, reference, note, total_cost, received_by, created_at, receipt_no, invoice_date, discount, extra_cost)
        VALUES ('demo-receipt-' || p.n, p.supplier_id, v_main, 'DEMO-INV-' || p.n, 'DEMO', p.qty * p.cost, v_admin, v_at, 900000 + p.n, v_today - p.days, p.discount, p.extra);
        INSERT INTO public.stock_receipt_items (id, receipt_id, variant_id, quantity, unit_cost)
        VALUES ('demo-receipt-item-' || p.n, 'demo-receipt-' || p.n, v_variant, p.qty, p.cost);
        PERFORM public.stock_apply(v_variant, v_main, p.qty, 'stock_in', 'demo-receipt-' || p.n, 'DEMO', v_admin, p.cost);
        IF p.paid > 0 THEN
            INSERT INTO public.supplier_payments (id, supplier_id, receipt_id, amount, method, note, paid_by, created_at)
            VALUES ('demo-supplier-pay-' || p.n, p.supplier_id, 'demo-receipt-' || p.n, p.paid, p.method, 'DEMO', v_admin, v_at);
        END IF;
    END LOOP;
    INSERT INTO public.supplier_payments (id, supplier_id, amount, method, note, paid_by, created_at, voided_at, voided_by, void_reason) VALUES
        ('demo-supplier-pay-4', 'demo-supplier-2', 15000, 'bank', 'DEMO', v_admin, now() - interval '9 days', NULL, NULL, NULL),
        ('demo-supplier-pay-5', 'demo-supplier-4', 2000,  'cash', 'DEMO wrong entry', v_admin, now() - interval '3 days', now() - interval '2 days', v_admin, 'ভুল এন্ট্রি (ডেমো)');

    -- A transfer, a count correction and extra stock for the sales history below.
    FOR p IN SELECT id FROM public.product_variants WHERE id LIKE 'demo-var-%' AND id ~ '^demo-var-[1-5]-' LOOP
        PERFORM public.stock_apply(p.id, v_main, 20, 'stock_in', 'demo-receipt-open', 'Demo stock', v_admin, NULL);
    END LOOP;
    IF v_main <> 'demo-shop-uttara' THEN
        PERFORM public.inventory_transfer('demo-var-2-l', v_main, 'demo-shop-uttara', 3, v_admin, 'DEMO transfer');
    END IF;
    PERFORM public.stock_apply('demo-var-4-l', v_main, -1, 'adjust', 'demo-adjust-1', 'DEMO: একটি নষ্ট', v_admin);

    -- ------------------------------------------------------ fabric, accessories
    -- is_active = false: staff stock screens show them, customers do not see them.
    INSERT INTO public.custom_fabrics (id, slug, name_en, name_bn, price_per_piece, display_order, is_active, kg_per_piece, low_stock_kg, price_tiers) VALUES
        ('demo-fabric-1', 'demo-mesh',      'Demo Mesh',      'ডেমো মেশ',      450, 90, false, 0.220, 20, '[{"min":10,"price":420},{"min":30,"price":390}]'),
        ('demo-fabric-2', 'demo-interlock', 'Demo Interlock', 'ডেমো ইন্টারলক', 520, 91, false, 0.250, 20, '[]');
    INSERT INTO public.fabric_moves (id, fabric_id, kind, reason, kg, cost_per_kg, total_cost, supplier_id, note, created_by, created_at, move_date) VALUES
        ('demo-fm-1', 'demo-fabric-1', 'purchase', NULL,      60, 420, 25400, 'demo-supplier-2', 'DEMO', v_admin, now() - interval '25 days', v_today - 25),
        ('demo-fm-2', 'demo-fabric-2', 'purchase', NULL,      25, 480, 12000, 'demo-supplier-2', 'DEMO', v_admin, now() - interval '15 days', v_today - 15),
        ('demo-fm-3', 'demo-fabric-1', 'wastage',  'cutting', -1.5, 420, 630, NULL, 'DEMO', v_admin, now() - interval '6 days', v_today - 6),
        ('demo-fm-4', 'demo-fabric-2', 'used',     NULL,      -8, 480, 3840,  NULL, 'DEMO sample', v_admin, now() - interval '2 days', v_today - 2);

    INSERT INTO public.custom_accessories (id, name_en, name_bn, kind, per_jersey, low_stock_pcs, is_active, display_order) VALUES
        ('demo-acc-1', 'Demo silicon logo', 'ডেমো সিলিকন লোগো', 'logo',      1, 50, true, 90),
        ('demo-acc-2', 'Demo neck label',   'ডেমো গলার লেবেল',  'label',     1, 50, true, 91),
        ('demo-acc-3', 'Demo poly bag',     'ডেমো পলি ব্যাগ',    'packaging', 1, 50, true, 92);
    INSERT INTO public.accessory_moves (id, accessory_id, kind, reason, qty, cost_per_pc, total_cost, supplier_id, note, created_by, created_at) VALUES
        ('demo-am-1', 'demo-acc-1', 'purchase', NULL, 200, 12, 2400, 'demo-supplier-5', 'DEMO', v_admin, now() - interval '20 days'),
        ('demo-am-2', 'demo-acc-2', 'purchase', NULL, 300, 2,  600,  'demo-supplier-5', 'DEMO', v_admin, now() - interval '20 days'),
        ('demo-am-3', 'demo-acc-3', 'purchase', NULL, 40,  4,  160,  'demo-supplier-5', 'DEMO', v_admin, now() - interval '20 days'),
        ('demo-am-4', 'demo-acc-1', 'wastage', 'damaged', -5, 12, 60, NULL, 'DEMO', v_admin, now() - interval '5 days');

    -- ----------------------------------------------------------- design gallery
    INSERT INTO public.custom_gallery (id, image_url, images, title, caption, sport, category, is_published, display_order)
    SELECT 'demo-design-' || t.n, '/demo/' || t.img || '.svg', ARRAY['/demo/' || t.img || '.svg', '/demo/' || t.img2 || '.svg'], t.title, 'DEMO', 'football',
           (SELECT slug FROM public.custom_design_categories WHERE slug = t.cat), t.pub, 90 + t.n
    FROM (VALUES
        (1, 'argentina',  'brazil',     'Argentina style (demo)',  'country', true),
        (2, 'brazil',     'argentina',  'Brazil style (demo)',     'country', true),
        (3, 'bangladesh', 'club-white', 'Bangladesh style (demo)', 'country', true),
        (4, 'club-white', 'polo-navy',  'Club white (demo)',       'club',    true),
        (5, 'polo-navy',  'tee-black',  'Navy polo (demo)',        'special', true),
        (6, 'tee-black',  'kids-set',   'Hidden design (demo)',    'other',   false)
    ) AS t(n, img, img2, title, cat, pub);

    -- ------------------------------------------- a custom order in every status
    INSERT INTO public.custom_orders (id, order_number, customer_id, customer_name, customer_phone, locale, channel, source, sport, quantity, notes,
                                      fabric_id, fabric_name, sleeve, collar, with_names, with_numbers, delivery_method, delivery_zone, delivery_address,
                                      delivery_charge, estimated_price, final_price, advance_amount, status, status_reason, needed_by, due_date, is_rush, approved_at, created_at)
    SELECT 'demo-custom-' || t.n, 'CJ-DEMO-' || t.n, c.id, c.name, c.phone, 'bn', t.channel, 'upload', 'football', t.qty, 'ডেমো অর্ডার: ' || t.status,
           'demo-fabric-1', 'Demo Mesh', 'short', 'round', true, true, 'pickup', NULL, NULL, 0, t.qty * 500,
           CASE WHEN t.priced THEN t.qty * 500 END, CASE WHEN t.priced THEN t.qty * 150 END, t.status, t.reason,
           v_today + t.due, CASE WHEN t.approved THEN v_today + t.due END, t.rush, CASE WHEN t.approved THEN now() - make_interval(days => t.days - 1) END,
           now() - make_interval(days => t.days)
    FROM (VALUES
        (5,  'in_review',          'online', 1, 10, 10, false, false, false, NULL),
        (6,  'changes_needed',     'online', 2, 8,  12, false, false, false, 'লোগোর ছবি ঝাপসা, আবার দিন (ডেমো)'),
        (7,  'revision_requested', 'online', 3, 11, 9,  true,  false, false, NULL),
        (8,  'approved',           'online', 4, 12, 9,  true,  true,  false, NULL),
        (9,  'queued',             'shop',   5, 14, 5,  true,  true,  true,  NULL),
        (10, 'cutting',            'shop',   6, 15, 4,  true,  true,  false, NULL),
        (11, 'sewing',             'shop',   8, 18, -1, true,  true,  false, NULL), -- overdue
        (12, 'qc',                 'online', 9, 10, 1,  true,  true,  false, NULL),
        (13, 'ready',              'shop',   10, 12, 1, true,  true,  false, NULL),
        (14, 'rejected',           'online', 7, 6,  8,  false, false, false, 'এই ডিজাইন করা যাবে না (ডেমো)'),
        (15, 'cancelled',          'online', 6, 7,  8,  false, false, false, 'কাস্টমার বাতিল করেছেন (ডেমো)')
    ) AS t(n, status, channel, days, qty, due, priced, approved, rush, reason)
    JOIN public.customers c ON c.id = 'demo-cust-' || (1 + t.n % 6);

    -- 16: two designs, pants on one of them.
    INSERT INTO public.custom_orders (id, order_number, customer_id, customer_name, customer_phone, locale, channel, source, sport, quantity, notes,
                                      fabric_id, fabric_name, with_shorts, with_names, with_numbers, delivery_method, estimated_price, final_price, advance_amount, status, approved_at, due_date, files, items, estimate_breakdown)
    VALUES ('demo-custom-16', 'CJ-DEMO-16', 'demo-cust-6', 'মিরপুর টাইগার্স ক্লাব (ডেমো)', '01900000006', 'bn', 'shop', 'upload', 'other', 10, 'দুই ডিজাইন, একটিতে প্যান্ট (ডেমো)',
            'demo-fabric-1', 'Demo Mesh', true, true, true, 'pickup', 6250, 6250, 1875, 'queued', now(), v_today + 7, '[]',
            '[{"id":"d1","title":"Home (demo)","jersey":true,"fabric_id":"demo-fabric-1","fabric_name":"Demo Mesh","jersey_type":"round","choice":{"sleeve":"short","collar":"round","extras":["names","numbers"],"logo":"print"},"pant":{"option":"short-pant","fabric_id":"demo-fabric-2","fabric_name":"Demo Interlock"},"notes":"DEMO","files":[]},
              {"id":"d2","title":"Goalkeeper (demo)","jersey":true,"fabric_id":"demo-fabric-2","fabric_name":"Demo Interlock","jersey_type":"polo","choice":{"sleeve":"full","collar":"polo","extras":["names","numbers"],"logo":"print"},"pant":null,"notes":"DEMO","files":[]}]',
            '{"designs":true,"quantity":10,"subtotal":6250,"discountPercent":0,"discountAmount":0,"isRush":false,"rushAmount":0,"total":6250,"perPiece":625,"items":[{"id":"d1","title":"Home (demo)","pieces":5,"pants":5,"fullSleeves":0,"lines":[],"subtotal":3350,"choices":null,"pant":null},{"id":"d2","title":"Goalkeeper (demo)","pieces":5,"pants":0,"fullSleeves":5,"lines":[],"subtotal":2900,"choices":null,"pant":null}]}');

    -- The player list of every demo order, as long as its quantity.
    INSERT INTO public.custom_order_roster (id, custom_order_id, position, player_name, player_number, size, sleeve, item_id, pant_size)
    SELECT 'demo-roster-' || o.id || '-' || g, o.id, g - 1, 'Player ' || g, g::TEXT, (ARRAY['S', 'M', 'L', 'XL'])[1 + g % 4],
           CASE WHEN o.id = 'demo-custom-16' AND g > 5 THEN 'full' ELSE 'short' END,
           CASE WHEN o.id = 'demo-custom-16' THEN CASE WHEN g <= 5 THEN 'd1' ELSE 'd2' END END,
           CASE WHEN o.id = 'demo-custom-16' AND g <= 5 THEN (ARRAY['S', 'M', 'L', 'XL'])[1 + g % 4] END
    FROM public.custom_orders o, generate_series(1, o.quantity) g WHERE o.id LIKE 'demo-custom-%';

    INSERT INTO public.custom_order_events (id, custom_order_id, from_status, to_status, actor, created_at)
    SELECT 'demo-event-' || o.id || '-1', o.id, NULL, 'submitted', 'customer', o.created_at FROM public.custom_orders o WHERE o.id LIKE 'demo-custom-%'
    UNION ALL
    SELECT 'demo-event-' || o.id || '-2', o.id, 'submitted', o.status, 'staff', o.created_at + interval '1 hour'
    FROM public.custom_orders o WHERE o.id LIKE 'demo-custom-%' AND o.status <> 'submitted';

    INSERT INTO public.custom_order_messages (id, custom_order_id, author, body) VALUES
        ('demo-msg-1', 'demo-custom-2', 'staff',    'মকআপ পাঠানো হয়েছে, দেখে জানান। (ডেমো)'),
        ('demo-msg-2', 'demo-custom-7', 'customer', 'নম্বরটা একটু বড় করে দিন। (ডেমো)'),
        ('demo-msg-3', 'demo-custom-6', 'customer', 'কাল পরিষ্কার লোগো পাঠাবো। (ডেমো)');
    INSERT INTO public.custom_order_mockups (id, custom_order_id, version, images, note, created_by) VALUES
        ('demo-mockup-1', 'demo-custom-2', 1, ARRAY['/demo/bangladesh.svg'], 'DEMO', v_admin),
        ('demo-mockup-2', 'demo-custom-7', 1, ARRAY['/demo/argentina.svg'],  'DEMO', v_admin);
    UPDATE public.custom_orders SET revision_count = 1 WHERE id = 'demo-custom-7';

    -- Advances on orders in work; delivered is fully paid.
    INSERT INTO public.custom_order_payments (id, custom_order_id, kind, method, amount, status, recorded_by, created_at, paid_at)
    SELECT 'demo-cpay-' || o.id || '-1', o.id, 'advance', CASE WHEN o.channel = 'shop' THEN 'cash' ELSE 'bkash' END, o.advance_amount, 'successful', v_admin,
           o.created_at + interval '2 hours', o.created_at + interval '2 hours'
    FROM public.custom_orders o WHERE o.id LIKE 'demo-custom-%' AND o.advance_amount > 0
      AND o.status IN ('queued', 'cutting', 'printing', 'sewing', 'qc', 'ready', 'delivered');
    INSERT INTO public.custom_order_payments (id, custom_order_id, kind, method, amount, status, recorded_by, created_at, paid_at)
    SELECT 'demo-cpay-' || o.id || '-2', o.id, 'balance', 'bank', o.final_price + o.delivery_charge - o.advance_amount, 'successful', v_admin, now() - interval '2 days', now() - interval '2 days'
    FROM public.custom_orders o WHERE o.id = 'demo-custom-4';
    UPDATE public.custom_orders SET delivered_at = now() - interval '2 days' WHERE id = 'demo-custom-4';

    -- --------------------------------------------------------------- production
    INSERT INTO public.production_batches (id, batch_number, title, status, print_supplier_id, print_basis, print_qty, print_rate, print_cost, garments_supplier_id, note, created_by, created_at, done_at) VALUES
        ('demo-batch-1', 'PB-DEMO-1', 'অফিস টুর্নামেন্ট (ডেমো)', 'open', 'demo-supplier-3', 'piece', 40, 60, 2400, 'demo-supplier-4', 'DEMO', v_admin, now() - interval '3 days', NULL),
        ('demo-batch-2', 'PB-DEMO-2', 'শেষ হওয়া ব্যাচ (ডেমো)',   'done', 'demo-supplier-3', 'lump',  NULL, NULL, 900, 'demo-supplier-4', 'DEMO', v_admin, now() - interval '10 days', now() - interval '4 days');
    INSERT INTO public.production_batch_lines (id, batch_id, custom_order_id, label, pieces, sleeve, collar, garment_rate, position) VALUES
        ('demo-bl-1', 'demo-batch-1', 'demo-custom-3',  NULL, 22, 'short', 'round', 70, 1),
        ('demo-bl-2', 'demo-batch-1', 'demo-custom-11', NULL, 18, 'short', 'round', 70, 2),
        ('demo-bl-3', 'demo-batch-2', 'demo-custom-4',  NULL, 6,  'short', 'round', 75, 1),
        ('demo-bl-4', 'demo-batch-2', NULL, 'Sample (demo)', 2, 'full', 'polo', 90, 2);
    INSERT INTO public.production_costs (id, batch_id, kind, amount, note, position) VALUES
        ('demo-pc-1', 'demo-batch-1', 'transport', 400, 'DEMO', 1),
        ('demo-pc-2', 'demo-batch-1', 'food',      250, 'DEMO', 2),
        ('demo-pc-3', 'demo-batch-2', 'travel',    200, 'DEMO', 1);
    INSERT INTO public.fabric_moves (id, fabric_id, kind, kg, pieces, cost_per_kg, total_cost, batch_id, note, created_by, created_at, move_date) VALUES
        ('demo-fm-5', 'demo-fabric-1', 'used', -8.8,  40, 423.33, 3725.30, 'demo-batch-1', 'DEMO', v_admin, now() - interval '3 days', v_today - 3),
        ('demo-fm-6', 'demo-fabric-1', 'used', -1.76, 8,  423.33, 745.06,  'demo-batch-2', 'DEMO', v_admin, now() - interval '10 days', v_today - 10);
    INSERT INTO public.accessory_moves (id, accessory_id, kind, qty, cost_per_pc, total_cost, batch_id, note, created_by) VALUES
        ('demo-am-5', 'demo-acc-1', 'used', -40, 12, 480, 'demo-batch-1', 'DEMO', v_admin),
        ('demo-am-6', 'demo-acc-2', 'used', -48, 2,  96,  'demo-batch-1', 'DEMO', v_admin);

    -- ---------------------------------------------- website orders, 45 days back
    FOR i IN 1..30 LOOP
        v_at := now() - make_interval(days => 8 + (i * 37) % 38, hours => i % 10);
        SELECT price INTO v_price FROM public.products WHERE id = 'demo-prod-' || (1 + i % 5);
        v_qty := 1 + i % 3;
        SELECT * INTO r FROM public.customers WHERE id = 'demo-cust-' || (1 + i % 6);
        INSERT INTO public.orders (id, customer_id, customer_name, customer_phone, delivery_address, city, subtotal, shipping_fee, total_amount, payment_method, status, notes, created_at,
                                   delivered_at, confirmation_status, confirmed_at, risk_score, risk_level, utm_source)
        VALUES ('demo-order-h' || i, r.id, r.name, r.phone, 'ডেমো ঠিকানা', 'Dhaka', v_price * v_qty, 60, v_price * v_qty + 60, 'cod', 'delivered', 'DEMO order', v_at,
                v_at + interval '3 days', 'confirmed', v_at + interval '1 hour', 10, 'low', (ARRAY['facebook', 'google', 'instagram', NULL])[1 + i % 4]);
        INSERT INTO public.order_items (id, order_id, product_id, variant_id, title, size, color, quantity, unit_price, base_price, image)
        SELECT 'demo-item-h' || i, 'demo-order-h' || i, pr.id, 'demo-var-' || (1 + i % 5) || '-m', pr.title, 'M', '', v_qty, v_price, pr.regular_price, pr.images->>0
        FROM public.products pr WHERE pr.id = 'demo-prod-' || (1 + i % 5);
    END LOOP;

    -- Orders 1 and 2 need a person: a risky one and one waiting for a call.
    UPDATE public.orders SET confirmation_status = 'needs_call', risk_score = 75, risk_level = 'high', risk_reasons = '[]' WHERE id = 'demo-order-1';
    UPDATE public.orders SET confirmation_status = 'unconfirmed', risk_score = 35, risk_level = 'medium' WHERE id = 'demo-order-2';
    UPDATE public.orders SET confirmation_status = 'confirmed', confirmed_at = created_at WHERE id IN ('demo-order-3', 'demo-order-4', 'demo-order-5', 'demo-order-6', 'demo-order-8');
    UPDATE public.orders SET courier = 'manual', courier_tracking_code = 'DEMO-TRACK-4', courier_booked_at = created_at, shipped_at = created_at + interval '1 day', cod_expected = total_amount WHERE id = 'demo-order-4';
    UPDATE public.orders SET delivered_at = created_at + interval '2 days' WHERE id IN ('demo-order-5', 'demo-order-6', 'demo-order-8');

    -- Cash collected on every delivered order.
    INSERT INTO public.payments (id, order_id, type, provider, amount, status, purpose, recorded_by, created_at,
                                 payment_method_id)
    SELECT 'demo-payment-' || o.id, o.id, 'charge', 'cod', o.total_amount, 'successful', 'cod_settlement', v_admin, COALESCE(o.delivered_at, o.created_at),
           (SELECT id FROM public.payment_methods WHERE code = 'cod')
    FROM public.orders o WHERE o.id LIKE 'demo-order-%' AND o.status = 'delivered';

    INSERT INTO public.returns (id, order_id, reason, status, refund_amount, notes) VALUES
        ('demo-return-1', 'demo-order-5', 'সাইজ ছোট হয়েছে (ডেমো)',  'requested', 0, 'DEMO'),
        ('demo-return-2', 'demo-order-6', 'সেলাই খোলা (ডেমো)',      'approved',  0, 'DEMO'),
        ('demo-return-3', 'demo-order-8', 'রং ভিন্ন (ডেমো)',         'received',  0, 'DEMO');
    INSERT INTO public.return_items (id, return_id, order_item_id, quantity) VALUES
        ('demo-return-item-1', 'demo-return-1', 'demo-item-5', 1),
        ('demo-return-item-2', 'demo-return-2', 'demo-item-6', 1),
        ('demo-return-item-3', 'demo-return-3', 'demo-item-8', 1);
    INSERT INTO public.cancellations (id, order_id, type, reason, reason_category, status, notes) VALUES
        ('demo-cancel-1', 'demo-order-2', 'order', 'মত পাল্টেছি (ডেমো)',   'changed_mind',   'pending',  'DEMO'),
        ('demo-cancel-2', 'demo-order-7', 'order', 'দেরি হচ্ছে (ডেমো)',     'delivery_delay', 'executed', 'DEMO');
    -- A refund that is quoted but not paid out, ready to approve.
    INSERT INTO public.refunds (id, order_id, return_id, original_payment_id, status, provider, reason, notes)
    VALUES ('demo-refund-1', 'demo-order-8', 'demo-return-3', 'demo-payment-demo-order-8', 'quoted', 'cod', 'রং ভিন্ন (ডেমো)', 'DEMO');
    INSERT INTO public.refund_items (id, refund_id, order_item_id, quantity, unit_refund, line_total)
    SELECT 'demo-refund-item-1', 'demo-refund-1', oi.id, 1, oi.unit_price, oi.unit_price FROM public.order_items oi WHERE oi.id = 'demo-item-8';

    -- -------------------------------------------------------- unfinished checkouts
    INSERT INTO public.checkout_leads (session_id, phone, name, address, items, subtotal, status, notes, created_at)
    SELECT 'demo-lead-' || t.n, '0190000002' || t.n, 'ডেমো লিড ' || t.n, '{"division":"Dhaka","district":"Dhaka","thana":"Mirpur","line":"ডেমো ঠিকানা"}',
           jsonb_build_array(jsonb_build_object('product_id', 'demo-prod-1', 'title', 'Argentina Home Jersey 2026 (demo)', 'size', 'M', 'quantity', 1, 'unit_price', 1035)),
           1035, t.status, 'DEMO', now() - make_interval(hours => t.n * 5)
    FROM (VALUES (1, 'new'), (2, 'new'), (3, 'no_answer'), (4, 'call_later'), (5, 'not_interested')) AS t(n, status);

    -- -------------------------------------------------- shop sales, 45 days back
    IF v_admin IS NOT NULL THEN
        FOR i IN 1..40 LOOP
            v_at := now() - make_interval(days => 2 + (i * 29) % 44, hours => i % 8);
            v_variant := 'demo-var-' || (1 + i % 5) || '-' || (ARRAY['s', 'm', 'l', 'xl'])[1 + i % 4];
            SELECT price INTO v_price FROM public.products WHERE id = 'demo-prod-' || (1 + i % 5);
            v_qty := 1 + i % 2;
            v_method := (ARRAY['cash', 'bkash', 'cash', 'nagad', 'card'])[1 + (i / 2) % 5];
            v_id := 'demo-sale-h' || i;
            SELECT * INTO r FROM public.customers WHERE id = CASE WHEN i % 3 = 0 THEN 'demo-cust-' || (1 + i % 6) END;
            INSERT INTO public.pos_sales (id, receipt_no, showroom_id, customer_id, customer_name, customer_phone, subtotal, total, cash_tendered, sold_by, created_at)
            VALUES (v_id, 'DEMO-H' || i, v_main, r.id, r.name, r.phone, v_price * v_qty, v_price * v_qty, CASE WHEN v_method = 'cash' THEN v_price * v_qty ELSE 0 END, v_admin, v_at);
            INSERT INTO public.pos_sale_items (id, sale_id, product_id, variant_id, title, variant_label, sku, quantity, base_price, unit_price, line_total, cost_price)
            SELECT 'demo-sale-item-h' || i, v_id, pr.id, v.id, pr.title, upper(split_part(v.id, '-', 4)), v.sku, v_qty, pr.regular_price, v_price, v_price * v_qty, v.cost_price
            FROM public.products pr JOIN public.product_variants v ON v.product_id = pr.id WHERE v.id = v_variant;
            INSERT INTO public.pos_payments (id, sale_id, type, method, amount, recorded_by, created_at)
            VALUES ('demo-pay-h' || i, v_id, 'charge', v_method, v_price * v_qty, v_admin, v_at);
            PERFORM public.stock_apply(v_variant, v_main, -v_qty, 'pos_sale', v_id, 'DEMO-H' || i, v_admin);
            UPDATE public.inventory_movements SET created_at = v_at WHERE reference_id = v_id;
        END LOOP;

        -- A part return (bKash, so no drawer is needed).
        PERFORM public.pos_return_sale(jsonb_build_object('actor', v_admin, 'sale_id', 'demo-sale-3', 'refund_method', 'bkash', 'reason', 'সাইজ বদল (ডেমো)',
            'restock', true, 'items', jsonb_build_array(jsonb_build_object('sale_item_id', 'demo-sale-item-3', 'quantity', 1))));

        -- Yesterday's drawer: float 2000 + one cash sale + moves, 10 short.
        INSERT INTO public.pos_cash_moves (id, session_id, amount, reason, created_by, created_at) VALUES
            ('demo-move-1', 'demo-session-1', -300, 'চা-নাস্তা (ডেমো)', v_admin, now() - interval '1 day 6 hours'),
            ('demo-move-2', 'demo-session-1', 500,  'খুচরা টাকা (ডেমো)', v_admin, now() - interval '1 day 4 hours');
        SELECT 2200 + COALESCE(sum(amount), 0) INTO v_price FROM public.pos_payments WHERE session_id = 'demo-session-1' AND method = 'cash' AND type = 'charge';
        UPDATE public.pos_sessions SET expected_cash = v_price, counted_cash = v_price - 10, difference = -10 WHERE id = 'demo-session-1';
    END IF;
END $$;
