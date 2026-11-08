-- Migration: amount_paid must count money that actually arrived.
--
-- First version counted a charge only while its status was 'successful'. That
-- was wrong the moment the refund model ran: a full refund moves the charge to
-- 'refunded', which dropped it out of amount_paid, which made net_position
-- negative and made refundable_balance zero -- so a second partial refund was
-- refused with refund_without_payment on an order the customer had demonstrably
-- paid for.
--
-- The distinction is between money that settled and money that is still
-- pending. A charge that has ever settled stays paid, however it is later
-- marked: partially_refunded, refunded and charged_back are all post-settlement
-- states, and the customer's money really did arrive. 'initiated' is the only
-- in-flight state; 'failed' and 'cancelled' never held money at all.
--
-- The verification that found this is scripts/refund-model-verify.cjs, which
-- runs the full refund and then reads the view -- a full refund must leave
-- net_position at zero, not at minus the order total.

CREATE OR REPLACE VIEW public.order_financials AS
WITH payment_totals AS (
    SELECT
        order_id,
        -- Money that actually arrived. Every post-settlement status counts,
        -- including the refunded ones: the customer's money came in, and a
        -- refund is recorded separately below rather than by unwinding this.
        SUM(CASE WHEN type = 'charge'
                  AND status IN ('successful', 'partially_refunded', 'refunded', 'charged_back')
                 THEN amount ELSE 0 END) AS amount_paid,
        -- What the customer is liable for, settled or not.
        SUM(CASE WHEN type = 'charge' THEN amount ELSE 0 END) AS amount_charged,
        SUM(CASE WHEN type IN ('refund', 'chargeback') AND status = 'successful' THEN amount ELSE 0 END) AS amount_refunded,
        SUM(CASE WHEN type = 'chargeback' AND status = 'successful' THEN amount ELSE 0 END) AS amount_charged_back,
        -- A refund in flight reserves part of the balance, so two concurrent
        -- refunds cannot both take the same money.
        SUM(CASE WHEN type = 'refund' AND status IN ('initiated', 'pending') THEN amount ELSE 0 END) AS refund_pending,
        COUNT(*) FILTER (WHERE type = 'charge') AS charge_count,
        COUNT(*) FILTER (WHERE type = 'refund') AS refund_count,
        MAX(CASE WHEN type = 'charge'
                  AND status IN ('successful', 'partially_refunded', 'refunded', 'charged_back')
                 THEN created_at END) AS paid_at,
        MIN(CASE WHEN type = 'charge' THEN created_at END) AS first_charged_at
    FROM public.payments
    GROUP BY order_id
)
SELECT
    o.id AS order_id,
    o.status,
    o.city,
    o.total_amount,
    o.subtotal,
    o.discount_total,
    o.shipping_fee,
    o.payment_method,
    o.created_at,
    COALESCE(pt.amount_paid, 0)::NUMERIC AS amount_paid,
    COALESCE(pt.amount_charged, 0)::NUMERIC AS amount_charged,
    COALESCE(pt.amount_refunded, 0)::NUMERIC AS amount_refunded,
    COALESCE(pt.amount_charged_back, 0)::NUMERIC AS amount_charged_back,
    COALESCE(pt.refund_pending, 0)::NUMERIC AS refund_pending,
    -- What can still be given back. Never negative: an over-refund is a data
    -- fault, and clamping here stops it from becoming a negative balance that a
    -- second refund could "use".
    GREATEST(COALESCE(pt.amount_paid, 0) - COALESCE(pt.amount_refunded, 0)
             - COALESCE(pt.amount_charged_back, 0), 0)::NUMERIC AS refundable_balance,
    -- Including money already committed to a pending refund, so the balance the
    -- UI quotes is the one a simultaneous request would be checked against.
    GREATEST(COALESCE(pt.amount_paid, 0) - COALESCE(pt.amount_refunded, 0)
             - COALESCE(pt.amount_charged_back, 0)
             - COALESCE(pt.refund_pending, 0), 0)::NUMERIC AS refundable_now,
    -- The customer's true position: paid minus given back. This goes to zero
    -- when everything has been refunded, and negative only when too much has.
    (COALESCE(pt.amount_paid, 0) - COALESCE(pt.amount_refunded, 0)
     - COALESCE(pt.amount_charged_back, 0))::NUMERIC AS net_position,
    -- Still owed by the customer (a partial payment, or an unpaid charge).
    GREATEST(o.total_amount - COALESCE(pt.amount_paid, 0), 0)::NUMERIC AS outstanding_balance,
    -- True when the refunds exceed what was collected. This is a fault, not a
    -- state, and it is surfaced so a report can find it rather than hiding it.
    (COALESCE(pt.amount_refunded, 0) + COALESCE(pt.amount_charged_back, 0))
        > COALESCE(pt.amount_paid, 0) AS is_over_refunded,
    COALESCE(pt.charge_count, 0) AS charge_count,
    COALESCE(pt.refund_count, 0) AS refund_count,
    pt.paid_at,
    pt.first_charged_at
FROM public.orders o
LEFT JOIN payment_totals pt ON pt.order_id = o.id;

COMMENT ON VIEW public.order_financials IS
    'Per-order money summary derived from payments. amount_paid counts any charge that has settled, including one later marked refunded, so a full refund leaves net_position at zero rather than negative.';
COMMENT ON COLUMN public.order_financials.amount_paid IS
    'Charges that actually settled: successful, partially_refunded, refunded or charged_back. An initiated charge that never completed is not money held.';
