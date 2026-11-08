-- Payment gateway support (Phase 0: payment provider layer).
--
-- A payment row can now belong to an online gateway (UnivaPayment first).
-- The gateway's own id, checkout link and raw status are kept beside the
-- store's status, which stays the one the rest of the system reads:
--
--   gateway status    -> payments.status
--   initiated/pending -> initiated
--   review            -> initiated (gateway_status says 'review')
--   completed         -> successful
--   rejected          -> failed
--   expired           -> cancelled
--   refunded          -> unchanged (refunds are recorded by the refund system,
--                        because UnivaPayment does not send money back)
--
-- Status changes from the gateway go through apply_gateway_payment_update(),
-- which only the service role can call: the webhook route verifies the
-- signature first and then calls it with the service key.
--
-- Safe to re-run.

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS gateway TEXT,
    ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
    ADD COLUMN IF NOT EXISTS gateway_status TEXT,
    ADD COLUMN IF NOT EXISTS checkout_url TEXT,
    ADD COLUMN IF NOT EXISTS gateway_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_payment_uidx
    ON public.payments (gateway, gateway_payment_id)
    WHERE gateway_payment_id IS NOT NULL;

COMMENT ON COLUMN public.payments.gateway IS
    'Online gateway that handles this payment (e.g. univapayment). NULL for offline methods.';
COMMENT ON COLUMN public.payments.gateway_status IS
    'Raw status reported by the gateway (initiated, pending, review, completed, rejected, expired, refunded).';

-- One stored copy per webhook event, so a retried delivery is processed once.
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhooks_event_uidx
    ON public.payment_webhooks (provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

INSERT INTO public.payment_methods (code, display_name, category, is_active, requires_confirmation, instructions)
SELECT 'univapayment', 'bKash / Nagad (online)', 'wallet', true, false,
       'Pay from your bKash or Nagad app. We confirm the payment automatically.'
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code = 'univapayment');

-- ----------------------------------------------------------------------
-- apply_gateway_payment_update
-- ----------------------------------------------------------------------
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
    v_order_status TEXT;
    v_became_successful BOOLEAN := false;
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

    -- A completed online payment confirms a pending order.
    SELECT status INTO v_order_status FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;
    IF v_became_successful AND v_order_status = 'pending' THEN
        UPDATE public.orders SET status = 'processing' WHERE id = v_payment.order_id;
        v_order_status := 'processing';
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'order_id', v_payment.order_id,
        'previous_status', v_payment.status,
        'status', v_new_status,
        'gateway_status', p_gateway_status,
        'order_status', v_order_status,
        'became_successful', v_became_successful
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_gateway_payment_update(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_gateway_payment_update(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
