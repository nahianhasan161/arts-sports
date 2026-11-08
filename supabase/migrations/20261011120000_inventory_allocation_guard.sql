-- Migration: make inventory allocation fail loudly instead of silently.
--
-- Two defects in admin_save_product(), both found while diagnosing why every
-- checkout answered "An item just sold out." when nothing had sold out.
--
--   1. The product_stock seeding CROSS JOINed an empty showrooms table, so the
--      INSERT silently wrote zero rows. Every product saved in that state was
--      created with variants but no stock allocation: it looked stocked in the
--      editor and was unsellable at checkout. The function now refuses to save
--      an option-matrix product while no showroom is active, reporting the
--      misconfiguration once, at save time, instead of once per failed order.
--
--   2. The seeding never carried the number the admin typed into the editor.
--      product_variants.stock is the visible total; product_stock.quantity is
--      what checkout reserves. A new variant got a zero row and DO NOTHING
--      froze it there, so raising stock in the editor changed nothing about
--      what could be sold. The quantity is now written from the payload on
--      every save, and never dropped below the quantity already held by
--      outstanding reservations.
--
-- Generated from the live definition with the two edits above applied, then
-- verified, rather than patched by string surgery -- see the note in the
-- repository history for why that approach was abandoned.
--
-- Applied to: remote (project khebwqdhucrdfpfadxry)

CREATE OR REPLACE FUNCTION public.admin_save_product(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_payload    JSONB := COALESCE(p_payload, '{}'::JSONB);
    v_id         TEXT;
    v_title      TEXT;
    v_slug       TEXT;
    v_base       TEXT;
    v_try        INTEGER := 1;
    v_cat_id     TEXT;
    v_sub_id     TEXT;
    v_cat_name   TEXT;
    v_sub_name   TEXT;
    v_regular    NUMERIC;
    v_sale       NUMERIC;
    v_dtype      TEXT;
    v_dvalue     NUMERIC;
    v_dmode      TEXT;
    v_new_price  NUMERIC;
    v_badge      TEXT;
    v_badge_type TEXT;
    v_status     TEXT;
    v_gender     TEXT;
    v_discount_pct INTEGER;
    v_short_desc TEXT;
    v_tags       TEXT[];
    v_cost       NUMERIC;
    v_color_ids  TEXT[] := ARRAY[]::TEXT[];
    v_size_ids   TEXT[] := ARRAY[]::TEXT[];
    v_promo_ids  TEXT[] := ARRAY[]::TEXT[];
    v_variants   JSONB  := COALESCE(p_payload->'variants', '[]'::JSONB);
    v_color_rows JSONB;
    v_size_rows  JSONB;
    v_cells      INTEGER;
    v_result     JSONB;
    v_wanted     RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
    END IF;

    -- ---------- identity
    v_title := NULLIF(btrim(COALESCE(p_payload->>'title', '')), '');
    IF v_title IS NULL THEN
        RAISE EXCEPTION 'title_required' USING ERRCODE = '22023';
    END IF;

    v_id := NULLIF(btrim(COALESCE(p_payload->>'id', '')), '');

    -- The product is looked up BEFORE the slug is settled. A form left open
    -- while the product is deleted elsewhere sends an id that no longer
    -- exists together with the slug that product used to have, and the
    -- useful answer is "that product is gone", not "that slug is taken".
    IF v_id IS NOT NULL THEN
        PERFORM 1 FROM public.products WHERE id = v_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- The slug is derived when omitted. It is generated data, and a blank
    -- slug was the most common reason a product could not be saved.
    --
    -- A DERIVED slug is made unique rather than refused, because two
    -- products may legitimately share a title and the admin never asked for
    -- either slug. An EXPLICIT slug is refused when taken, because there the
    -- admin did choose it and silently rewriting it would hand back a URL
    -- they did not ask for.
    IF btrim(COALESCE(p_payload->>'slug', '')) = '' THEN
        v_slug := trim(both '-' FROM lower(regexp_replace(v_title, '[^a-zA-Z0-9]+', '-', 'g')));
        IF v_slug = '' THEN
            RAISE EXCEPTION 'slug_required' USING ERRCODE = '22023';
        END IF;
        v_base := v_slug;
        v_try := 1;
        LOOP
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM public.products
                WHERE slug = v_slug AND (v_id IS NULL OR id <> v_id)
            );
            v_try := v_try + 1;
            v_slug := v_base || '-' || v_try;
            -- Bounded so a pathological title cannot spin here forever.
            EXIT WHEN v_try > 1000;
        END LOOP;
    ELSE
        v_slug := lower(btrim(p_payload->>'slug'));
        IF EXISTS (
            SELECT 1 FROM public.products
            WHERE slug = v_slug AND (v_id IS NULL OR id <> v_id)
        ) THEN
            RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
        END IF;
    END IF;

    -- ---------- categorisation
    v_cat_id := NULLIF(btrim(COALESCE(p_payload->>'category_id', '')), '');
    v_sub_id := NULLIF(btrim(COALESCE(p_payload->>'sub_category_id', '')), '');

    IF v_cat_id IS NULL THEN
        RAISE EXCEPTION 'category_required' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.categories WHERE id = v_cat_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'category_not_found' USING ERRCODE = '22023';
    END IF;

    IF v_sub_id IS NOT NULL THEN
        PERFORM 1 FROM public.categories WHERE id = v_sub_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'subcategory_not_found' USING ERRCODE = '22023';
        END IF;
        -- The catalogue is two levels deep and the size guide looks up
        -- exactly that shape, so a sub-category of a sub-category would
        -- match nothing.
        IF NOT EXISTS (
            SELECT 1 FROM public.categories WHERE id = v_sub_id AND parent_id = v_cat_id
        ) THEN
            RAISE EXCEPTION 'subcategory_not_found' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- ---------- money
    --
    -- Every mode below reduces to ONE (regular_price, discount_type,
    -- discount_value) triple, and the sale price is derived from it. Nothing
    -- here ever accepts a price from the client, because two separately entered
    -- prices can disagree and when they do the storefront shows a crossed-out
    -- price below the price and a badge claiming a negative discount.
    v_regular := COALESCE(NULLIF(p_payload->>'regular_price', '')::NUMERIC, 0);
    IF v_regular < 0 THEN
        RAISE EXCEPTION 'invalid_regular_price' USING ERRCODE = '22023';
    END IF;

    -- An absent mode is inferred rather than defaulted, so a payload from an
    -- older client (or a direct SQL write) still records what the product
    -- actually is rather than being filed under a mode that was never chosen.
    v_dmode := NULLIF(btrim(COALESCE(p_payload->>'discount_mode', '')), '');
    IF v_dmode IS NULL THEN
        v_dmode := CASE
            WHEN COALESCE(NULLIF(p_payload->>'discount_value', '')::NUMERIC, 0) > 0
                THEN 'custom'
            WHEN jsonb_array_length(COALESCE(p_payload->'promotion_ids', '[]'::JSONB)) > 0
                THEN 'promotion'
            ELSE 'none'
        END;
    END IF;
    IF v_dmode NOT IN ('none', 'comparison', 'custom', 'promotion') THEN
        RAISE EXCEPTION 'invalid_discount_mode' USING ERRCODE = '22023';
    END IF;

    IF v_dmode = 'comparison' THEN
        -- Price comparison: the admin types two prices and the discount is the
        -- percentage between them. The new price is NOT stored -- it is the
        -- sale price, which is derived from the percentage below, so it can
        -- never disagree with the badge or with what the storefront charges.
        v_new_price := COALESCE(NULLIF(p_payload->>'comparison_price', '')::NUMERIC, v_regular);
        IF v_new_price < 0 THEN
            RAISE EXCEPTION 'invalid_sale_price' USING ERRCODE = '22023';
        END IF;

        v_dtype := 'percentage';
        IF v_regular > 0 AND v_new_price < v_regular THEN
            -- ROUND to 2dp because products.discount_value is NUMERIC(10,2).
            -- A third decimal would be truncated on insert, and the stored
            -- percentage would then not describe the pair of prices the admin
            -- entered -- the badge would say one thing and the price another.
            v_dvalue := ROUND((v_regular - v_new_price) / v_regular * 100, 2);
        ELSE
            -- A new price at or above the old one is not a discount. Treating
            -- it as one would produce a negative markdown, which the column
            -- CHECK refuses, so the failure would be a database error about a
            -- constraint the admin never knew existed instead of a plain "no
            -- discount".
            v_dvalue := 0;
        END IF;
    ELSIF v_dmode = 'custom' THEN
        v_dtype := COALESCE(NULLIF(p_payload->>'discount_type', ''), 'percentage');
        IF v_dtype NOT IN ('flat', 'percentage') THEN
            RAISE EXCEPTION 'invalid_discount_type' USING ERRCODE = '22023';
        END IF;
        v_dvalue := COALESCE(NULLIF(p_payload->>'discount_value', '')::NUMERIC, 0);
    ELSE
        -- 'none' and 'promotion' both mean the product carries no markdown of
        -- its own. In promotion mode a product-level discount left over from
        -- custom mode would stack under the promotion's, and the shopper would
        -- pay less than either advertised saving -- so the mode clears it.
        v_dtype := 'percentage';
        v_dvalue := 0;
    END IF;

    IF v_dvalue < 0 THEN
        RAISE EXCEPTION 'invalid_discount' USING ERRCODE = '22023';
    END IF;
    IF v_dtype = 'percentage' AND v_dvalue > 100 THEN
        RAISE EXCEPTION 'invalid_percentage_discount' USING ERRCODE = '22023';
    END IF;
    IF v_dtype = 'flat' AND v_dvalue > v_regular THEN
        RAISE EXCEPTION 'invalid_flat_discount' USING ERRCODE = '22023';
    END IF;

    v_sale := public.calculate_sale_price(v_regular, v_dtype, v_dvalue);

    -- The percentage the storefront shows. Derived from the two prices for both
    -- kinds of markdown: a flat discount stores no percentage, so computing one
    -- from the prices is the only way "Save 150 (30% Off)" can be true. It used
    -- to be 0 for every flat discount, which made the detail page claim a flat
    -- markdown was worth no percentage at all.
    v_discount_pct := CASE
        WHEN v_dvalue > 0 AND v_regular > 0 AND v_sale < v_regular
            THEN ROUND((v_regular - v_sale) / v_regular * 100)::INTEGER
        ELSE 0
    END;

    -- ---------- the badge
    --
    -- Written here, from the numbers the price was just derived from, so it
    -- cannot disagree with the price it sits next to. The old version took
    -- this from the payload, which is how a full-price product ended up
    -- labelled SALE.
    --
    -- ROUND() for the same reason as everywhere else: 14.8% is 15% to a shopper,
    -- and a badge reading "14.8% OFF" is both harder to read and less true than
    -- the price it is describing, which is stored to the paisa.
    IF v_dvalue > 0 AND v_sale < v_regular THEN
        IF v_dtype = 'percentage' THEN
            v_badge := ROUND(v_dvalue)::INTEGER || '% OFF';
        ELSE
            v_badge := public.fmt_num(v_dvalue) || ' OFF';
        END IF;
        v_badge_type := 'discount';
    ELSE
        -- No discount, no badge. A "0% OFF" badge is a badge that claims
        -- nothing while covering the corner of the product image.
        v_badge := NULL;
        v_badge_type := NULL;
    END IF;

    v_status := COALESCE(NULLIF(p_payload->>'status', ''), 'draft');
    IF v_status NOT IN ('draft', 'published', 'archived') THEN
        RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
    END IF;

    -- ---------- audience
    --
    -- Gender is the audience the product is sold to, which is a different
    -- question from what kind of garment it is. It is not a property of the
    -- category: a Polo is a Polo whether it is sold to men, women or kids, and
    -- the same category legitimately holds products for more than one
    -- audience. It is also not categories."group", which is a vestigial
    -- 'topwear' default that predates the two-level tree and describes garment
    -- type, not audience.
    --
    -- NULL means "not assigned yet", and that is a real state rather than a
    -- failure: a product an admin has not categorised still has to save. A
    -- NOT NULL column with a default would have labelled every existing row
    -- 'men' on the strength of a guess, and the storefront's Men/Women/Kids
    -- sections would then carry products that are not in them.
    v_gender := NULLIF(btrim(COALESCE(p_payload->>'gender', '')), '');
    IF v_gender IS NOT NULL AND v_gender NOT IN ('men', 'women', 'kids') THEN
        RAISE EXCEPTION 'invalid_gender' USING ERRCODE = '22023';
    END IF;

    -- ---------- catalogue fields
    -- short_description, tags and cost_price are authored, unlike price and
    -- discount_percent, which are derived above. They are validated here for
    -- the same reason everything else is: a value the admin did not mean to
    -- save must not be coerced into one they did.
    --
    -- A BLANK string clears the field rather than failing the save. That is
    -- the difference between an empty text box in a form and a form that
    -- cannot be submitted until someone types something into it.
    v_short_desc := NULLIF(btrim(COALESCE(p_payload->>'short_description', '')), '');

    -- Tags are trimmed and de-duplicated case-insensitively while the FIRST
    -- spelling seen is kept, so "Summer" and "summer" cannot both end up in
    -- the array and make an AND-filter miss a product a shopper expected to
    -- see. Case is otherwise preserved: the column stores what was written
    -- and the display layer decides how to render it.
    SELECT COALESCE(array_agg(t.tag ORDER BY t.first_seen), ARRAY[]::TEXT[])
      INTO v_tags
      FROM (
          SELECT btrim(u.tag) AS tag,
                 MIN(u.ord)    AS first_seen
            FROM jsonb_array_elements_text(
                     CASE
                         WHEN jsonb_typeof(p_payload->'tags') = 'array'
                             THEN p_payload->'tags'
                         ELSE '[]'::JSONB
                     END
                 ) WITH ORDINALITY AS u(tag, ord)
           WHERE btrim(u.tag) <> ''
           GROUP BY lower(btrim(u.tag)), btrim(u.tag)
      ) t;

    -- cost_price may legitimately exceed regular_price: a clearance line is
    -- sold below cost on purpose. It is only refused when negative, and a
    -- blank field means "not recorded" rather than zero, because a zero here
    -- would read as free goods to every margin report downstream.
    IF btrim(COALESCE(p_payload->>'cost_price', '')) <> '' THEN
        v_cost := NULLIF(btrim(p_payload->>'cost_price'), '')::NUMERIC;
        IF v_cost < 0 THEN
            RAISE EXCEPTION 'invalid_cost_price' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- ---------- canonical options
    -- Unknown or deactivated ids are an error rather than a silent drop.
    -- The admin selected them, so quietly ignoring one would save a product
    -- that is missing an option they believed they had chosen.
    -- DISTINCT is load-bearing, and it was missing.
    --
    -- A payload may legitimately carry the same option id more than once. The
    -- admin list derived its color_ids and size_ids by mapping over a product's
    -- variants, so a product with one colour and two sizes came back as
    -- color_ids: [<colour>, <colour>] -- the colour once per variant. Opening
    -- the form and pressing Update sent that straight back.
    --
    -- Without DISTINCT this aggregate produced one array entry per OCCURRENCE,
    -- unnest() then yielded the same colour twice, the cross product below
    -- emitted every (colour, size) pair twice, and the upsert against
    -- UNIQUE (product_id, variant_key) tried to touch the same row twice in one
    -- command:
    --
    --   ON CONFLICT DO UPDATE command cannot affect row a second time  (21000)
    --
    -- The existing unknown-option guard did not catch it: it compares
    -- jsonb_array_length(payload) with array_length(aggregate), and with the
    -- duplicate counted in both places the two were equal, so the check passed
    -- a payload it should have questioned.
    --
    -- De-duplicating here makes the function correct for ANY caller, which
    -- matters because the count guard below stays a guard on unknown ids rather
    -- than becoming a second thing to keep in step.
    SELECT COALESCE(array_agg(DISTINCT t.id), ARRAY[]::TEXT[])
    INTO v_color_ids
    FROM jsonb_array_elements_text(COALESCE(p_payload->'color_ids', '[]'::JSONB)) AS t(id)
    JOIN public.colors c ON c.id = t.id AND c.is_active;
    -- COALESCE is load-bearing. array_length of an EMPTY array is NULL,
    -- not 0, so a payload of nothing but unknown ids would compare
    -- "1 <> NULL", which is NULL, and an IF on NULL does not fire. The
    -- guard would pass and the unknown options would be dropped silently.
    -- The payload's own length is de-duplicated before the comparison, or a
    -- repeated id would be reported as an unknown one. What is left after
    -- jsonb_array_length is the number of distinct ids, and that is what the
    -- aggregate's length is: a match means every id named a live option, and a
    -- shortfall means at least one did not.
    IF (SELECT count(DISTINCT x.id) FROM jsonb_array_elements_text(
            COALESCE(p_payload->'color_ids', '[]'::JSONB)) AS x(id))
       <> COALESCE(array_length(v_color_ids, 1), 0) THEN
        RAISE EXCEPTION 'unknown_color' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT t.id), ARRAY[]::TEXT[])
    INTO v_size_ids
    FROM jsonb_array_elements_text(COALESCE(p_payload->'size_ids', '[]'::JSONB)) AS t(id)
    JOIN public.sizes s ON s.id = t.id AND s.is_active;
    IF (SELECT count(DISTINCT x.id) FROM jsonb_array_elements_text(
            COALESCE(p_payload->'size_ids', '[]'::JSONB)) AS x(id))
       <> COALESCE(array_length(v_size_ids, 1), 0) THEN
        RAISE EXCEPTION 'unknown_size' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_variants) <> 'array' THEN
        RAISE EXCEPTION 'invalid_variants' USING ERRCODE = '22023';
    END IF;

    -- Stock is validated here rather than clamped at the insert. A number
    -- input in the browser can produce a negative value, and silently
    -- coercing it to zero would save a number the admin never chose while
    -- showing them "0" as though they had entered it. Refusing the save is
    -- the only outcome that surfaces the mistake.
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_variants) AS v(item)
        WHERE COALESCE(NULLIF(v.item->>'stock', '')::NUMERIC, 0) < 0
    ) THEN
        RAISE EXCEPTION 'negative_stock' USING ERRCODE = '22023';
    END IF;

    v_cells := GREATEST(COALESCE(array_length(v_color_ids, 1), 0), 1)
             * GREATEST(COALESCE(array_length(v_size_ids, 1), 0), 1);
    IF v_cells > public.product_variant_limit() THEN
        RAISE EXCEPTION 'too_many_variants' USING ERRCODE = '22023';
    END IF;

    -- ---------- the product row
    IF v_id IS NULL THEN
        INSERT INTO public.products (
            id, slug, title, description, short_description, category, sub_category,
            category_id, sub_category_id, regular_price, price, original_price,
            cost_price, tags, discount_type, discount_value, discount_percent,
            discount_mode, status, gender,
            badge, badge_type, is_featured, specs, rating, reviews_count,
            created_at, updated_at
        )
        SELECT gen_random_uuid()::TEXT, v_slug, v_title,
               NULLIF(btrim(COALESCE(p_payload->>'description', '')), ''),
               v_short_desc,
               c.name, s.name, v_cat_id, v_sub_id,
               v_regular, v_sale, v_regular,
               v_cost, v_tags,
               v_dtype, v_dvalue, v_discount_pct, v_dmode, v_status, v_gender,
               v_badge, v_badge_type,
               COALESCE((p_payload->>'is_featured')::BOOLEAN, false),
               COALESCE(p_payload->'specs', '{}'::JSONB), 5.0, 0, now(), now()
        FROM public.categories c
        LEFT JOIN public.categories s ON s.id = v_sub_id
        WHERE c.id = v_cat_id
        RETURNING id INTO v_id;
    ELSE
        -- Locked, because two admins saving the same product would otherwise
        -- interleave their matrix writes and leave the two halves of the
        -- save visible to each other. Existence was already checked above,
        -- so this only has to take the lock.
        PERFORM 1 FROM public.products WHERE id = v_id FOR UPDATE;

        UPDATE public.products
        SET slug            = v_slug,
            title           = v_title,
            description     = NULLIF(btrim(COALESCE(p_payload->>'description', '')), ''),
            short_description = v_short_desc,
            category_id     = v_cat_id,
            sub_category_id = v_sub_id,
            regular_price   = v_regular,
            price           = v_sale,
            original_price  = v_regular,
            cost_price      = v_cost,
            tags            = v_tags,
            discount_type   = v_dtype,
            discount_value  = v_dvalue,
            discount_percent = v_discount_pct,
            discount_mode   = v_dmode,
            status          = v_status,
            gender          = v_gender,
            -- Derived, not read from the payload. See the badge block above.
            badge           = v_badge,
            badge_type      = v_badge_type,
            is_featured     = COALESCE((p_payload->>'is_featured')::BOOLEAN, false),
            specs           = COALESCE(p_payload->'specs', '{}'::JSONB),
            updated_at      = now()
        WHERE id = v_id;
    END IF;

    -- ---------- option links
    DELETE FROM public.product_colors WHERE product_id = v_id;
    INSERT INTO public.product_colors (product_id, color_id, sort_order)
    SELECT v_id, u.c, u.ord - 1 FROM unnest(v_color_ids) WITH ORDINALITY AS u(c, ord)
    ON CONFLICT (product_id, color_id) DO NOTHING;

    DELETE FROM public.product_sizes WHERE product_id = v_id;
    INSERT INTO public.product_sizes (product_id, size_id, sort_order)
    SELECT v_id, u.s, u.ord - 1 FROM unnest(v_size_ids) WITH ORDINALITY AS u(s, ord)
    ON CONFLICT (product_id, size_id) DO NOTHING;

    -- ---------- the matrix
    -- A product with colours and/or sizes gets the cartesian product of
    -- them. That is not a convenience: resolve_order_variant() refuses an
    -- ambiguous match, so a product offering three colours and four sizes
    -- needs all twelve rows or a customer who picks "Red / M" cannot be
    -- matched to stock and checkout rejects the order.
    IF COALESCE(array_length(v_color_ids, 1), 0) > 0
       OR COALESCE(array_length(v_size_ids, 1), 0) > 0 THEN

        CREATE TEMP TABLE _wanted ON COMMIT DROP AS
        SELECT
            c.color_id,
            s.size_id,
            COALESCE((
                SELECT v.item->>'stock'
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id
            ), '0')::INTEGER AS stock,
            (SELECT v.item->>'price_override'
               FROM jsonb_array_elements(v_variants) AS v(item)
              WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id
                AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id
            ) AS price_override,
            (SELECT v.item->>'sku'
               FROM jsonb_array_elements(v_variants) AS v(item)
              WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id
                AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id
            ) AS sku,
            COALESCE((SELECT (v.item->>'is_active')::BOOLEAN
               FROM jsonb_array_elements(v_variants) AS v(item)
              WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id
                AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id
            ), true) AS is_active
        FROM unnest(v_color_ids) AS c(color_id)
        CROSS JOIN unnest(v_size_ids) AS s(size_id)
        -- Colours but no sizes: one row per colour.
        --
        -- These two branches were written as literal rows -- 0, NULL, NULL,
        -- true -- which looked like a deliberate default but silently threw
        -- away everything the admin typed. The correlated subqueries were
        -- only present in the cross-product branch above, so a product sold in
        -- three colours and no sizes, or five sizes and no colours, stored
        -- stock 0 and a null SKU on every save no matter what the matrix said.
        -- The UI builds the same one-column table for a single axis, so the
        -- fields were editable and the server ignored them.
        --
        -- The lookups are now identical to the two-axis branch, with the
        -- missing side matched as NULL by IS NOT DISTINCT FROM.
        UNION ALL
        SELECT c.color_id, NULL::TEXT,
               COALESCE((
                   SELECT v.item->>'stock'
                     FROM jsonb_array_elements(v_variants) AS v(item)
                    WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id::TEXT
                      AND (v.item->>'size_id')  IS NOT DISTINCT FROM NULL::TEXT
               ), '0')::INTEGER,
               (SELECT v.item->>'price_override'
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id::TEXT
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM NULL::TEXT) AS price_override,
               (SELECT v.item->>'sku'
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id::TEXT
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM NULL::TEXT) AS sku,
               COALESCE((SELECT (v.item->>'is_active')::BOOLEAN
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM c.color_id::TEXT
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM NULL::TEXT), true) AS is_active
          FROM unnest(v_color_ids) AS c(color_id)
         WHERE array_length(v_size_ids, 1) IS NULL
        -- Sizes but no colours: one row per size.
        UNION ALL
        SELECT NULL::TEXT, s.size_id,
               COALESCE((
                   SELECT v.item->>'stock'
                     FROM jsonb_array_elements(v_variants) AS v(item)
                    WHERE (v.item->>'color_id') IS NOT DISTINCT FROM NULL::TEXT
                      AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id::TEXT
               ), '0')::INTEGER,
               (SELECT v.item->>'price_override'
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM NULL::TEXT
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id::TEXT) AS price_override,
               (SELECT v.item->>'sku'
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM NULL::TEXT
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id::TEXT) AS sku,
               COALESCE((SELECT (v.item->>'is_active')::BOOLEAN
                  FROM jsonb_array_elements(v_variants) AS v(item)
                 WHERE (v.item->>'color_id') IS NOT DISTINCT FROM NULL::TEXT
                   AND (v.item->>'size_id')  IS NOT DISTINCT FROM s.size_id::TEXT), true) AS is_active
           FROM unnest(v_size_ids) AS s(size_id)
          WHERE array_length(v_color_ids, 1) IS NULL;

        -- Removed options go, matched on the pair rather than on ids so the
        -- rows that survive keep their identity.
        DELETE FROM public.product_variants pv
        WHERE pv.product_id = v_id
          AND NOT EXISTS (
              SELECT 1 FROM _wanted w
              WHERE w.color_id IS NOT DISTINCT FROM pv.color_id
                AND w.size_id  IS NOT DISTINCT FROM pv.size_id
          );

        -- variant_key is deliberately absent from the column list: it is a
        -- generated column, so writing it is an error rather than a
        -- redundancy. It remains valid as the ON CONFLICT target.
        INSERT INTO public.product_variants (
            product_id, color_id, size_id, sku,
            regular_price_override, stock, is_active
        )
        SELECT v_id, w.color_id, w.size_id,
               NULLIF(btrim(COALESCE(w.sku, '')), ''),
               NULLIF(w.price_override, '')::NUMERIC,
               GREATEST(COALESCE(w.stock, 0), 0),
               COALESCE(w.is_active, true)
        FROM _wanted w
        ON CONFLICT (product_id, variant_key) DO UPDATE SET
            stock                 = EXCLUDED.stock,
            regular_price_override = EXCLUDED.regular_price_override,
            -- A blank SKU in the form means "leave the one I already set",
            -- because an empty field is far more often an unfilled box than
            -- a deliberate request to erase the code.
            sku                   = COALESCE(NULLIF(EXCLUDED.sku, ''), product_variants.sku),
            is_active             = EXCLUDED.is_active,
            updated_at            = now();

        DROP TABLE _wanted;

        -- A product with an option matrix cannot be sold if no showroom is
        -- active, because the stock seeding below would allocate nothing
        -- and checkout would then reject every order with a misleading
        -- "insufficient_stock". This raised as a named error at save time,
        -- when it can still be fixed, rather than once per failed order.
        IF array_length(v_size_ids, 1) IS NULL AND array_length(v_color_ids, 1) IS NULL THEN
            -- No matrix: the ELSE branch below handles it, and needs no allocation.
            NULL;
        ELSIF NOT EXISTS (SELECT 1 FROM public.showrooms s WHERE s.is_active) THEN
            RAISE EXCEPTION 'inventory_not_allocatable' USING ERRCODE = '22023';
        END IF;
        -- A new option has no showroom allocation, and an order cannot be
        -- reserved against a variant that has none. Every active showroom
        -- therefore gets a zero row for every variant, which the admin can
        -- then allocate. The quantity written is the total the admin entered
        -- into the editor, and it is written on every save rather than only
        -- when the row is first created -- product_variants.stock is what the
        -- editor shows, product_stock.quantity is what checkout reserves, and
        -- freezing the latter at zero made a visible stock number unsellable.
        --
        -- GREATEST keeps the new quantity at or above the quantity already held
        -- by outstanding reservations: editing a product must not release a hold
        -- that an in-flight order depends on.
        INSERT INTO public.product_stock (variant_id, showroom_id, quantity, reserved_quantity, updated_at)
        SELECT v.id, s.id, GREATEST(COALESCE(v.stock, 0), 0), 0, now()
        FROM public.product_variants v
        CROSS JOIN public.showrooms s
        WHERE v.product_id = v_id AND s.is_active
        ON CONFLICT (variant_id, showroom_id) DO UPDATE SET
            quantity = GREATEST(EXCLUDED.quantity, public.product_stock.reserved_quantity),
            updated_at = now();
    ELSE
        -- No options at all: a single unnamed variant. Any matrix left from a
        -- previous save is removed, because a row that survives here would
        -- still resolve at checkout and could be sold after the admin
        -- believed the options were gone.
        DELETE FROM public.product_variants WHERE product_id = v_id;
    END IF;

    -- ---------- promotion links
    SELECT COALESCE(array_agg(DISTINCT t.id::TEXT), ARRAY[]::TEXT[])
    INTO v_promo_ids
    FROM jsonb_array_elements_text(COALESCE(p_payload->'promotion_ids', '[]'::JSONB)) AS t(id)
    JOIN public.promotions pr ON pr.id = t.id;
    IF jsonb_array_length(COALESCE(p_payload->'promotion_ids', '[]'::JSONB))
       <> COALESCE(array_length(v_promo_ids, 1), 0) THEN
        RAISE EXCEPTION 'unknown_promotion' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.promotion_products WHERE product_id = v_id;
    INSERT INTO public.promotion_products (promotion_id, product_id)
    SELECT p, v_id FROM unnest(v_promo_ids) AS p
    ON CONFLICT DO NOTHING;

    -- ---------- project the options back onto the product
    -- The storefront reads products.colors and products.sizes directly, so
    -- both are rebuilt from the canonical tables on every save rather than
    -- typed in. Per-size stock is the total across the colours that size is
    -- offered in, which is what a shopper who picks a size before a colour
    -- is asking about.
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', c.name, 'hex', c.hex) ORDER BY pc.sort_order
    ), '[]'::JSONB)
    INTO v_color_rows
    FROM public.product_colors pc
    JOIN public.colors c ON c.id = pc.color_id
    WHERE pc.product_id = v_id;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'size', s.display_name,
            'chest', COALESCE((
                SELECT sm.measurements->>'chest'
                  FROM public.size_measurements sm
                 WHERE sm.size_id = s.id AND sm.region_code = 'BD'
                 LIMIT 1
            ), ''),
            'stock', COALESCE((
                SELECT SUM(v.stock) FROM public.product_variants v
                 WHERE v.size_id = s.id AND v.product_id = v_id AND v.is_active
            ), 0)::INTEGER
        ) ORDER BY ps.sort_order
    ), '[]'::JSONB)
    INTO v_size_rows
    FROM public.product_sizes ps
    JOIN public.sizes s ON s.id = ps.size_id
    WHERE ps.product_id = v_id;

    UPDATE public.products
    SET colors            = v_color_rows,
        sizes             = v_size_rows,
        color_palette_ids = v_color_ids
    WHERE id = v_id;

    SELECT jsonb_build_object(
        'id', v_id,
        'slug', v_slug,
        'variant_count', (SELECT count(*)::INTEGER
                          FROM public.product_variants WHERE product_id = v_id),
        'stock', COALESCE((SELECT SUM(stock) FROM public.product_variants
                           WHERE product_id = v_id AND is_active), 0)::INTEGER,
        -- What was actually stored, so the client can confirm the number it
        -- will read back rather than trusting its own preview. These four are
        -- the ones a rounding disagreement shows up in: an admin who typed a
        -- new price of 849.99 and got 850.00 back can see that here instead of
        -- discovering it on the storefront.
        'regular_price', v_regular,
        'sale_price', v_sale,
        'discount_mode', v_dmode,
        'discount_percent', v_discount_pct,
        'badge', v_badge
    )
    INTO v_result;

    RETURN v_result;
END;
$function$
;
