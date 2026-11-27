-- Makes the demo catalogue look like a real shop, so the storefront can be judged
-- the way it will look at launch. Runs last (after seed, seed-extra, seed-accessories)
-- and only UPDATEs/INSERTs rows whose id starts with "demo-", so remove.sql still
-- clears everything.
--
-- What it does:
--   * drops "(demo)" / "(ডেমো)" from everything a shopper sees (products, categories,
--     teams, collection, promotion). Admin-only rows (customers, suppliers, branch)
--     keep the mark so staff can tell them apart.
--   * real slugs (only when the slug is free, so a real product is never shadowed),
--     Bangla + English descriptions, short text, specs and search tags
--   * shop-like prices with a compare-at discount on some products
--   * publish dates spread over four months, so "নতুন" shows on a few, not all
--   * approved reviews, and products.rating / reviews_count to match
--   * cricket bat options named the way shops sell them (Size 5, Size 6, Harrow, Short handle)
-- Photos: scripts/demo-data.mjs swaps the drawings for files in public/demo/photos/
-- named after the new slug (e.g. argentina-home-jersey-2026.jpg, then argentina-home-jersey-2026--2.jpg for more).
DO $$
DECLARE
    r RECORD;
    v_users UUID[] := ARRAY(SELECT id FROM auth.users ORDER BY created_at LIMIT 12);
    v_n INTEGER;
BEGIN
    -- ------------------------------------------------------------ shopper-facing names
    UPDATE public.categories SET
        name = trim(replace(name, '(demo)', '')),
        name_bn = trim(replace(name_bn, '(ডেমো)', ''))
    WHERE id LIKE 'demo-%';
    UPDATE public.categories SET name = 'Casual & training', name_bn = 'ক্যাজুয়াল ও ট্রেনিং' WHERE id = 'demo-cat-casual';
    UPDATE public.categories c SET slug = x.slug
    FROM (VALUES ('demo-cat-jersey', 'jersey'), ('demo-cat-casual', 'casual-training'), ('demo-cat-accessories', 'accessories'),
                 ('demo-cat-acc-badminton', 'badminton'), ('demo-cat-acc-cricket', 'cricket'), ('demo-cat-acc-football', 'football')) AS x(id, slug)
    WHERE c.id = x.id AND NOT EXISTS (SELECT 1 FROM public.categories o WHERE o.slug = x.slug AND o.id <> c.id);

    UPDATE public.catalog_terms SET
        name_en = trim(replace(name_en, '(demo)', '')),
        name_bn = trim(replace(name_bn, '(ডেমো)', ''))
    WHERE id LIKE 'demo-%';
    UPDATE public.catalog_terms t SET slug = x.slug
    FROM (VALUES ('demo-term-argentina', 'argentina'), ('demo-term-brazil', 'brazil'), ('demo-term-bangladesh', 'bangladesh')) AS x(id, slug)
    WHERE t.id = x.id AND NOT EXISTS (SELECT 1 FROM public.catalog_terms o WHERE o.slug = x.slug AND o.type = t.type AND o.id <> t.id);

    UPDATE public.collections SET title_en = 'World Cup 2026', title_bn = 'বিশ্বকাপ ২০২৬' WHERE id = 'demo-collection-1';
    UPDATE public.collections c SET slug = 'world-cup-2026'
    WHERE c.id = 'demo-collection-1' AND NOT EXISTS (SELECT 1 FROM public.collections o WHERE o.slug = 'world-cup-2026' AND o.id <> c.id);
    UPDATE public.promotions SET name = 'Trouser sale' WHERE id = 'demo-promo-1';

    -- Cricket bat options as shops list them.
    UPDATE public.sizes SET name = 'Harrow', display_name = 'Harrow', sort_key = 116, display_order = 116 WHERE id = 'demo-size-long-handle';
    UPDATE public.sizes SET name = 'Short handle', display_name = 'Short handle', sort_key = 117, display_order = 117 WHERE id = 'demo-size-short-handle';
    UPDATE public.product_sizes SET sort_order = CASE size_id WHEN 'demo-size-long-handle' THEN 3 WHEN 'demo-size-short-handle' THEN 4 ELSE sort_order END
    WHERE product_id = 'demo-acc-cricket-bat';
    UPDATE public.products pr SET sizes = COALESCE((
        SELECT jsonb_agg(jsonb_build_object('size', z.name, 'chest', '', 'stock', s.stock) ORDER BY s.ord)
        FROM (SELECT ps.size_id, ps.sort_order AS ord, sum(pv.stock) AS stock
              FROM public.product_sizes ps
              JOIN public.product_variants pv ON pv.size_id = ps.size_id AND pv.product_id = ps.product_id
              WHERE ps.product_id = pr.id GROUP BY ps.size_id, ps.sort_order) s
        JOIN public.sizes z ON z.id = s.size_id), pr.sizes)
    WHERE pr.id = 'demo-acc-cricket-bat';

    -- ------------------------------------------------------------------- products
    -- regular = price before discount, pct = discount (0 = none), days = days since published.
    FOR r IN
        SELECT * FROM (VALUES
        ('demo-prod-1', 'argentina-home-jersey-2026', 'Argentina Home Jersey 2026', 'আর্জেন্টিনা হোম জার্সি ২০২৬', 1290, 15, 6,
         'Sky-blue and white stripes, quick-dry fan edition.', 'আকাশি-সাদা স্ট্রাইপ, দ্রুত শুকায় এমন ফ্যান এডিশন।',
         '<p>Sky-blue and white stripes in a soft, quick-dry polyester mesh. Cut for everyday wear and five-a-side on the weekend.</p><ul><li>Breathable mesh panels under the arms</li><li>Sublimation print that does not crack or fade in the wash</li><li>Name and number printing available</li></ul>',
         '<p>নরম, দ্রুত শুকায় এমন পলিয়েস্টার মেশ কাপড়ে আকাশি-সাদা স্ট্রাইপ। প্রতিদিন পরা আর ছুটির দিনের ফুটবলের জন্য।</p><ul><li>বগলের নিচে বাতাস চলাচলের মেশ প্যানেল</li><li>সাবলিমেশন প্রিন্ট, ধোয়ার পরও ফাটে না বা রং ওঠে না</li><li>নাম ও নম্বর প্রিন্ট করা যায়</li></ul>',
         ARRAY['argentina', 'football', 'jersey', 'world-cup'], '{"কাপড়": "পলিয়েস্টার মেশ, ১৬০ GSM", "ফিট": "রেগুলার", "প্রিন্ট": "সাবলিমেশন", "যত্ন": "উল্টো করে ঠান্ডা পানিতে ধোবেন"}'),
        ('demo-prod-2', 'brazil-home-jersey-2026', 'Brazil Home Jersey 2026', 'ব্রাজিল হোম জার্সি ২০২৬', 1290, 0, 9,
         'Canary-yellow fan jersey with green trim.', 'সবুজ ট্রিমসহ হলুদ ফ্যান জার্সি।',
         '<p>The classic canary yellow with green collar and cuffs. Light polyester that stays dry through a full match.</p><ul><li>Ribbed V-neck collar</li><li>Colour-fast print</li><li>Name and number printing available</li></ul>',
         '<p>সবুজ কলার ও হাতাসহ চিরচেনা হলুদ জার্সি। হালকা পলিয়েস্টার, পুরো ম্যাচেও ঘামে ভিজে থাকে না।</p><ul><li>রিব করা ভি-নেক কলার</li><li>রং পাকা প্রিন্ট</li><li>নাম ও নম্বর প্রিন্ট করা যায়</li></ul>',
         ARRAY['brazil', 'football', 'jersey', 'world-cup'], '{"কাপড়": "পলিয়েস্টার, ১৫০ GSM", "ফিট": "রেগুলার", "কলার": "ভি-নেক"}'),
        ('demo-prod-3', 'bangladesh-cricket-jersey', 'Bangladesh Cricket Jersey', 'বাংলাদেশ ক্রিকেট জার্সি', 1350, 0, 21,
         'Green and red fan jersey for match days.', 'ম্যাচের দিনের জন্য লাল-সবুজ ফ্যান জার্সি।',
         '<p>Bottle green with a red tiger-stripe pattern. Soft micro-mesh that keeps you cool in the stands or at the nets.</p><ul><li>Half sleeves, round collar</li><li>Sweat-wicking fabric</li><li>Add your name and number</li></ul>',
         '<p>গাঢ় সবুজের ওপর লাল বাঘের ডোরা। নরম মাইক্রো-মেশ, গ্যালারিতে বা নেটে দুই জায়গাতেই আরাম।</p><ul><li>হাফ হাতা, গোল কলার</li><li>ঘাম টেনে নেয় এমন কাপড়</li><li>নিজের নাম ও নম্বর দেওয়া যায়</li></ul>',
         ARRAY['bangladesh', 'cricket', 'jersey'], '{"কাপড়": "মাইক্রো-মেশ, ১৪০ GSM", "ফিট": "রেগুলার", "হাতা": "হাফ"}'),
        ('demo-prod-4', 'club-classic-white-jersey', 'Club Classic White Jersey', 'ক্লাব ক্লাসিক সাদা জার্সি', 990, 0, 48,
         'Plain white jersey, ready for your club badge.', 'সাদা প্লেইন জার্সি, ক্লাবের লোগো বসানোর জন্য তৈরি।',
         '<p>A clean white jersey that takes any club badge, sponsor or number. Popular with local clubs and school teams.</p><ul><li>Bulk prices from 10 pieces</li><li>Badge, name and number printing on request</li></ul>',
         '<p>পরিষ্কার সাদা জার্সি, যেকোনো ক্লাব লোগো, স্পনসর বা নম্বর বসানো যায়। পাড়ার ক্লাব আর স্কুল দলের পছন্দ।</p><ul><li>১০ পিস থেকে পাইকারি দাম</li><li>লোগো, নাম ও নম্বর প্রিন্ট করা যায়</li></ul>',
         ARRAY['club', 'football', 'jersey', 'team'], '{"কাপড়": "ইন্টারলক পলিয়েস্টার", "ফিট": "রেগুলার"}'),
        ('demo-prod-5', 'premium-polo-shirt-navy', 'Premium Polo Shirt (Navy)', 'প্রিমিয়াম পোলো শার্ট (নেভি)', 950, 10, 63,
         'Cotton-feel pique polo for office and outings.', 'অফিস ও বাইরে যাওয়ার জন্য কটনের মতো আরামের পোলো।',
         '<p>Navy pique polo with a soft cotton feel and a collar that keeps its shape after many washes.</p><ul><li>Two-button placket</li><li>Side vents for easy movement</li></ul>',
         '<p>নরম কটনের মতো অনুভূতির নেভি পিকে পোলো। বারবার ধোয়ার পরও কলার ঠিক থাকে।</p><ul><li>দুই বোতামের প্ল্যাকেট</li><li>পাশে কাটা, নড়াচড়ায় আরাম</li></ul>',
         ARRAY['polo', 'casual'], '{"কাপড়": "পিকে (৬০% কটন, ৪০% পলিয়েস্টার)", "ফিট": "রেগুলার"}'),
        ('demo-prod-6', 'training-t-shirt-black', 'Training T-Shirt (Black)', 'ট্রেনিং টি-শার্ট (কালো)', 650, 15, 2,
         'Light dry-fit tee for gym and running.', 'জিম ও দৌড়ের জন্য হালকা ড্রাই-ফিট টি-শার্ট।',
         '<p>Lightweight dry-fit tee that pulls sweat away from the skin. Ideal for gym, running and practice.</p><ul><li>Flat seams that do not rub</li><li>Keeps its colour wash after wash</li></ul>',
         '<p>হালকা ড্রাই-ফিট টি-শার্ট, ঘাম শরীর থেকে টেনে নেয়। জিম, দৌড় আর প্র্যাকটিসের জন্য।</p><ul><li>সমান সেলাই, গায়ে ঘষা লাগে না</li><li>বারবার ধোয়ার পরও রং থাকে</li></ul>',
         ARRAY['training', 'gym', 't-shirt'], '{"কাপড়": "ড্রাই-ফিট পলিয়েস্টার", "ফিট": "অ্যাথলেটিক"}'),
        ('demo-prod-7', 'kids-football-jersey-set', 'Kids Football Jersey Set', 'শিশুদের ফুটবল জার্সি সেট', 790, 0, 12,
         'Jersey and shorts set for young players.', 'ছোট খেলোয়াড়দের জন্য জার্সি ও শর্টস সেট।',
         '<p>Jersey and matching shorts in soft, skin-friendly fabric. Easy to wash, made for school matches and the park.</p>',
         '<p>নরম, ত্বকের জন্য আরামদায়ক কাপড়ে জার্সি ও মিলিয়ে শর্টস। সহজে ধোয়া যায়, স্কুলের খেলা আর মাঠের জন্য।</p>',
         ARRAY['kids', 'football', 'jersey'], '{"সেটে আছে": "জার্সি + শর্টস", "বয়স": "৬–১৪ বছর"}'),
        ('demo-prod-8', 'sports-trouser', 'Sports Trouser', 'স্পোর্টস ট্রাউজার', 790, 0, 88,
         'Slim training trouser with zip pockets.', 'চেইন পকেটসহ স্লিম ট্রেনিং ট্রাউজার।',
         '<p>Stretchy slim trouser with zip pockets and an elastic waist with drawcord. For training, travel and home.</p>',
         '<p>চেইন পকেট আর ফিতাসহ ইলাস্টিক কোমরের স্ট্রেচি স্লিম ট্রাউজার। ট্রেনিং, ভ্রমণ আর বাসার জন্য।</p>',
         ARRAY['trouser', 'training'], '{"কাপড়": "স্ট্রেচ পলিয়েস্টার", "পকেট": "২টা চেইন পকেট"}'),
        ('demo-prod-9', 'match-football-size-5', 'Match Football (Size 5)', 'ম্যাচ ফুটবল (সাইজ ৫)', 1450, 10, 40,
         'Hand-stitched match ball for grass and turf.', 'ঘাস ও টার্ফের জন্য হাতে সেলাই করা ম্যাচ বল।',
         '<p>Hand-stitched 32-panel ball with a butyl bladder that holds air for weeks. Size 5, for adults.</p>',
         '<p>হাতে সেলাই করা ৩২ প্যানেলের বল, বিউটাইল ব্লাডার সপ্তাহের পর সপ্তাহ বাতাস ধরে রাখে। সাইজ ৫, বড়দের জন্য।</p>',
         ARRAY['football', 'ball'], '{"সাইজ": "৫", "সেলাই": "হাতে", "মাঠ": "ঘাস / টার্ফ"}'),
        ('demo-prod-10', 'shin-guard-classic', 'Shin Guard Classic', 'শিন গার্ড ক্লাসিক', 450, 0, 70,
         'Light shin guard with a foam back.', 'ফোমের পেছনসহ হালকা শিন গার্ড।',
         '<p>Hard shell with a soft foam back. Slips into any sock.</p>', '<p>শক্ত খোলস, পেছনে নরম ফোম। যেকোনো মোজার ভেতরে পরা যায়।</p>',
         ARRAY['football', 'shin-guard'], '{}'),
        ('demo-prod-11', 'draft-jersey', 'Draft Jersey', 'খসড়া জার্সি', 900, 0, 0, NULL, NULL, NULL, NULL, ARRAY['jersey'], '{}'),

        ('demo-acc-racket', 'carbon-badminton-racket', 'Carbon Badminton Racket', 'কার্বন ব্যাডমিন্টন র‍্যাকেট', 2150, 14, 15,
         'Full-carbon frame, strung and ready to play.', 'ফুল-কার্বন ফ্রেম, স্ট্রিং করা, হাতে নিয়েই খেলা যায়।',
         '<p>Light full-carbon racket, strung at 24 lbs. Good balance between power and control for club players.</p><ul><li>Comes with a cover</li><li>Pick the weight/grip that suits you</li></ul>',
         '<p>হালকা ফুল-কার্বন র‍্যাকেট, ২৪ পাউন্ডে স্ট্রিং করা। ক্লাব খেলোয়াড়দের জন্য পাওয়ার আর কন্ট্রোলের ভালো ভারসাম্য।</p><ul><li>কভারসহ</li><li>নিজের মতো ওজন/গ্রিপ বেছে নিন</li></ul>',
         ARRAY['badminton', 'racket'], '{"ফ্রেম": "ফুল কার্বন", "স্ট্রিং টেনশন": "২৪ পাউন্ড", "ব্যালান্স": "ইভেন"}'),
        ('demo-acc-shuttle-feather', 'feather-shuttlecock-12', 'Feather Shuttlecock (12 pcs)', 'ফেদার শাটলকক (১২ পিস)', 1450, 0, 3,
         'Duck-feather shuttles for steady flight.', 'হাঁসের পালকের শাটল, ঠিকঠাক উড়ে।',
         '<p>Tube of 12 duck-feather shuttles with a cork base. Choose the speed for your hall and weather.</p>',
         '<p>কর্কের মাথাসহ হাঁসের পালকের ১২টা শাটলের টিউব। কোর্ট আর আবহাওয়া বুঝে স্পিড বেছে নিন।</p>',
         ARRAY['badminton', 'shuttlecock'], '{"পিস": "১২", "পালক": "হাঁস", "মাথা": "কর্ক"}'),
        ('demo-acc-shuttle-nylon', 'nylon-shuttlecock-6', 'Nylon Shuttlecock (6 pcs)', 'নাইলন শাটলকক (৬ পিস)', 550, 0, 34,
         'Long-lasting nylon shuttles for practice.', 'প্র্যাকটিসের জন্য টেকসই নাইলন শাটল।',
         '<p>Nylon shuttles that last many times longer than feather. Good for practice and outdoor play.</p>',
         '<p>পালকের চেয়ে অনেক বেশি দিন চলে এমন নাইলন শাটল। প্র্যাকটিস আর খোলা জায়গায় খেলার জন্য।</p>',
         ARRAY['badminton', 'shuttlecock'], '{"পিস": "৬"}'),
        ('demo-acc-string', 'badminton-string', 'Badminton String', 'ব্যাডমিন্টন স্ট্রিং', 450, 0, 55,
         'Durable string for repelling, one racket per set.', 'টেকসই স্ট্রিং, এক সেটে এক র‍্যাকেট।',
         '<p>10 m set, enough for one racket. Thinner gauge gives more feel, thicker lasts longer.</p>',
         '<p>১০ মিটারের সেট, এক র‍্যাকেটের জন্য যথেষ্ট। সরু গেজে অনুভূতি বেশি, মোটা গেজ বেশি টেকে।</p>',
         ARRAY['badminton', 'string'], '{"দৈর্ঘ্য": "১০ মিটার"}'),
        ('demo-acc-grip', 'racket-grip-tape', 'Racket Grip Tape', 'র‍্যাকেট গ্রিপ টেপ', 150, 20, 27,
         'Tacky overgrip that soaks up sweat.', 'ঘাম শুষে নেয় এমন আঠালো ওভারগ্রিপ।',
         '<p>Soft, tacky overgrip for badminton, tennis and squash rackets.</p>', '<p>ব্যাডমিন্টন, টেনিস ও স্কোয়াশ র‍্যাকেটের জন্য নরম, আঠালো ওভারগ্রিপ।</p>',
         ARRAY['badminton', 'grip'], '{}'),
        ('demo-acc-racket-bag', 'badminton-racket-bag', 'Racket Bag', 'র‍্যাকেট ব্যাগ', 1350, 0, 75,
         'Padded racket bag with a shoe pocket.', 'জুতার পকেটসহ প্যাডেড র‍্যাকেট ব্যাগ।',
         '<p>Padded bag with a separate shoe pocket and shoulder straps.</p>', '<p>আলাদা জুতার পকেট আর কাঁধের স্ট্র্যাপসহ প্যাডেড ব্যাগ।</p>',
         ARRAY['badminton', 'bag'], '{}'),
        ('demo-acc-cricket-bat', 'kashmir-willow-cricket-bat', 'Kashmir Willow Cricket Bat', 'কাশ্মীর উইলো ক্রিকেট ব্যাট', 3950, 12, 18,
         'Seasoned Kashmir willow, knocked in and ready for leather ball.', 'পাকা কাশ্মীর উইলো, নক-ইন করা, লেদার বলে খেলার জন্য তৈরি।',
         '<p>Seasoned Kashmir willow with a thick edge and a mid-low sweet spot. Knocked in at our shop, so it is ready for leather ball.</p><ul><li>Size 5 and Size 6 for juniors, Harrow for teens, Short handle for adults</li><li>Comes with a cover and grip</li></ul>',
         '<p>মোটা এজ আর মাঝারি-নিচু সুইট স্পটের পাকা কাশ্মীর উইলো। দোকানেই নক-ইন করা, তাই লেদার বলে খেলার জন্য তৈরি।</p><ul><li>সাইজ ৫ ও ৬ ছোটদের, হ্যারো কিশোরদের, শর্ট হ্যান্ডেল বড়দের</li><li>কভার ও গ্রিপসহ</li></ul>',
         ARRAY['cricket', 'bat'], '{"কাঠ": "কাশ্মীর উইলো", "এজ": "৩৮–৪০ মিমি", "বল": "লেদার / টেপ টেনিস"}'),
        ('demo-acc-tape-bat', 'tape-tennis-bat', 'Tape Tennis Bat', 'টেপ টেনিস ব্যাট', 1350, 0, 1,
         'Light bat for tape-ball and tennis-ball cricket.', 'টেপ ও টেনিস বলের ক্রিকেটের জন্য হালকা ব্যাট।',
         '<p>Light, thin-blade bat for tape-ball matches in the lane or on the roof.</p>', '<p>গলি বা ছাদের টেপ বলের ম্যাচের জন্য হালকা, পাতলা ব্লেডের ব্যাট।</p>',
         ARRAY['cricket', 'bat', 'tape-ball'], '{}'),
        ('demo-acc-cricket-ball', 'leather-cricket-ball', 'Leather Cricket Ball', 'লেদার ক্রিকেট বল', 650, 0, 45,
         'Four-piece leather ball with a hand-stitched seam.', 'হাতে সেলাই সিমসহ চার টুকরার লেদার বল।',
         '<p>Four-piece leather ball, hand-stitched seam. Red for long games, white and pink for coloured clothing.</p>',
         '<p>চার টুকরার লেদার বল, হাতে সেলাই সিম। লম্বা খেলায় লাল, রঙিন জার্সির খেলায় সাদা বা গোলাপি।</p>',
         ARRAY['cricket', 'ball'], '{}'),
        ('demo-acc-batting-gloves', 'batting-gloves', 'Batting Gloves', 'ব্যাটিং গ্লাভস', 1250, 0, 80,
         'Padded batting gloves with a leather palm.', 'লেদার পামসহ প্যাডেড ব্যাটিং গ্লাভস।',
         '<p>High-density foam on the fingers and a soft leather palm for grip.</p>', '<p>আঙুলে উচ্চ ঘনত্বের ফোম, ভালো গ্রিপের জন্য নরম লেদার পাম।</p>',
         ARRAY['cricket', 'gloves'], '{}'),
        ('demo-acc-batting-pads', 'batting-pads', 'Batting Pads', 'ব্যাটিং প্যাড', 2100, 10, 95,
         'Light batting pads with three straps.', 'তিন স্ট্র্যাপের হালকা ব্যাটিং প্যাড।',
         '<p>Light pads with cane reinforcement and three velcro straps.</p>', '<p>বেত দিয়ে শক্ত করা হালকা প্যাড, তিনটা ভেলক্রো স্ট্র্যাপ।</p>',
         ARRAY['cricket', 'pads'], '{}'),
        ('demo-acc-cricket-helmet', 'cricket-helmet', 'Cricket Helmet', 'ক্রিকেট হেলমেট', 2450, 0, 110,
         'Helmet with a steel grille and adjustable fit.', 'স্টিলের গ্রিল ও অ্যাডজাস্ট করা যায় এমন হেলমেট।',
         '<p>ABS shell, steel grille and a padded lining with an adjustable back.</p>', '<p>ABS খোলস, স্টিলের গ্রিল আর পেছনে অ্যাডজাস্ট করা যায় এমন প্যাডেড লাইনিং।</p>',
         ARRAY['cricket', 'helmet'], '{}'),
        ('demo-acc-training-football', 'training-football', 'Training Football', 'ট্রেনিং ফুটবল', 950, 0, 24,
         'Machine-stitched ball for daily practice.', 'প্রতিদিনের প্র্যাকটিসের জন্য মেশিনে সেলাই বল।',
         '<p>Tough machine-stitched ball for daily practice on grass, turf or concrete.</p>', '<p>ঘাস, টার্ফ বা পাকা মাঠে প্রতিদিনের প্র্যাকটিসের জন্য মজবুত মেশিনে সেলাই বল।</p>',
         ARRAY['football', 'ball'], '{}'),
        ('demo-acc-keeper-gloves', 'goalkeeper-gloves', 'Goalkeeper Gloves', 'গোলকিপার গ্লাভস', 1150, 15, 30,
         'Latex palm keeper gloves with wrist strap.', 'কব্জি স্ট্র্যাপসহ ল্যাটেক্স পামের গোলকিপার গ্লাভস।',
         '<p>3 mm latex palm for a sure catch and a wide wrist strap for support.</p>', '<p>নিশ্চিত ক্যাচের জন্য ৩ মিমি ল্যাটেক্স পাম, সাপোর্টের জন্য চওড়া কব্জি স্ট্র্যাপ।</p>',
         ARRAY['football', 'gloves', 'goalkeeper'], '{}'),
        ('demo-acc-shin-pads', 'pro-shin-pads', 'Pro Shin Pads', 'প্রো শিন প্যাড', 480, 0, 60,
         'Shin pads with ankle guard.', 'গোড়ালি গার্ডসহ শিন প্যাড।',
         '<p>Shin pads with an ankle guard and a velcro strap.</p>', '<p>গোড়ালি গার্ড আর ভেলক্রো স্ট্র্যাপসহ শিন প্যাড।</p>',
         ARRAY['football', 'shin-guard'], '{}'),
        ('demo-acc-football-socks', 'football-socks', 'Football Socks', 'ফুটবল মোজা', 250, 0, 50,
         'Knee-length socks with a cushioned foot.', 'কুশন করা পায়ের পাতাসহ হাঁটু পর্যন্ত মোজা।',
         '<p>Knee-length socks with a cushioned sole. One size fits most adults.</p>', '<p>কুশন করা তলাসহ হাঁটু পর্যন্ত মোজা। বেশিরভাগ বড়দের পায়ে লাগে।</p>',
         ARRAY['football', 'socks'], '{}'),
        ('demo-acc-football-boots', 'football-boots', 'Football Boots', 'ফুটবল বুট', 2650, 10, 8,
         'Firm-ground boots with a padded collar.', 'প্যাডেড কলারসহ শক্ত মাঠের বুট।',
         '<p>Firm-ground studs, synthetic upper and a padded collar. Sizes are EU.</p>', '<p>শক্ত মাঠের স্টাড, সিনথেটিক আপার আর প্যাডেড কলার। সাইজ ইউরোপীয় (EU)।</p>',
         ARRAY['football', 'boots'], '{"আপার": "সিনথেটিক", "স্টাড": "FG", "সাইজ": "EU"}'),
        ('demo-acc-kit-bag', 'football-kit-bag', 'Football Kit Bag', 'ফুটবল কিট ব্যাগ', 850, 0, 100,
         'Duffel kit bag with a wet-boot pocket.', 'ভেজা বুটের পকেটসহ ডাফেল কিট ব্যাগ।',
         '<p>Roomy duffel bag with a separate wet-boot pocket.</p>', '<p>ভেজা বুটের আলাদা পকেটসহ বড় ডাফেল ব্যাগ।</p>',
         ARRAY['football', 'bag'], '{}')
        ) AS t(id, slug, title, title_bn, regular, pct, days, short_en, short_bn, desc_en, desc_bn, tags, specs)
    LOOP
        UPDATE public.products p SET
            title = r.title,
            title_bn = r.title_bn,
            short_description = COALESCE(r.short_en, p.short_description),
            short_description_bn = COALESCE(r.short_bn, p.short_description_bn),
            description = COALESCE(r.desc_en, p.description),
            description_bn = COALESCE(r.desc_bn, p.description_bn),
            regular_price = r.regular,
            original_price = r.regular,
            price = CASE WHEN r.pct > 0 THEN round(r.regular * (100 - r.pct) / 1000.0) * 10 ELSE r.regular END,
            discount_type = 'percentage',
            discount_value = r.pct,
            discount_percent = r.pct,
            discount_mode = CASE WHEN r.pct > 0 THEN 'comparison' ELSE 'none' END,
            tags = r.tags,
            specs = r.specs::jsonb,
            published_at = CASE WHEN p.status = 'published' THEN now() - make_interval(days => r.days, hours => (r.days * 7) % 24) ELSE p.published_at END,
            created_at = now() - make_interval(days => r.days + 1),
            is_featured = r.id IN ('demo-prod-1', 'demo-prod-3', 'demo-acc-cricket-bat', 'demo-acc-racket', 'demo-acc-football-boots', 'demo-prod-6')
        WHERE p.id = r.id;
        UPDATE public.products p SET slug = r.slug
        WHERE p.id = r.id AND NOT EXISTS (SELECT 1 FROM public.products o WHERE o.slug = r.slug AND o.id <> r.id);
    END LOOP;

    -- -------------------------------------------------------------------- reviews
    -- product_reviews needs a real account and allows one review per account per
    -- product, so each review borrows a different existing account. Products get
    -- as many reviews as there are accounts, at most.
    UPDATE public.product_reviews SET author_name = trim(replace(replace(author_name, '(ডেমো)', ''), '(demo)', '')),
        body = replace(body, ' Waiting for approval (demo).', '')
    WHERE id LIKE 'demo-%';
    v_n := COALESCE(array_length(v_users, 1), 0);
    IF v_n > 0 THEN
        FOR r IN
            SELECT row_number() OVER () AS n, x.*, row_number() OVER (PARTITION BY x.product_id) AS k FROM (VALUES
            ('demo-prod-1', 'মাহমুদুল হাসান', 5, 'একদম ছবির মতো', 'কাপড় পাতলা কিন্তু মজবুত। L নিয়েছিলাম, ঠিকঠাক ফিট হয়েছে। দুই দিনে ঢাকায় পেয়েছি।', 3),
            ('demo-prod-1', 'Farhan Ahmed', 4, 'Good quality', 'Print is sharp and the fabric breathes well. Runs slightly large, take one size down.', 5),
            ('demo-prod-1', 'তাসনিম রহমান', 5, 'ভাইয়ের জন্য কিনেছি', 'নাম আর নম্বর প্রিন্ট করিয়েছি, খুব সুন্দর হয়েছে। প্যাকেজিংও ভালো ছিল।', 9),
            ('demo-prod-1', 'সাকিব আল মামুন', 4, 'দামের তুলনায় ভালো', 'দুইবার ধোয়ার পরও রং একই আছে। কলারটা আরেকটু শক্ত হলে ভালো হতো।', 14),
            ('demo-prod-2', 'রিফাত চৌধুরী', 5, 'দারুণ রং', 'হলুদ রংটা একদম উজ্জ্বল, কাপড় আরামদায়ক। খেলা দেখতে পরে গিয়েছিলাম।', 4),
            ('demo-prod-2', 'Nabila Islam', 4, 'Nice jersey', 'Comfortable and light. Delivery to Chattogram took three days.', 8),
            ('demo-prod-3', 'আরিফ হোসেন', 5, 'গর্বের জার্সি', 'স্টেডিয়ামে পরে গিয়েছিলাম, সারাদিন পরে থেকেও অস্বস্তি লাগেনি।', 6),
            ('demo-prod-3', 'জান্নাতুল ফেরদৌস', 4, 'ভালো', 'সাইজ চার্ট দেখে নিয়েছি, ঠিক হয়েছে। সবুজটা ছবির চেয়ে একটু গাঢ়।', 11),
            ('demo-prod-3', 'Tanvir Hasan', 5, 'Worth it', 'Better than the ones sold in the market. Stitching is neat.', 17),
            ('demo-prod-4', 'মিরপুর ইউনাইটেড ক্লাব', 5, 'দলের জন্য ১৫টা নিয়েছি', 'লোগো আর নম্বর প্রিন্ট করে দিয়েছে, সময়মতো ডেলিভারি। আবার নেব।', 20),
            ('demo-prod-5', 'ইমরান খান', 5, 'অফিসে পরার মতো', 'কাপড় নরম, কলার ধোয়ার পরও ঠিক আছে।', 12),
            ('demo-prod-5', 'Shuvo Das', 4, 'Good fit', 'Fits well around the shoulders. Colour is a true navy.', 25),
            ('demo-prod-6', 'রাহুল দেব', 5, 'জিমের জন্য পারফেক্ট', 'ঘাম হলেও গায়ে লেগে থাকে না, খুব তাড়াতাড়ি শুকায়।', 1),
            ('demo-prod-7', 'শারমিন সুলতানা', 5, 'ছেলে খুব খুশি', '৮ বছরের ছেলের জন্য নিয়েছি, কাপড় নরম, ধোয়াও সহজ।', 7),
            ('demo-prod-8', 'Mehedi Hasan', 4, 'Comfortable', 'Zip pockets are handy for running. Length is good for 5''8".', 30),
            ('demo-acc-racket', 'নাফিস ইকবাল', 5, 'হালকা আর শক্ত', '৪U নিয়েছি, স্ম্যাশে ভালো পাওয়ার পাই। স্ট্রিং করা অবস্থায় এসেছে।', 6),
            ('demo-acc-racket', 'Ayesha Siddiqua', 4, 'Good for beginners', 'Light and easy to swing. The cover is basic but fine.', 10),
            ('demo-acc-shuttle-feather', 'হাবিবুর রহমান', 4, 'শীতের খেলার জন্য ভালো', '৭৭ স্পিড নিয়েছি, ঠিকঠাক উড়ে। দুই-তিন গেমে একটা ভাঙে।', 2),
            ('demo-acc-cricket-bat', 'শাহরিয়ার নাফিস', 5, 'নক-ইন করা পেয়েছি', 'লেদার বলে প্রথম দিন থেকেই খেলছি, কোনো ফাটল নেই। ব্যালান্স খুব ভালো।', 5),
            ('demo-acc-cricket-bat', 'Rakib Uddin', 5, 'Great pickup', 'Short handle is right for me (5''10"). Sweet spot is generous.', 9),
            ('demo-acc-cricket-bat', 'তানজিম সাকিব', 4, 'ছেলের জন্য সাইজ ৬', 'ওজন ঠিক আছে, ১২ বছরের ছেলে স্বাচ্ছন্দ্যে খেলছে।', 13),
            ('demo-acc-cricket-ball', 'মুশফিক আহমেদ', 4, 'টেকসই বল', 'দুই ম্যাচ খেলার পরও সিম ঠিক আছে।', 15),
            ('demo-acc-keeper-gloves', 'Sabbir Rahman', 5, 'Great grip', 'Grip is excellent on dry days. Size 9 fits a medium adult hand.', 4),
            ('demo-acc-football-boots', 'জুবায়ের আলম', 4, 'আরামদায়ক বুট', '৪২ নিয়েছি, প্রথম দুই দিন একটু টাইট লেগেছে, এখন ঠিক আছে।', 3),
            ('demo-acc-football-socks', 'ফাহিম মুনতাসির', 5, 'দামে সস্তা, মানে ভালো', 'পুরো দলের জন্য ১১ জোড়া নিয়েছি।', 16),
            ('demo-acc-training-football', 'Arafat Hossain', 4, 'Holds air well', 'Using it on concrete for two weeks, still round and firm.', 8)
            ) AS x(product_id, author, rating, title, body, days)
        LOOP
            CONTINUE WHEN r.k > v_n;
            INSERT INTO public.product_reviews (id, product_id, user_id, author_name, rating, title, body, status, created_at, reviewed_at)
            VALUES ('demo-review-r' || r.n, r.product_id, v_users[r.k::int], r.author, r.rating, r.title, r.body, 'approved',
                    now() - make_interval(days => r.days), now() - make_interval(days => r.days))
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    UPDATE public.products p SET
        reviews_count = COALESCE(s.cnt, 0),
        rating = COALESCE(s.avg, 0)
    FROM (SELECT pr.id, count(rv.id) AS cnt, round(avg(rv.rating)::numeric, 1) AS avg
          FROM public.products pr LEFT JOIN public.product_reviews rv ON rv.product_id = pr.id AND rv.status = 'approved'
          WHERE pr.id LIKE 'demo-%' GROUP BY pr.id) s
    WHERE p.id = s.id;
END $$;
