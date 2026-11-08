-- Migration: tell an unallocated variant apart from a sold-out one.
--
-- Both raised insufficient_stock, so a customer trying to buy a product whose
-- stock row was never written was told "An item just sold out." Nothing had
-- sold out, and the message sent the store owner looking for a demand problem
-- instead of a configuration one.
--
--   variant_unallocated  the variant has no stock row for any active showroom.
--                        A configuration fault: never a customer's problem as
--                        worded, and fixed in the admin, not on the storefront.
--   insufficient_stock   the allocation exists and is genuinely exhausted.
--
-- The two are separated by repeating the same lookup without the quantity
-- predicate, inside the same transaction and after the FOR UPDATE, so the
-- answer cannot disagree with the row the reserve just failed to find.
--
-- Generated from the live definition with the edit applied and verified.
--
-- Applied to: remote (project khebwqdhucrdfpfadxry)

CREATE OR REPLACE FUNCTION public.create_order_with_reservations(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_order_id      TEXT := COALESCE(
        NULLIF(payload->>'order_id', ''),
        'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    );
    -- (a) Not seeded from the payload. The delivery charge is derived in
    -- this function from the subtotal it has just computed, so a client
    -- cannot set the fee on its own order.
    v_shipping      NUMERIC;
    v_city          TEXT := COALESCE(payload->>'city', '');
    v_notes         TEXT := NULLIF(LEFT(TRIM(COALESCE(payload->>'notes', '')), 500), '');
    v_items         JSONB := COALESCE(payload->'items', '[]'::JSONB);
    v_coupon_code   TEXT := upper(btrim(COALESCE(payload->>'coupon_code', '')));
    v_coupon_id     TEXT;
    v_coupon_name   TEXT;
    v_coupon_result JSONB;
    v_coupon_alloc  JSONB;
    v_coupon_amount NUMERIC := 0;
    v_reason        TEXT;

    v_prices        JSONB;
    v_price         JSONB;
    v_lines         JSONB := '[]'::JSONB;
    v_line          JSONB;
    v_item          JSONB;
    v_row           RECORD;
    v_quantity      INTEGER;
    v_promo_final   NUMERIC;
    v_base_price    NUMERIC;
    v_coupon_share  NUMERIC;
    v_line_final    NUMERIC;
    v_unit_price    NUMERIC;

    v_subtotal          NUMERIC := 0;
    v_discount_total    NUMERIC := 0;
    v_coupon_discount   NUMERIC := 0;

    v_stock         public.product_stock%ROWTYPE;
    v_item_id       TEXT;
    v_reservation_id TEXT;
    v_coupon_per_line NUMERIC;

    -- Delivery rules. Kept in one place on purpose: the checkout page and
    -- this function have to quote the same numbers, or the customer is
    -- shown one total and charged another.
    c_free_over     CONSTANT NUMERIC := 1500;
    c_dhaka_fee     CONSTANT NUMERIC := 60;
    c_outside_fee   CONSTANT NUMERIC := 120;
BEGIN
    IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'empty_order' USING ERRCODE = '22023';
    END IF;

    -- ------------------------------------------------------------
    -- Coupon: lock, re-validate, price. Never trusted from the client.
    -- ------------------------------------------------------------
    IF v_coupon_code <> '' THEN
        SELECT c.id, c.code INTO v_coupon_id, v_coupon_name
        FROM public.coupons c
        WHERE upper(c.code) = v_coupon_code
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'coupon_not_found' USING ERRCODE = '22023';
        END IF;

        v_reason := public.coupon_ineligibility_reason(v_coupon_id);
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
        END IF;

        v_coupon_result := public.coupon_allocations(v_coupon_id, v_items);
        -- Unwrap the array explicitly. `result -> 0` would look up a
        -- KEY named "0" on the object and silently return NULL, which
        -- COALESCE would then quietly turn into a zero discount.
        v_coupon_alloc  := COALESCE(v_coupon_result->'allocations', '[]'::JSONB);
        v_coupon_amount := COALESCE((v_coupon_result->>'discount_amount')::NUMERIC, 0);
    END IF;

    -- ------------------------------------------------------------
    -- Server-authoritative prices for every product in the cart
    -- ------------------------------------------------------------
    SELECT COALESCE(jsonb_object_agg(e.product_id, to_jsonb(e)), '{}'::JSONB)
    INTO v_prices
    FROM public.get_effective_prices(ARRAY(
        SELECT DISTINCT t.item->>'product_id'
        FROM jsonb_array_elements(v_items) AS t(item)
        WHERE NULLIF(t.item->>'product_id', '') IS NOT NULL
    )) e;

    -- ------------------------------------------------------------
    -- Resolve each line once: post-promotion price, then the coupon
    -- share, then the final unit price actually charged.
    -- ------------------------------------------------------------
    FOR v_row IN
        SELECT t.item AS item, t.ord AS ord
        FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(item, ord)
        ORDER BY t.ord
    LOOP
        v_item     := v_row.item;
        v_quantity := COALESCE((v_row.item->>'quantity')::INTEGER, 0);
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
        END IF;

        v_price := v_prices -> (v_row.item->>'product_id');
        IF v_price IS NULL THEN
            RAISE EXCEPTION 'product_not_found:%', v_row.item->>'product_id'
                USING ERRCODE = '22023';
        END IF;

        v_promo_final := (v_price->>'final_price')::NUMERIC;
        v_base_price  := (v_price->>'base_price')::NUMERIC;

        -- Positional lookup: coupon_allocations() is index-aligned
        -- with v_items, and v_item.ord is that same 1-based position.
        v_coupon_share := COALESCE(
            (v_coupon_alloc -> (v_row.ord - 1)::INTEGER)::NUMERIC, 0
        );

        v_line_final := ROUND((v_promo_final * v_quantity) - v_coupon_share, 2);
        IF v_line_final < 0 THEN
            -- Cannot go negative even if a discount were misconfigured.
            v_line_final    := 0;
            v_coupon_share  := ROUND(v_promo_final * v_quantity, 2);
        END IF;

        v_unit_price := ROUND(v_line_final / v_quantity, 2);

        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'item',          v_row.item,
            'quantity',      v_quantity,
            'promo_final',   v_promo_final,
            'base_price',    v_base_price,
            'unit_price',    v_unit_price,
            -- Recomputed from the stored unit_price, not from the
            -- allocation, so the per-line coupon figure is the truth.
            'coupon_amount', GREATEST(
                ROUND(v_promo_final * v_quantity, 2)
                - ROUND(v_unit_price * v_quantity, 2), 0),
            'discount_type',    v_price->>'discount_type',
            'discount_value',   v_price->>'discount_value',
            'promotion_id',     NULLIF(v_price->>'promotion_id', ''),
            'promotion_name',   v_price->>'promotion_name'
        ));
    END LOOP;

    -- ------------------------------------------------------------
    -- Totals, derived from the unit_price we just committed to
    -- ------------------------------------------------------------
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
        v_quantity       := (v_line->>'quantity')::INTEGER;
        v_base_price     := (v_line->>'base_price')::NUMERIC;
        v_unit_price     := (v_line->>'unit_price')::NUMERIC;
        v_coupon_per_line:= (v_line->>'coupon_amount')::NUMERIC;

        v_subtotal        := v_subtotal + ROUND(v_unit_price * v_quantity, 2);
        v_discount_total  := v_discount_total
                             + (ROUND(v_base_price * v_quantity, 2)
                                - ROUND(v_unit_price * v_quantity, 2));
        v_coupon_discount := v_coupon_discount + v_coupon_per_line;
    END LOOP;

    v_subtotal        := ROUND(v_subtotal, 2);
    v_discount_total  := ROUND(v_discount_total, 2);
    v_coupon_discount := ROUND(v_coupon_discount, 2);

    -- ------------------------------------------------------------
    -- (c) Delivery charge, derived from the authoritative subtotal.
    --
    -- The client's figure is ignored. Anything outside Dhaka pays the
    -- outside rate, an empty or unrecognised city is treated as inside
    -- Dhaka (the cheaper of the two, so a missing value can never
    -- overcharge), and the order is free at or over the threshold.
    --
    -- The city arrives as the human label ("Outside Dhaka") because the
    -- route maps the form's code before calling this function, so the
    -- match is on either spelling -- comparing against the bare code
    -- would silently charge every order the Dhaka rate.
    -- ------------------------------------------------------------
    IF v_subtotal >= c_free_over OR v_subtotal <= 0 THEN
        v_shipping := 0;
    ELSIF v_city ILIKE 'outside%' THEN
        v_shipping := c_outside_fee;
    ELSE
        v_shipping := c_dhaka_fee;
    END IF;

    -- ------------------------------------------------------------
    -- Order row
    -- ------------------------------------------------------------
    INSERT INTO public.orders (
        id, user_id, customer_name, customer_phone, customer_email,
        delivery_address, city, subtotal, discount_total, shipping_fee,
        total_amount, payment_method, status, notes,
        coupon_id, coupon_code, coupon_discount_total
    ) VALUES (
        v_order_id,
        auth.uid(),
        payload->>'customer_name',
        payload->>'customer_phone',
        NULLIF(payload->>'customer_email', ''),
        payload->>'delivery_address',
        payload->>'city',
        v_subtotal,
        v_discount_total,
        v_shipping,
        v_subtotal + v_shipping,
        COALESCE(NULLIF(payload->>'payment_method', ''), 'cod'),
        'pending',
        v_notes,
        v_coupon_id,
        v_coupon_name,
        v_coupon_discount
    );

    -- ------------------------------------------------------------
    -- Reserve stock and write lines, reading the already-resolved
    -- values so the rows cannot disagree with the totals above.
    -- ------------------------------------------------------------
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
        v_item     := v_line->'item';
        v_quantity := (v_line->>'quantity')::INTEGER;

        SELECT st.* INTO v_stock
        FROM public.product_stock st
        JOIN public.showrooms s ON s.id = st.showroom_id
        WHERE st.variant_id = v_item->>'variant_id'
          AND s.is_active
          AND st.quantity - st.reserved_quantity >= v_quantity
        ORDER BY s.fulfillment_priority ASC, st.showroom_id
        LIMIT 1
        FOR UPDATE OF st;

        IF NOT FOUND THEN
            -- Two very different failures used to share one message. A
            -- variant with no allocation at all is a configuration fault --
            -- no showroom, or a stock row that was never written -- and
            -- reporting it to a customer as "sold out" both lost the sale
            -- and hid the fault from the store owner. The allocation is
            -- distinguished from a genuinely exhausted one by dropping the
            -- quantity predicate from the same lookup.
            IF NOT EXISTS (
                SELECT 1
                FROM public.product_stock st2
                JOIN public.showrooms s2 ON s2.id = st2.showroom_id
                WHERE st2.variant_id = v_item->>'variant_id'
                  AND s2.is_active
            ) THEN
                RAISE EXCEPTION 'variant_unallocated:%', v_item->>'variant_id'
                    USING ERRCODE = 'P0001';
            END IF;

            RAISE EXCEPTION 'insufficient_stock:%', v_item->>'variant_id'
                USING ERRCODE = 'P0001';
        END IF;

        UPDATE public.product_stock
        SET reserved_quantity = reserved_quantity + v_quantity, updated_at = now()
        WHERE variant_id = v_stock.variant_id AND showroom_id = v_stock.showroom_id;

        INSERT INTO public.order_items (
            order_id, product_id, title, size, color, quantity,
            unit_price, base_price, image, variant_id, showroom_id,
            applied_discount_type, applied_discount_value,
            promotion_id, promotion_name,
            coupon_id, coupon_code, coupon_discount_total
        ) VALUES (
            v_order_id,
            v_item->>'product_id',
            v_item->>'title',
            COALESCE(v_item->>'size', ''),
            COALESCE(v_item->>'color', ''),
            v_quantity,
            (v_line->>'unit_price')::NUMERIC,
            (v_line->>'base_price')::NUMERIC,
            NULLIF(v_item->>'image', ''),
            v_item->>'variant_id',
            v_stock.showroom_id,
            (v_line->>'discount_type')::TEXT,
            (v_line->>'discount_value')::NUMERIC,
            v_line->>'promotion_id',
            v_line->>'promotion_name',
            v_coupon_id,
            v_coupon_name,
            (v_line->>'coupon_amount')::NUMERIC
        ) RETURNING id INTO v_item_id;

        INSERT INTO public.stock_reservations (variant_id, showroom_id, order_item_id, quantity, status, expires_at)
        VALUES (v_stock.variant_id, v_stock.showroom_id, v_item_id, v_quantity, 'reserved', now() + interval '30 minutes')
        RETURNING id INTO v_reservation_id;

        INSERT INTO public.inventory_movements (variant_id, showroom_id, delta, reason, reference_id)
        VALUES (v_stock.variant_id, v_stock.showroom_id, 0, 'reservation', v_reservation_id);
    END LOOP;

    -- ------------------------------------------------------------
    -- Redemption, inside the same transaction. If any statement above
    -- raised, this row is rolled back with the order, so a failed
    -- checkout can never burn a use.
    -- ------------------------------------------------------------
    IF v_coupon_id IS NOT NULL THEN
        INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, amount)
        VALUES (v_coupon_id, auth.uid(), v_order_id, v_coupon_discount)
        ON CONFLICT (coupon_id, order_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'status', 'reserved',
        'subtotal', v_subtotal,
        'discount_total', v_discount_total,
        'coupon_discount_total', v_coupon_discount,
        'coupon_code', v_coupon_name,
        'shipping_fee', v_shipping,
        'total_amount', v_subtotal + v_shipping
    );
END;
$function$
;
