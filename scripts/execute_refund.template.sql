CREATE OR REPLACE FUNCTION public.execute_refund(payload JSONB)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    -- ---- identity from the session, never from the payload --------------
    v_caller          UUID := auth.uid();
    v_is_admin        BOOLEAN := public.is_admin();
    v_now             TIMESTAMPTZ := now();

    -- ---- payload --------------------------------------------------------
    v_order_id        TEXT := btrim(COALESCE(payload->>'order_id', ''));
    v_original_pay_id TEXT := btrim(COALESCE(payload->>'original_payment_id', ''));
    v_reason          TEXT := NULLIF(btrim(COALESCE(payload->>'reason', '')), '');
    v_notes           TEXT := NULLIF(btrim(COALESCE(payload->>'notes', '')), '');
    v_txn_ref         TEXT := NULLIF(btrim(COALESCE(payload->>'transaction_ref', '')), '');
    v_provider        TEXT := COALESCE(NULLIF(btrim(payload->>'provider'), ''), 'cod');
    v_return_id       TEXT := NULLIF(btrim(COALESCE(payload->>'return_id', '')), '');
    v_cancellation_id TEXT := NULLIF(btrim(COALESCE(payload->>'cancellation_id', '')), '');
    v_items           JSONB := COALESCE(payload->'items', '[]'::JSONB);
    v_deductions      JSONB := COALESCE(payload->'deductions', '[]'::JSONB);

    -- ---- resolved -------------------------------------------------------
    v_payment         public.payments%ROWTYPE;
    v_refund_id       TEXT := 'REF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    v_item_total      NUMERIC := 0;
    v_deduction_total NUMERIC := 0;
    v_refund_total    NUMERIC := 0;
    v_refunded_so_far NUMERIC := 0;
    v_refundable      NUMERIC := 0;
    v_paid            NUMERIC := 0;
    v_short           NUMERIC := 0;

    v_item            JSONB;
    v_deduction       JSONB;
    v_order_item      public.order_items%ROWTYPE;
    v_line_total      NUMERIC;
    v_unit_refund     NUMERIC;
    v_quantity        INTEGER;
    v_already_returning INTEGER;
    v_deduction_amount NUMERIC;
    v_kind            TEXT;
    v_label           TEXT;
    v_ded_notes       TEXT;
    v_new_status      TEXT;

    v_valid_deduction_kinds TEXT[] := ARRAY[
        'delivery_fee', 'restocking_fee', 'coupon_clawback',
        'wear_and_tear', 'customer_request', 'shipping_difference'
    ];
BEGIN
    -- ---- authorisation --------------------------------------------------
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;

    -- ---- shape ----------------------------------------------------------
    IF v_order_id = '' OR v_original_pay_id = '' THEN
        RAISE EXCEPTION 'order_id and original_payment_id are required' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'refund_has_no_items: at least one item is required' USING ERRCODE = '22023';
    END IF;

    -- ---- the charge being refunded, locked ------------------------------
    -- FOR UPDATE so two concurrent refunds serialise on the same charge and
    -- the balance check below cannot be answered against a stale figure.
    SELECT * INTO v_payment
    FROM public.payments p
    WHERE p.id = v_original_pay_id
      AND p.order_id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payment_not_found: charge % is not on order %', v_original_pay_id, v_order_id
            USING ERRCODE = '22023';
    END IF;

    IF v_payment.type <> 'charge' THEN
        RAISE EXCEPTION 'not_a_charge: % is a % row, and only a charge can be refunded',
            v_original_pay_id, v_payment.type
            USING ERRCODE = '22023';
    END IF;

    -- Only money that actually settled can be given back. An 'initiated' bKash
    -- charge that never completed is not money the store holds.
    IF v_payment.status NOT IN ('successful', 'partially_refunded') THEN
        RAISE EXCEPTION 'payment_not_refundable: a charge in status % cannot be refunded', v_payment.status
            USING ERRCODE = '22023';
    END IF;

    IF v_provider <> v_payment.provider THEN
        RAISE EXCEPTION 'provider_mismatch: a refund must leave by the same provider it arrived on (% not %)',
            v_payment.provider, v_provider
            USING ERRCODE = '22023';
    END IF;

    -- ---- the balance, computed once -------------------------------------
    SELECT amount_paid, refundable_now
    INTO v_paid, v_refundable
    FROM public.order_financials
    WHERE order_id = v_order_id;

    IF v_paid IS NULL OR v_paid <= 0 THEN
        RAISE EXCEPTION 'refund_without_payment: order % has no collected charge', v_order_id
            USING ERRCODE = '22023';
    END IF;

    -- ---- validate the items before writing anything ----------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 0);
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'invalid_quantity: a refund item needs a positive quantity' USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_order_item
        FROM public.order_items oi
        WHERE oi.id = (v_item->>'order_item_id')
          AND oi.order_id = v_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'order_item_not_found: item % is not on order %',
                v_item->>'order_item_id', v_order_id
                USING ERRCODE = '22023';
        END IF;

        -- The unit refund defaults to what was paid, and may be lower, but a
        -- caller cannot refund a unit for more than it sold for.
        v_unit_refund := COALESCE(NULLIF(v_item->>'unit_refund', '')::NUMERIC, v_order_item.unit_price);
        IF v_unit_refund < 0 THEN
            RAISE EXCEPTION 'invalid_unit_refund: a unit refund cannot be negative' USING ERRCODE = '22023';
        END IF;
        IF v_unit_refund > v_order_item.unit_price THEN
            RAISE EXCEPTION 'unit_refund_exceeds_paid: % is more than the % actually paid per unit',
                v_unit_refund, v_order_item.unit_price
                USING ERRCODE = '22023';
        END IF;

        v_line_total := ROUND(v_unit_refund * v_quantity, 2);
        v_item_total := v_item_total + v_line_total;

        -- The quantity rule is checked here, before the balance check further
        -- down, because it is the more specific answer. Asked to return 99 of a
        -- 2-unit line, "you ordered 2" is the useful reply; "that is 48440 more
        -- than the balance" is true but points at the wrong mistake. The
        -- database trigger on refund_items raises the same error, so this
        -- pre-check only changes which message the customer sees first.
        v_already_returning := 0;

        SELECT COALESCE(SUM(ri.quantity), 0)
        INTO v_already_returning
        FROM public.refund_items ri
        JOIN public.refunds r ON r.id = ri.refund_id
        WHERE ri.order_item_id = v_order_item.id
          AND r.status NOT IN ('cancelled', 'failed');

        IF v_quantity > v_order_item.quantity - v_already_returning THEN
            RAISE EXCEPTION 'refund_quantity_exceeds_ordered: ordered %, already returning %, requesting %',
                v_order_item.quantity, v_already_returning, v_quantity
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- ---- validate the deductions ----------------------------------------
    FOR v_deduction IN SELECT * FROM jsonb_array_elements(v_deductions) LOOP
        v_kind            := COALESCE(NULLIF(btrim(v_deduction->>'kind'), ''), 'customer_request');
        v_label           := NULLIF(btrim(COALESCE(v_deduction->>'label', '')), '');
        v_ded_notes       := NULLIF(btrim(COALESCE(v_deduction->>'notes', '')), '');
        v_deduction_amount := COALESCE(NULLIF(v_deduction->>'amount', '')::NUMERIC, 0);

        IF NOT (v_kind = ANY(v_valid_deduction_kinds)) THEN
            RAISE EXCEPTION 'invalid_deduction_kind: % is not a deduction this store takes', v_kind
                USING ERRCODE = '22023';
        END IF;

        IF v_deduction_amount <= 0 THEN
            RAISE EXCEPTION 'invalid_deduction_amount: a deduction must take something off' USING ERRCODE = '22023';
        END IF;

        -- A label the customer can read. kind is the machine value; a blank
        -- label leaves the statement with no words to show anyone.
        IF v_label IS NULL THEN
            v_label := v_kind;
        END IF;

        v_deduction_total := v_deduction_total + v_deduction_amount;
    END LOOP;

    v_item_total      := ROUND(v_item_total, 2);
    v_deduction_total := ROUND(v_deduction_total, 2);

    -- Deductions cannot be larger than what is being given back, or the refund
    -- would be negative and the "refund" would in fact be a charge.
    IF v_deduction_total > v_item_total THEN
        RAISE EXCEPTION 'deductions_exceed_items: deductions of % exceed the % being refunded',
            v_deduction_total, v_item_total
            USING ERRCODE = '22023';
    END IF;

    v_refund_total := ROUND(v_item_total - v_deduction_total, 2);

    IF v_refund_total <= 0 THEN
        RAISE EXCEPTION 'refund_total_not_positive: % after deductions, so nothing would be refunded',
            v_refund_total
            USING ERRCODE = '22023';
    END IF;

    -- ---- the one place a refund is checked against what was paid ---------
    v_short := v_refund_total - v_refundable;
    IF v_short > 0 THEN
        RAISE EXCEPTION 'refund_exceeds_balance: refund of % is % more than the % refundable',
            v_refund_total, v_short, v_refundable
            USING ERRCODE = '22023';
    END IF;

    -- ---- the aggregate ---------------------------------------------------
    INSERT INTO public.refunds (
        id, order_id, return_id, cancellation_id, original_payment_id,
        user_id, status, item_total, deductions_total, refund_total,
        provider, transaction_ref, reason, notes,
        approved_by, approved_at, executed_by, executed_at
    ) VALUES (
        v_refund_id, v_order_id, v_return_id, v_cancellation_id, v_original_pay_id,
        v_payment.user_id, 'completed', v_item_total, v_deduction_total, v_refund_total,
        v_provider, v_txn_ref, v_reason, v_notes,
        v_caller, v_now, v_caller, v_now
    );

    -- ---- the refund lines ------------------------------------------------
    -- The quantity guard fires per row, so an over-return raises before any
    -- money has moved and the whole transaction unwinds with it.
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_quantity    := COALESCE((v_item->>'quantity')::INTEGER, 0);
        v_unit_refund := COALESCE(
            NULLIF(v_item->>'unit_refund', '')::NUMERIC,
            (SELECT unit_price FROM public.order_items WHERE id = (v_item->>'order_item_id'))
        );

        INSERT INTO public.refund_items (refund_id, order_item_id, quantity, unit_refund, line_total)
        VALUES (v_refund_id, v_item->>'order_item_id', v_quantity, v_unit_refund, 0);
    END LOOP;

    -- ---- the deductions --------------------------------------------------
    FOR v_deduction IN SELECT * FROM jsonb_array_elements(v_deductions) LOOP
        INSERT INTO public.refund_deductions (
            refund_id, kind, label, amount, notes
        ) VALUES (
            v_refund_id,
            COALESCE(NULLIF(btrim(v_deduction->>'kind'), ''), 'customer_request'),
            COALESCE(NULLIF(btrim(COALESCE(v_deduction->>'label', '')), ''), v_deduction->>'kind'),
            COALESCE(NULLIF(v_deduction->>'amount', '')::NUMERIC, 0),
            NULLIF(btrim(COALESCE(v_deduction->>'notes', '')), '')
        );
    END LOOP;

    -- Recompute from the rows rather than trust the figures carried in.
    PERFORM public.refresh_refund_totals(v_refund_id);

    SELECT item_total, deductions_total, refund_total
    INTO v_item_total, v_deduction_total, v_refund_total
    FROM public.refunds WHERE id = v_refund_id;

    -- ---- the money movement ---------------------------------------------
    INSERT INTO public.payments (
        order_id, user_id, type, provider, amount, status,
        purpose, refund_of_payment_id, provider_txn_id, recorded_by, metadata
    ) VALUES (
        v_order_id,
        v_payment.user_id,
        'refund',
        v_provider,
        v_refund_total,
        'successful',
        COALESCE(NULLIF(btrim(payload->>'purpose'), ''), 'retroactive'),
        v_original_pay_id,
        v_txn_ref,
        v_caller,
        jsonb_build_object('refund_id', v_refund_id, 'reason', v_reason)
    );

    -- ---- the settlement detail ------------------------------------------
    -- 1:1 with the payments row, so there is exactly one money trail.
    INSERT INTO public.refund_transactions (
        original_payment_id, cancellation_id, return_id, refund_id, user_id,
        amount, payment_method, status, processed_at, processed_by,
        transaction_ref, notes
    ) VALUES (
        v_original_pay_id, v_cancellation_id, v_return_id, v_refund_id, v_payment.user_id,
        v_refund_total, v_provider, 'processed', v_now, v_caller,
        v_txn_ref, v_notes
    );

    -- ---- the charge's derived status -------------------------------------
    -- Recomputed from every refund against this charge, not incremented by
    -- hand: the second partial refund must land on the same answer as the
    -- first, and the last one must reach 'refunded' exactly when the balance
    -- reaches zero.
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_refunded_so_far
    FROM public.payments p
    WHERE p.refund_of_payment_id = v_original_pay_id
      AND p.type = 'refund'
      AND p.status = 'successful';

    IF v_refunded_so_far >= v_payment.amount THEN
        v_new_status := 'refunded';
    ELSIF v_refunded_so_far > 0 THEN
        v_new_status := 'partially_refunded';
    ELSE
        v_new_status := 'successful';
    END IF;

    UPDATE public.payments
    SET status = v_new_status, updated_at = v_now
    WHERE id = v_original_pay_id;

    -- ---- the parent record, if there is one ------------------------------
    -- A return's refund_amount is written from the executed refund and nothing
    -- else. It used to be typed in through a prompt, which is how a number
    -- appeared there that no payment row backed.
    IF v_return_id IS NOT NULL THEN
        UPDATE public.returns
        SET refund_amount = (
                SELECT COALESCE(SUM(rf.refund_total), 0)
                FROM public.refunds rf
                WHERE rf.return_id = v_return_id
                  AND rf.status = 'completed'
            ),
            refund_payment_id = v_original_pay_id,
            notes = COALESCE(v_notes, notes),
            updated_at = v_now
        WHERE id = v_return_id;
    END IF;

    IF v_cancellation_id IS NOT NULL THEN
        UPDATE public.cancellations
        SET refund_amount = (
                SELECT COALESCE(SUM(rf.refund_total), 0)
                FROM public.refunds rf
                WHERE rf.cancellation_id = v_cancellation_id
                  AND rf.status = 'completed'
            ),
            refund_payment_id = v_original_pay_id,
            updated_at = v_now
        WHERE id = v_cancellation_id;
    END IF;

    RETURN jsonb_build_object(
        'refund_id',        v_refund_id,
        'order_id',         v_order_id,
        'item_total',       v_item_total,
        'deductions_total', v_deduction_total,
        'refund_total',     v_refund_total,
        'provider',         v_provider,
        'original_payment_id', v_original_pay_id,
        'payment_status',   v_new_status,
        'refunded_so_far',  v_refunded_so_far,
        'charge_amount',    v_payment.amount,
        'refundable_after', GREATEST(v_payment.amount - v_refunded_so_far, 0)
    );
END;
$function$;
