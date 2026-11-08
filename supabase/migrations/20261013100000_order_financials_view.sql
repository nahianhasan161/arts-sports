-- Migration: order_financials view, and the payment status the refund model
-- needs.
--
-- The storefront could answer "what was this order charged?" but not "what did
-- the customer actually pay, how much has been refunded, and how much is still
-- refundable?" Those three numbers were the missing half of the money model,
-- and their absence is what allowed three separate code paths to write refunds
-- with no shared limit.
--
-- calculateNetPayment() in src/lib/payments/state-machine.ts has existed since
-- the payments table was split out and has never been called by anything. This
-- view supersedes it in SQL, where the number cannot drift from the rows it is
-- derived from: a derived total stored on orders would be a fourth writer with
-- no way to notice it was wrong.
--
-- The view reads payments only. It deliberately does not read
-- orders.total_amount, which is the amount CHARGED, not the amount PAID -- for
-- a cash-on-delivery order the two are wildly different, and refunding against
-- the charged figure would let the store refund money it never collected.

CREATE OR REPLACE VIEW public.order_financials AS
WITH payment_totals AS (
    SELECT
        order_id,
        -- Money in. Only a charge the customer actually completed counts:
        -- an 'initiated' bKash charge that never settled is not money held.
        SUM(CASE WHEN type = 'charge' AND status = 'successful' THEN amount ELSE 0 END) AS amount_paid,
        -- What the customer is liable for, whether or not it has settled.
        SUM(CASE WHEN type = 'charge' THEN amount ELSE 0 END) AS amount_charged,
        SUM(CASE WHEN type IN ('refund', 'chargeback') AND status = 'successful' THEN amount ELSE 0 END) AS amount_refunded,
        SUM(CASE WHEN type = 'chargeback' AND status = 'successful' THEN amount ELSE 0 END) AS amount_charged_back,
        -- A refund in flight reserves part of the balance, so two concurrent
        -- refunds cannot both take the same money.
        SUM(CASE WHEN type = 'refund' AND status IN ('initiated', 'pending') THEN amount ELSE 0 END) AS refund_pending,
        COUNT(*) FILTER (WHERE type = 'charge') AS charge_count,
        COUNT(*) FILTER (WHERE type = 'refund') AS refund_count,
        MAX(CASE WHEN type = 'charge' AND status = 'successful' THEN created_at END) AS paid_at,
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
    -- fault, and clamping here stops it from becoming a negative balance that
    -- a second refund could "use".
    GREATEST(COALESCE(pt.amount_paid, 0) - COALESCE(pt.amount_refunded, 0)
             - COALESCE(pt.amount_charged_back, 0), 0)::NUMERIC AS refundable_balance,
    -- Including money already committed to a pending refund, so the balance
    -- the UI quotes is the one a simultaneous request would be checked
    -- against, not a larger figure that would then fail.
    GREATEST(COALESCE(pt.amount_paid, 0) - COALESCE(pt.amount_refunded, 0)
             - COALESCE(pt.amount_charged_back, 0)
             - COALESCE(pt.refund_pending, 0), 0)::NUMERIC AS refundable_now,
    -- The customer's true position: paid minus given back.
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
    'Per-order money summary derived from payments. amount_paid counts only successful charges, so refundable_balance is money actually collected. Supersedes the unused calculateNetPayment() helper in application code.';

COMMENT ON COLUMN public.order_financials.refundable_balance IS
    'amount_paid minus refunds and chargebacks. Clamped at zero; an over-refund is reported through is_over_refunded instead.';
COMMENT ON COLUMN public.order_financials.refundable_now IS
    'refundable_balance less refunds already in flight, so two concurrent refunds cannot both reserve the same money.';
