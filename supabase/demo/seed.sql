-- Demo data, so every screen has something to look at: 8 products with
-- stock in two shops, website orders in every status, shop (POS) sales,
-- custom jersey orders, customers, a coupon, reviews and a supplier.
--
-- Every row's id starts with "demo-". supabase/demo/remove.sql deletes them
-- all. Running this again first removes the old demo rows, so it is safe to
-- repeat. Run with: node scripts/demo-data.mjs seed
--
-- Demo customers are opted out of marketing so a promo SMS never goes to
-- these made-up numbers. Demo website orders do not reserve stock.

DO $$
DECLARE
    -- The first admin "owns" the demo shop sales and reviews.
    v_admin UUID := (SELECT id FROM public.profiles WHERE role IN ('super_admin', 'admin') ORDER BY created_at LIMIT 1);
    v_main TEXT := (SELECT id FROM public.showrooms WHERE is_active AND id NOT LIKE 'demo-%' ORDER BY fulfillment_priority LIMIT 1);
    v_branch TEXT := 'demo-shop-uttara';
    p RECORD;
    s RECORD;
    v_variant TEXT;
    v_price NUMERIC;
    v_n INTEGER := 0;
BEGIN
    INSERT INTO public.showrooms (id, name, slug, address, is_active, fulfillment_priority)
    VALUES (v_branch, 'উত্তরা শাখা (ডেমো)', v_branch, 'সেক্টর ৭, উত্তরা, ঢাকা', true, 90);
    v_main := COALESCE(v_main, v_branch);

    INSERT INTO public.categories (id, slug, name, name_bn, "group", is_active, display_order) VALUES
        ('demo-cat-jersey', 'demo-jersey', 'Jersey (demo)', 'জার্সি (ডেমো)', 'topwear', true, 90),
        ('demo-cat-casual', 'demo-casual', 'Casual wear (demo)', 'ক্যাজুয়াল (ডেমো)', 'topwear', true, 91);

    INSERT INTO public.suppliers (id, name, phone, address, notes, lead_days, is_active)
    VALUES ('demo-supplier-1', 'ঢাকা স্পোর্টস ফ্যাব্রিক্স (ডেমো)', '01711000000', 'ইসলামপুর, ঢাকা', 'DEMO', 5, true);

    INSERT INTO public.customers (id, phone, name, first_seen_channel, preferred_locale, marketing_opt_out, notes) VALUES
        ('demo-cust-1', '01900000001', 'রাকিব হাসান (ডেমো)',  'online', 'bn', true, 'DEMO'),
        ('demo-cust-2', '01900000002', 'সুমাইয়া আক্তার (ডেমো)', 'online', 'bn', true, 'DEMO'),
        ('demo-cust-3', '01900000003', 'তানভীর আহমেদ (ডেমো)', 'shop',   'bn', true, 'DEMO'),
        ('demo-cust-4', '01900000004', 'নুসরাত জাহান (ডেমো)',  'online', 'bn', true, 'DEMO'),
        ('demo-cust-5', '01900000005', 'Imran Khan (demo)',    'shop',   'en', true, 'DEMO'),
        ('demo-cust-6', '01900000006', 'মিরপুর টাইগার্স ক্লাব (ডেমো)', 'online', 'bn', true, 'DEMO')
    ON CONFLICT DO NOTHING;

    -- Products. price = what the customer pays; regular = before the discount.
    FOR p IN
        SELECT * FROM (VALUES
            (1, 'argentina',  'Argentina Home Jersey 2026', 'আর্জেন্টিনা হোম জার্সি ২০২৬', 'demo-cat-jersey', 1150, 10, 520, 'men',  true),
            (2, 'brazil',     'Brazil Home Jersey 2026',    'ব্রাজিল হোম জার্সি ২০২৬',    'demo-cat-jersey', 1150,  0, 520, 'men',  true),
            (3, 'bangladesh', 'Bangladesh Cricket Jersey',  'বাংলাদেশ ক্রিকেট জার্সি',     'demo-cat-jersey', 1250,  0, 580, 'men',  true),
            (4, 'club-white', 'Club Classic White Jersey',  'ক্লাব ক্লাসিক সাদা জার্সি',    'demo-cat-jersey',  990,  0, 450, 'men',  false),
            (5, 'polo-navy',  'Premium Polo Shirt (Navy)',  'প্রিমিয়াম পোলো শার্ট (নেভি)', 'demo-cat-casual',  850,  0, 380, 'men',  false),
            (6, 'tee-black',  'Training T-Shirt (Black)',   'ট্রেনিং টি-শার্ট (কালো)',     'demo-cat-casual',  550, 15, 230, 'men',  false),
            (7, 'kids-set',   'Kids Football Jersey Set',   'শিশুদের ফুটবল জার্সি সেট',    'demo-cat-jersey',  750,  0, 330, 'kids', true),
            (8, 'trouser',    'Sports Trouser',             'স্পোর্টস ট্রাউজার',           'demo-cat-casual',  690,  0, 300, 'men',  false)
        ) AS t(n, key, title, title_bn, category_id, regular, pct, cost, gender, featured)
    LOOP
        v_price := round(p.regular * (100 - p.pct) / 100.0);
        INSERT INTO public.products (
            id, slug, title, title_bn, category_id, description, description_bn, short_description, short_description_bn,
            price, original_price, regular_price, discount_type, discount_value, discount_percent, discount_mode,
            status, images, colors, sizes, stock, rating, reviews_count, is_featured, gender, cost_price, tags, published_at
        ) VALUES (
            'demo-prod-' || p.n, 'demo-' || p.key, p.title || ' (demo)', p.title_bn || ' (ডেমো)', p.category_id,
            'Demo product for trying the system. Breathable sports fabric, regular fit.',
            'সিস্টেম পরীক্ষা করার জন্য ডেমো পণ্য। আরামদায়ক স্পোর্টস কাপড়, রেগুলার ফিট।',
            'Demo product — safe to edit or delete.', 'ডেমো পণ্য — সম্পাদনা বা মুছে ফেলা যাবে।',
            v_price, p.regular, p.regular, 'percentage', p.pct, p.pct, CASE WHEN p.pct > 0 THEN 'comparison' ELSE 'none' END,
            'published', jsonb_build_array('/demo/' || p.key || '.svg'), '[]'::jsonb,
            '[{"size":"S","chest":"97","stock":0},{"size":"M","chest":"102","stock":0},{"size":"L","chest":"107","stock":0},{"size":"XL","chest":"112","stock":0}]'::jsonb,
            0, 4.5, 0, p.featured, p.gender, p.cost, ARRAY['demo'], now()
        );

        -- One variant per size, each with a barcode the POS can scan or type.
        FOR s IN SELECT * FROM (VALUES (1, 'size-s', 'S'), (2, 'size-m', 'M'), (3, 'size-l', 'L'), (4, 'size-xl', 'XL')) AS z(i, size_id, label)
        LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.sizes WHERE id = s.size_id);
            v_variant := 'demo-var-' || p.n || '-' || lower(s.label);
            INSERT INTO public.product_variants (id, product_id, size_id, sku, barcode, stock, cost_price, is_active)
            VALUES (v_variant, 'demo-prod-' || p.n, s.size_id, 'DEMO-' || upper(p.key) || '-' || s.label, '29000' || p.n || '0' || s.i, 0, p.cost, true);

            -- Stock goes in through stock_apply(), the same way "Stock in" does,
            -- so the history tab has entries. Two items are left low / empty on
            -- purpose so the low-stock alerts show.
            IF NOT (p.n = 6 AND s.label = 'S') THEN
                PERFORM public.stock_apply(v_variant, v_main, CASE WHEN p.n = 8 AND s.label = 'XL' THEN 2 ELSE 8 END, 'stock_in', 'demo-receipt', 'Demo stock', v_admin, p.cost);
            END IF;
            IF v_main <> v_branch AND p.n <= 5 THEN
                PERFORM public.stock_apply(v_variant, v_branch, 4, 'stock_in', 'demo-receipt', 'Demo stock', v_admin, p.cost);
            END IF;
        END LOOP;

        UPDATE public.products pr
        SET sizes = COALESCE((
            SELECT jsonb_agg(jsonb_build_object('size', z.name, 'chest', '', 'stock', v.stock) ORDER BY z.display_order)
            FROM public.product_variants v JOIN public.sizes z ON z.id = v.size_id
            WHERE v.product_id = pr.id), pr.sizes)
        WHERE pr.id = 'demo-prod-' || p.n;
    END LOOP;

    -- Website orders: one in every status, spread over the last week.
    FOR p IN
        SELECT * FROM (VALUES
            (1, 'demo-cust-1', 'রাকিব হাসান (ডেমো)',   '01900000001', 'Dhaka',      60, 'pending',    0,  1, 'M', 2),
            (2, 'demo-cust-2', 'সুমাইয়া আক্তার (ডেমো)', '01900000002', 'Dhaka',      60, 'pending',    0,  3, 'L', 1),
            (3, 'demo-cust-4', 'নুসরাত জাহান (ডেমো)',   '01900000004', 'Chattogram', 120, 'processing', 1,  5, 'M', 1),
            (4, 'demo-cust-1', 'রাকিব হাসান (ডেমো)',   '01900000001', 'Dhaka',      60, 'shipped',    2,  2, 'L', 1),
            (5, 'demo-cust-2', 'সুমাইয়া আক্তার (ডেমো)', '01900000002', 'Sylhet',     120, 'delivered',  3,  7, 'S', 2),
            (6, 'demo-cust-4', 'নুসরাত জাহান (ডেমো)',   '01900000004', 'Dhaka',      60, 'delivered',  5,  6, 'M', 3),
            (7, 'demo-cust-1', 'রাকিব হাসান (ডেমো)',   '01900000001', 'Khulna',     120, 'cancelled',  4,  4, 'XL', 1),
            (8, 'demo-cust-6', 'মিরপুর টাইগার্স ক্লাব (ডেমো)', '01900000006', 'Dhaka', 60, 'delivered',  6,  3, 'L', 4)
        ) AS t(n, customer_id, name, phone, city, shipping, status, days_ago, product_n, size, qty)
    LOOP
        SELECT price INTO v_price FROM public.products WHERE id = 'demo-prod-' || p.product_n;
        INSERT INTO public.orders (id, customer_id, customer_name, customer_phone, delivery_address, city, subtotal, shipping_fee, total_amount, payment_method, status, notes, created_at)
        VALUES ('demo-order-' || p.n, p.customer_id, p.name, p.phone, 'বাড়ি ১২, রোড ৫ (ডেমো ঠিকানা)', p.city, v_price * p.qty, p.shipping, v_price * p.qty + p.shipping, 'cod', p.status, 'DEMO order',
                now() - make_interval(days => p.days_ago, hours => p.n));
        INSERT INTO public.order_items (id, order_id, product_id, variant_id, title, size, color, quantity, unit_price, base_price, image)
        SELECT 'demo-item-' || p.n, 'demo-order-' || p.n, pr.id, 'demo-var-' || p.product_n || '-' || lower(p.size), pr.title, p.size, '', p.qty, v_price, pr.regular_price, pr.images->>0
        FROM public.products pr WHERE pr.id = 'demo-prod-' || p.product_n;
    END LOOP;

    -- Shop (POS) sales need a staff member; skipped if there is no admin yet.
    IF v_admin IS NOT NULL THEN
        INSERT INTO public.pos_sessions (id, showroom_id, opened_by, opened_at, opening_float, status, closed_by, closed_at, expected_cash, counted_cash, difference, note)
        VALUES ('demo-session-1', v_main, v_admin, now() - interval '1 day 9 hours', 2000, 'closed', v_admin, now() - interval '1 day', 4300, 4300, 0, 'DEMO day');

        FOR p IN
            SELECT * FROM (VALUES
                (1, 'demo-session-1', v_main,   'demo-cust-3', 'তানভীর আহমেদ (ডেমো)', '01900000003', 3, 'M', 1, 'cash',  interval '1 day 5 hours'),
                (2, 'demo-session-1', v_main,   'demo-cust-5', 'Imran Khan (demo)',   '01900000005', 1, 'L', 1, 'bkash', interval '1 day 3 hours'),
                (3, NULL,             v_main,   NULL,          NULL,                  NULL,          5, 'L', 2, 'cash',  interval '2 hours'),
                (4, NULL,             v_branch, 'demo-cust-3', 'তানভীর আহমেদ (ডেমো)', '01900000003', 2, 'M', 1, 'nagad', interval '1 hour'),
                (5, NULL,             v_branch, NULL,          NULL,                  NULL,          4, 'S', 1, 'card',  interval '30 minutes')
            ) AS t(n, session_id, showroom_id, customer_id, name, phone, product_n, size, qty, method, ago)
        LOOP
            v_variant := 'demo-var-' || p.product_n || '-' || lower(p.size);
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_variant);
            SELECT price INTO v_price FROM public.products WHERE id = 'demo-prod-' || p.product_n;
            INSERT INTO public.pos_sales (id, receipt_no, session_id, showroom_id, customer_id, customer_name, customer_phone, subtotal, total, cash_tendered, sold_by, created_at)
            VALUES ('demo-sale-' || p.n, 'DEMO-' || (1000 + p.n), p.session_id, p.showroom_id, p.customer_id, p.name, p.phone, v_price * p.qty, v_price * p.qty,
                    CASE WHEN p.method = 'cash' THEN v_price * p.qty ELSE 0 END, v_admin, now() - p.ago);
            INSERT INTO public.pos_sale_items (id, sale_id, product_id, variant_id, title, variant_label, sku, quantity, base_price, unit_price, line_total, cost_price)
            SELECT 'demo-sale-item-' || p.n, 'demo-sale-' || p.n, pr.id, v_variant, pr.title, p.size, v.sku, p.qty, pr.regular_price, v_price, v_price * p.qty, v.cost_price
            FROM public.products pr JOIN public.product_variants v ON v.id = v_variant WHERE pr.id = 'demo-prod-' || p.product_n;
            INSERT INTO public.pos_payments (id, sale_id, session_id, type, method, amount, recorded_by, created_at)
            VALUES ('demo-pay-' || p.n, 'demo-sale-' || p.n, p.session_id, 'charge', p.method, v_price * p.qty, v_admin, now() - p.ago);
            PERFORM public.stock_apply(v_variant, p.showroom_id, -p.qty, 'pos_sale', 'demo-sale-' || p.n, 'DEMO-' || (1000 + p.n), v_admin);
        END LOOP;

        -- Reviews: two shown on the site, one waiting for approval.
        INSERT INTO public.product_reviews (id, product_id, user_id, author_name, rating, title, body, status) VALUES
            ('demo-review-1', 'demo-prod-1', v_admin, 'রাকিব (ডেমো)',   5, 'দারুণ জার্সি', 'কাপড় খুব আরামদায়ক, সাইজও ঠিক আছে। ডেলিভারি দ্রুত পেয়েছি।', 'approved'),
            ('demo-review-2', 'demo-prod-3', v_admin, 'সুমাইয়া (ডেমো)', 4, 'ভালো মানের',  'প্রিন্ট সুন্দর, রং উজ্জ্বল। একটু বড় সাইজ নিলে ভালো হতো।', 'approved'),
            ('demo-review-3', 'demo-prod-5', v_admin, 'Imran (demo)',   5, 'Great polo',  'Nice fabric and the fit is right. Waiting for approval (demo).', 'pending')
        ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.product_questions (id, product_id, author_name, question, answer, answered_at, status) VALUES
        ('demo-question-1', 'demo-prod-1', 'নুসরাত (ডেমো)', 'নাম ও নম্বর প্রিন্ট করা যাবে?', 'জি, কাস্টম জার্সি পেজ থেকে অর্ডার করলে নাম ও নম্বর দেওয়া যায়।', now(), 'approved'),
        ('demo-question-2', 'demo-prod-3', 'তানভীর (ডেমো)', 'XXL সাইজ কবে আসবে?', NULL, NULL, 'pending');

    -- Custom jersey orders at different stages of the board.
    INSERT INTO public.custom_orders (id, order_number, customer_id, customer_name, customer_phone, locale, channel, source, sport, quantity, notes,
                                      delivery_method, delivery_zone, delivery_address, estimated_price, final_price, advance_amount, status, created_at) VALUES
        ('demo-custom-1', 'CJ-DEMO-1', 'demo-cust-6', 'মিরপুর টাইগার্স ক্লাব (ডেমো)', '01900000006', 'bn', 'online', 'template', 'football', 16, 'লাল-কালো ডিজাইন, পিছনে নাম ও নম্বর। (ডেমো)', 'delivery', 'dhaka', 'মিরপুর ১০, ঢাকা', 12800, NULL,  NULL, 'submitted',   now() - interval '3 hours'),
        ('demo-custom-2', 'CJ-DEMO-2', 'demo-cust-1', 'রাকিব হাসান (ডেমো)',          '01900000001', 'bn', 'online', 'template', 'cricket',  12, 'সবুজ জার্সি, স্পনসর লোগো সহ। (ডেমো)',         'delivery', 'dhaka', 'ধানমন্ডি, ঢাকা',  10200, 10500, 5250, 'mockup_sent', now() - interval '2 days'),
        ('demo-custom-3', 'CJ-DEMO-3', 'demo-cust-5', 'Imran Khan (demo)',           '01900000005', 'en', 'shop',   'upload',   'football', 22, 'Office tournament kit. (demo)',              'pickup',   NULL,    NULL,              18700, 18000, 9000, 'printing',    now() - interval '5 days'),
        ('demo-custom-4', 'CJ-DEMO-4', 'demo-cust-4', 'নুসরাত জাহান (ডেমো)',          '01900000004', 'bn', 'online', 'template', 'badminton', 6, 'মেয়েদের টিমের জন্য। (ডেমো)',                 'delivery', 'outside', 'চট্টগ্রাম',      4800,  4800, 2400, 'delivered',   now() - interval '12 days');

    INSERT INTO public.coupons (id, code, description, applies_to, discount_type, discount_value, minimum_order_value, max_uses_per_user, starts_at, ends_at, status)
    VALUES ('demo-coupon-1', 'DEMO10', 'Demo coupon: 10% off orders over ৳500', 'order', 'percentage', 10, 500, 5, now() - interval '1 day', now() + interval '90 days', 'active');
END $$;
