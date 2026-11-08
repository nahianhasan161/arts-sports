-- An order that must be paid online first (full payment, or COD with the
-- delivery charge paid first) is not a real order until that payment lands.
-- When the gateway reports the payment as expired or rejected, and no other
-- online payment for the order is still open or paid, the order is cancelled
-- and its reserved stock goes back on sale.

CREATE OR REPLACE FUNCTION public.apply_gateway_payment_update(
    p_gateway TEXT,
    p_gateway_payment_id TEXT,
    p_gateway_status TEXT,
    p_trx_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment public.payments%ROWTYPE;
    v_new_status TEXT;
    v_order public.orders%ROWTYPE;
    v_order_status TEXT;
    v_became_successful BOOLEAN := false;
    v_became_unpaid BOOLEAN := false;
    v_order_cancelled BOOLEAN := false;
    v_reservation_id TEXT;
BEGIN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE gateway = p_gateway AND gateway_payment_id = p_gateway_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'gateway_payment_not_found';
    END IF;

    v_new_status := CASE p_gateway_status
        WHEN 'completed' THEN 'successful'
        WHEN 'rejected'  THEN 'failed'
        WHEN 'expired'   THEN 'cancelled'
        ELSE v_payment.status
    END;

    -- Never move a settled row backwards. A late 'pending' after 'completed'
    -- (webhooks can arrive out of order) must not undo the payment.
    IF v_payment.status <> 'initiated' THEN
        v_new_status := v_payment.status;
    END IF;

    v_became_successful := v_payment.status = 'initiated' AND v_new_status = 'successful';
    v_became_unpaid := v_payment.status = 'initiated' AND v_new_status IN ('failed', 'cancelled');

    UPDATE public.payments
    SET status = v_new_status,
        gateway_status = CASE
            WHEN v_payment.status <> 'initiated' AND p_gateway_status IN ('initiated', 'pending', 'review')
                THEN gateway_status
            ELSE p_gateway_status
        END,
        provider_txn_id = COALESCE(NULLIF(p_trx_id, ''), provider_txn_id),
        gateway_synced_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('gateway', p_details)
    WHERE id = v_payment.id;

    SELECT * INTO v_order FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;
    v_order_status := v_order.status;

    -- A completed online payment confirms a pending order.
    IF v_became_successful AND v_order_status = 'pending' THEN
        UPDATE public.orders SET status = 'processing' WHERE id = v_payment.order_id;
        v_order_status := 'processing';
    END IF;

    -- The payment the order was waiting for will never come.
    IF v_became_unpaid
       AND v_order_status = 'pending'
       AND v_order.confirmation_status = 'awaiting_payment'
       AND NOT EXISTS (
           SELECT 1 FROM public.payments p
           WHERE p.order_id = v_payment.order_id
             AND p.id <> v_payment.id
             AND p.type = 'charge'
             AND p.gateway IS NOT NULL
             AND p.status IN ('initiated', 'successful', 'partially_refunded')
       ) THEN
        UPDATE public.orders
        SET status = 'cancelled',
            confirmation_status = 'rejected'
        WHERE id = v_payment.order_id;
        v_order_status := 'cancelled';
        v_order_cancelled := true;

        -- The rider-collects balance row of a "pay delivery charge first" order.
        UPDATE public.payments
        SET status = 'cancelled'
        WHERE order_id = v_payment.order_id
          AND type = 'charge'
          AND gateway IS NULL
          AND status = 'initiated';

        FOR v_reservation_id IN
            SELECT r.id FROM public.stock_reservations r
            WHERE r.status = 'reserved'
              AND r.order_item_id IN (SELECT oi.id FROM public.order_items oi WHERE oi.order_id = v_payment.order_id)
        LOOP
            PERFORM public.release_stock(v_reservation_id);
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'order_id', v_payment.order_id,
        'previous_status', v_payment.status,
        'status', v_new_status,
        'gateway_status', p_gateway_status,
        'order_status', v_order_status,
        'became_successful', v_became_successful,
        'order_cancelled', v_order_cancelled
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_gateway_payment_update(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_gateway_payment_update(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
