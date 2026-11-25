-- Demo accessories by sport (home page section), with colour and size/option variants.
-- Runs after seed.sql + seed-extra.sql, or alone: node scripts/demo-data.mjs accessories
-- Things like weight, grip, string gauge and speed are rows in sizes: the shop, the
-- checkout and the POS pick a variant by colour + size.
DO $$
DECLARE
    v_admin UUID := (SELECT id FROM public.profiles WHERE role IN ('super_admin', 'admin') ORDER BY (role = 'super_admin') DESC, id LIMIT 1);
    v_main TEXT := COALESCE((SELECT id FROM public.showrooms WHERE is_active AND id NOT LIKE 'demo-%' ORDER BY fulfillment_priority LIMIT 1), 'demo-shop-uttara');
    p RECORD;
    v RECORD;
    v_id TEXT;
    v_variant TEXT;
    v_cost NUMERIC;
BEGIN
    INSERT INTO public.categories (id, slug, name, name_bn, "group", is_active, display_order) VALUES
        ('demo-cat-accessories', 'demo-accessories', 'Accessories (demo)', 'এক্সেসরিজ (ডেমো)', 'topwear', true, 92);
    INSERT INTO public.categories (id, slug, name, name_bn, "group", parent_id, is_active, display_order) VALUES
        ('demo-cat-acc-badminton', 'demo-acc-badminton', 'Badminton', 'ব্যাডমিন্টন', 'topwear', 'demo-cat-accessories', true, 1),
        ('demo-cat-acc-cricket',   'demo-acc-cricket',   'Cricket',   'ক্রিকেট',    'topwear', 'demo-cat-accessories', true, 2),
        ('demo-cat-acc-football',  'demo-acc-football',  'Football',  'ফুটবল',     'topwear', 'demo-cat-accessories', true, 3);

    -- The two demo products without sizes belong here too (10 is sold out).
    UPDATE public.products SET sub_category_id = 'demo-cat-acc-football',
        images = jsonb_build_array(CASE id WHEN 'demo-prod-9' THEN '/demo/football.svg' ELSE '/demo/shin-guard.svg' END)
    WHERE id IN ('demo-prod-9', 'demo-prod-10');

    INSERT INTO public.colors (id, name, hex, is_active, display_order) VALUES
        ('demo-color-red', 'Bright Red', '#D32F2F', true, 90),
        ('demo-color-blue', 'Blue', '#1D4ED8', true, 91),
        ('demo-color-black', 'Black', '#1F2937', true, 92),
        ('demo-color-white', 'White', '#FFFFFF', true, 93),
        ('demo-color-yellow', 'Yellow', '#FACC15', true, 94),
        ('demo-color-green', 'Green', '#15803D', true, 95),
        ('demo-color-orange', 'Orange', '#EA580C', true, 96),
        ('demo-color-pink', 'Pink', '#EC4899', true, 97);

    INSERT INTO public.sizes (id, name, display_name, type, is_active, display_order, sort_key) VALUES
        ('demo-size-3u-g5', '3U / G5', '3U / G5', 'accessory', true, 100, 100),
        ('demo-size-4u-g5', '4U / G5', '4U / G5', 'accessory', true, 101, 101),
        ('demo-size-4u-g6', '4U / G6', '4U / G6', 'accessory', true, 102, 102),
        ('demo-size-speed-76', 'Speed 76', 'Speed 76', 'accessory', true, 103, 103),
        ('demo-size-speed-77', 'Speed 77', 'Speed 77', 'accessory', true, 104, 104),
        ('demo-size-speed-78', 'Speed 78', 'Speed 78', 'accessory', true, 105, 105),
        ('demo-size-slow', 'Slow', 'Slow', 'accessory', true, 106, 106),
        ('demo-size-medium', 'Medium', 'Medium', 'accessory', true, 107, 107),
        ('demo-size-fast', 'Fast', 'Fast', 'accessory', true, 108, 108),
        ('demo-size-0-65-mm', '0.65 mm', '0.65 mm', 'accessory', true, 109, 109),
        ('demo-size-0-68-mm', '0.68 mm', '0.68 mm', 'accessory', true, 110, 110),
        ('demo-size-0-70-mm', '0.70 mm', '0.70 mm', 'accessory', true, 111, 111),
        ('demo-size-3-rackets', '3 rackets', '3 rackets', 'accessory', true, 112, 112),
        ('demo-size-6-rackets', '6 rackets', '6 rackets', 'accessory', true, 113, 113),
        ('demo-size-size-5', 'Size 5', 'Size 5', 'accessory', true, 114, 114),
        ('demo-size-size-6', 'Size 6', 'Size 6', 'accessory', true, 115, 115),
        ('demo-size-short-handle', 'Short handle', 'Short handle', 'accessory', true, 116, 116),
        ('demo-size-long-handle', 'Long handle', 'Long handle', 'accessory', true, 117, 117),
        ('demo-size-light', 'Light', 'Light', 'accessory', true, 118, 118),
        ('demo-size-heavy', 'Heavy', 'Heavy', 'accessory', true, 119, 119),
        ('demo-size-youth-135-g', 'Youth 135 g', 'Youth 135 g', 'accessory', true, 120, 120),
        ('demo-size-senior-156-g', 'Senior 156 g', 'Senior 156 g', 'accessory', true, 121, 121),
        ('demo-size-right-hand', 'Right hand', 'Right hand', 'accessory', true, 122, 122),
        ('demo-size-left-hand', 'Left hand', 'Left hand', 'accessory', true, 123, 123),
        ('demo-size-youth', 'Youth', 'Youth', 'accessory', true, 124, 124),
        ('demo-size-adult', 'Adult', 'Adult', 'accessory', true, 125, 125),
        ('demo-size-size-3', 'Size 3', 'Size 3', 'accessory', true, 126, 126),
        ('demo-size-size-4', 'Size 4', 'Size 4', 'accessory', true, 127, 127),
        ('demo-size-glove-8', 'Glove 8', 'Glove 8', 'accessory', true, 128, 128),
        ('demo-size-glove-9', 'Glove 9', 'Glove 9', 'accessory', true, 129, 129),
        ('demo-size-glove-10', 'Glove 10', 'Glove 10', 'accessory', true, 130, 130),
        ('demo-size-39', '39', '39', 'shoe', true, 131, 131),
        ('demo-size-40', '40', '40', 'shoe', true, 132, 132),
        ('demo-size-41', '41', '41', 'shoe', true, 133, 133),
        ('demo-size-42', '42', '42', 'shoe', true, 134, 134),
        ('demo-size-43', '43', '43', 'shoe', true, 135, 135);

    FOR p IN
        SELECT * FROM (VALUES
            ('racket', 'badminton', 'Carbon Badminton Racket', 'কার্বন ব্যাডমিন্টন র‍্যাকেট', 1850, ARRAY['red', 'blue', 'black']::TEXT[], ARRAY['demo-size-3u-g5', 'demo-size-4u-g5', 'demo-size-4u-g6']::TEXT[]),
            ('shuttle-feather', 'badminton', 'Feather Shuttlecock (12 pcs)', 'ফেদার শাটলকক (১২ পিস)', 1450, ARRAY['white']::TEXT[], ARRAY['demo-size-speed-76', 'demo-size-speed-77', 'demo-size-speed-78']::TEXT[]),
            ('shuttle-nylon', 'badminton', 'Nylon Shuttlecock (6 pcs)', 'নাইলন শাটলকক (৬ পিস)', 550, ARRAY['white', 'yellow']::TEXT[], ARRAY['demo-size-slow', 'demo-size-medium', 'demo-size-fast']::TEXT[]),
            ('string', 'badminton', 'Badminton String', 'ব্যাডমিন্টন স্ট্রিং', 450, ARRAY['white', 'yellow', 'blue', 'black']::TEXT[], ARRAY['demo-size-0-65-mm', 'demo-size-0-68-mm', 'demo-size-0-70-mm']::TEXT[]),
            ('grip', 'badminton', 'Racket Grip Tape', 'র‍্যাকেট গ্রিপ টেপ', 120, ARRAY['red', 'blue', 'black', 'white', 'yellow']::TEXT[], ARRAY[]::TEXT[]),
            ('racket-bag', 'badminton', 'Racket Bag', 'র‍্যাকেট ব্যাগ', 1200, ARRAY['black', 'blue', 'red']::TEXT[], ARRAY['demo-size-3-rackets', 'demo-size-6-rackets']::TEXT[]),
            ('cricket-bat', 'cricket', 'English Willow Cricket Bat', 'ইংলিশ উইলো ক্রিকেট ব্যাট', 6500, ARRAY['red', 'blue']::TEXT[], ARRAY['demo-size-size-5', 'demo-size-size-6', 'demo-size-short-handle', 'demo-size-long-handle']::TEXT[]),
            ('tape-bat', 'cricket', 'Tape Tennis Bat', 'টেপ টেনিস ব্যাট', 1350, ARRAY['green', 'orange', 'black']::TEXT[], ARRAY['demo-size-light', 'demo-size-heavy']::TEXT[]),
            ('cricket-ball', 'cricket', 'Leather Cricket Ball', 'লেদার ক্রিকেট বল', 650, ARRAY['red', 'white', 'pink']::TEXT[], ARRAY['demo-size-youth-135-g', 'demo-size-senior-156-g']::TEXT[]),
            ('batting-gloves', 'cricket', 'Batting Gloves', 'ব্যাটিং গ্লাভস', 1100, ARRAY['white', 'blue']::TEXT[], ARRAY['demo-size-right-hand', 'demo-size-left-hand']::TEXT[]),
            ('batting-pads', 'cricket', 'Batting Pads', 'ব্যাটিং প্যাড', 1900, ARRAY['white', 'blue']::TEXT[], ARRAY['demo-size-youth', 'demo-size-adult']::TEXT[]),
            ('cricket-helmet', 'cricket', 'Cricket Helmet', 'ক্রিকেট হেলমেট', 2200, ARRAY['blue', 'green', 'red']::TEXT[], ARRAY['size-s', 'size-m', 'size-l']::TEXT[]),
            ('training-football', 'football', 'Training Football', 'ট্রেনিং ফুটবল', 950, ARRAY['white', 'yellow', 'orange']::TEXT[], ARRAY['demo-size-size-3', 'demo-size-size-4', 'demo-size-size-5']::TEXT[]),
            ('keeper-gloves', 'football', 'Goalkeeper Gloves', 'গোলকিপার গ্লাভস', 950, ARRAY['green', 'orange', 'black']::TEXT[], ARRAY['demo-size-glove-8', 'demo-size-glove-9', 'demo-size-glove-10']::TEXT[]),
            ('shin-pads', 'football', 'Pro Shin Pads', 'প্রো শিন প্যাড', 480, ARRAY['white', 'black', 'red']::TEXT[], ARRAY['size-s', 'size-m', 'size-l']::TEXT[]),
            ('football-socks', 'football', 'Football Socks', 'ফুটবল মোজা', 220, ARRAY['white', 'black', 'red', 'blue']::TEXT[], ARRAY[]::TEXT[]),
            ('football-boots', 'football', 'Football Boots', 'ফুটবল বুট', 2400, ARRAY['black', 'red', 'blue']::TEXT[], ARRAY['demo-size-39', 'demo-size-40', 'demo-size-41', 'demo-size-42', 'demo-size-43']::TEXT[]),
            ('kit-bag', 'football', 'Football Kit Bag', 'ফুটবল কিট ব্যাগ', 850, ARRAY['black', 'green', 'red']::TEXT[], ARRAY[]::TEXT[])
        ) AS t(key, sport, title, title_bn, price, color_keys, size_ids)
    LOOP
        v_id := 'demo-acc-' || p.key;
        v_cost := round(p.price * 0.6);
        INSERT INTO public.products (id, slug, title, title_bn, category_id, sub_category_id, description, description_bn, price, original_price, regular_price,
                                     discount_type, discount_value, discount_percent, discount_mode, status, images, colors, sizes, stock, is_featured, cost_price, tags, published_at)
        VALUES (v_id, v_id, p.title || ' (demo)', p.title_bn || ' (ডেমো)', 'demo-cat-accessories', 'demo-cat-acc-' || p.sport,
                'Demo accessory.', 'ডেমো এক্সেসরিজ।', p.price, p.price, p.price, 'percentage', 0, 0, 'none', 'published',
                (SELECT jsonb_agg('/demo/' || p.key || '-' || k || '.svg' ORDER BY n) FROM unnest(p.color_keys) WITH ORDINALITY AS c(k, n)),
                (SELECT jsonb_agg(jsonb_build_object('name', c.name, 'hex', c.hex) ORDER BY x.n) FROM unnest(p.color_keys) WITH ORDINALITY AS x(k, n) JOIN public.colors c ON c.id = 'demo-color-' || x.k),
                '[]'::jsonb, 0, false, v_cost, ARRAY['demo'], now());
        INSERT INTO public.product_colors (id, product_id, color_id, sort_order)
        SELECT 'demo-pc-' || p.key || '-' || x.k, v_id, 'demo-color-' || x.k, x.n FROM unnest(p.color_keys) WITH ORDINALITY AS x(k, n);
        INSERT INTO public.product_sizes (id, product_id, size_id, sort_order)
        SELECT 'demo-ps-' || p.key || '-' || x.s, v_id, x.s, x.n FROM unnest(p.size_ids) WITH ORDINALITY AS x(s, n);

        -- Every colour with every option; a product without options gets one variant per colour.
        FOR v IN
            SELECT c.k AS color_key, z.s AS size_id
            FROM unnest(p.color_keys) AS c(k) LEFT JOIN unnest(p.size_ids) AS z(s) ON true
        LOOP
            v_variant := 'demo-var-' || p.key || '-' || v.color_key || COALESCE('-' || replace(v.size_id, 'demo-size-', ''), '');
            INSERT INTO public.product_variants (id, product_id, color_id, size_id, sku, stock, cost_price, is_active)
            VALUES (v_variant, v_id, 'demo-color-' || v.color_key, v.size_id, upper(replace(v_variant, 'demo-var-', 'DEMO-')), 0, v_cost, true);
            PERFORM public.stock_apply(v_variant, v_main, 6, 'stock_in', 'demo-receipt', 'Demo stock', v_admin, v_cost);
        END LOOP;

        UPDATE public.products pr
        SET sizes = COALESCE((
            SELECT jsonb_agg(jsonb_build_object('size', s.name, 'chest', '', 'stock', s.stock) ORDER BY s.ord)
            FROM (SELECT z.name, x.n AS ord, sum(pv.stock) AS stock
                  FROM unnest(p.size_ids) WITH ORDINALITY AS x(s, n)
                  JOIN public.sizes z ON z.id = x.s
                  JOIN public.product_variants pv ON pv.size_id = z.id AND pv.product_id = v_id
                  GROUP BY z.name, x.n) s), '[]'::jsonb)
        WHERE pr.id = v_id;
    END LOOP;
END $$;
