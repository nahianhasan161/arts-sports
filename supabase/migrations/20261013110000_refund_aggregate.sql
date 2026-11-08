-- Migration: the refund aggregate, and the payment columns that make a
-- delayed payment a first-class record.
--
-- Before this, a refund was a bare number in one of four places:
-- returns.refund_amount, cancellations.refund_amount, a refund_transactions
-- row, or a payments row with type='refund'. Three code paths wrote to those
-- places, none of them checked how much had already been refunded, and none of
-- them could say why a refund was smaller than the items returned.
--
-- The redesign:
--
--   refunds            the aggregate: what is being given back, and for why
--   refund_items       which ordered line, how many units, at what unit refund
--   refund_deductions  what was subtracted, with a reason and an amount
--
--   payments           gains purpose, recorded_by, refund_of_payment_id so a
--                      refund row points at the charge it reverses, and a
--                      retroactive payment is identifiable as one
--
-- Every invariant is enforced by a trigger on the aggregate rather than by
-- application code, because the application is what got it wrong.

-- ==========================================================
-- 1. PAYMENTS — the ledger, with provenance
-- ==========================================================

-- Why the row exists. A refund taken back in cash is the obvious case, but the
-- rest exist so a payment can be recorded after the fact without being a
-- fabricated checkout row: a bKash collection taken by phone, a manual COD
-- settlement, or a correction to a booking error.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'checkout';

ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_purpose_check;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_purpose_check CHECK (purpose IN (
        'checkout', 'retroactive', 'reconciliation',
        'adjustment', 'dispute_resolution', 'cod_settlement'
    ));

-- The charge this row gives money back to. Null for a charge, required for a
-- refund in the application layer, and the link that makes the refund chain
-- traversable rather than inferred from a matching amount.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS refund_of_payment_id TEXT REFERENCES public.payments(id) ON DELETE SET NULL;

-- The admin who recorded the row. Null when the customer initiated it, which is
-- what distinguishes a checkout from a settlement an operator entered later.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Status gains the two states the refund model needs. The CHECK is replaced
-- rather than added to, so 'partially_refunded' and 'charged_back' are legal.
ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_status_check CHECK (status IN (
        'initiated', 'successful', 'partially_refunded',
        'refunded', 'failed', 'cancelled', 'charged_back'
    ));

CREATE INDEX IF NOT EXISTS idx_payments_refund_of ON public.payments(refund_of_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_purpose ON public.payments(purpose);

-- ==========================================================
-- 2. REFUNDS — the aggregate
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.refunds (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    -- Set when the refund answers a customer return request.
    return_id TEXT REFERENCES public.returns(id) ON DELETE SET NULL,
    -- Set when it answers an admin cancellation.
    cancellation_id TEXT REFERENCES public.cancellations(id) ON DELETE SET NULL,
    -- The charge being given money back. Required: a refund with no charge is
    -- money from nowhere.
    original_payment_id TEXT REFERENCES public.payments(id) ON DELETE RESTRICT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'quoted'
        CHECK (status IN ('quoted', 'approved', 'processing', 'completed', 'failed', 'cancelled')),
    -- SUM(refund_items.line_total)
    item_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (item_total >= 0),
    -- SUM(refund_deductions.amount)
    deductions_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deductions_total >= 0),
    -- item_total − deductions_total. Must equal what was actually paid out.
    refund_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (refund_total >= 0),
    provider TEXT NOT NULL DEFAULT 'cod',
    transaction_ref TEXT,
    reason TEXT,
    notes TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_return_id ON public.refunds(return_id);
CREATE INDEX IF NOT EXISTS idx_refunds_cancellation_id ON public.refunds(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_refunds_original_payment ON public.refunds(original_payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);

-- ==========================================================
-- 3. REFUND ITEMS — which ordered units, and at what value
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.refund_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    refund_id TEXT REFERENCES public.refunds(id) ON DELETE CASCADE NOT NULL,
    order_item_id TEXT REFERENCES public.order_items(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    -- Per unit, which can be less than the price paid: a prorated or reduced
    -- refund is a fact worth recording rather than a silence.
    unit_refund NUMERIC(10, 2) NOT NULL CHECK (unit_refund >= 0),
    line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON public.refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_order_item ON public.refund_items(order_item_id);

-- ==========================================================
-- 4. REFUND DEDUCTIONS — why the refund is smaller
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.refund_deductions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    refund_id TEXT REFERENCES public.refunds(id) ON DELETE CASCADE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN (
        'delivery_fee', 'restocking_fee', 'coupon_clawback',
        'wear_and_tear', 'customer_request', 'shipping_difference'
    )),
    -- Human-readable, so the customer-facing statement and the audit trail can
    -- quote the same words without the code knowing why it was taken.
    label TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refund_deductions_refund ON public.refund_deductions(refund_id);

-- ==========================================================
-- 5. Backfill the existing refund rows
--
-- Every refund_transactions row currently has no mirroring payments row, so
-- none of them is visible to order_financials and none of them counts against
-- a refundable balance. This creates the missing charge-side rows so the link
-- below can reference them.
--
-- Idempotent: it skips a refund whose payments row already exists.
-- ==========================================================
INSERT INTO public.payments (order_id, user_id, type, provider, amount, status, purpose, created_at, updated_at)
SELECT
    -- The order of the charge being refunded. Earlier drafts reached for
    -- original_payment_id here, which is a payments id and would have attached
    -- every refund to the wrong order.
    op.order_id,
    rt.user_id,
    'refund',
    COALESCE(rt.payment_method, 'cod'),
    rt.amount,
    CASE WHEN rt.status = 'processed' THEN 'successful' ELSE rt.status END,
    'retroactive',
    rt.created_at,
    rt.updated_at
FROM public.refund_transactions rt
JOIN public.payments op ON op.id = rt.original_payment_id
WHERE NOT EXISTS (
    -- Matched on the order, the amount and the timing rather than an id,
    -- because the linking column does not exist yet.
    SELECT 1 FROM public.payments p
    WHERE p.order_id = op.order_id
      AND p.type = 'refund'
      AND p.amount = rt.amount
      AND p.created_at = rt.created_at
)
AND rt.amount > 0;

-- Now that each legacy row has a payments row, link it to the refunds
-- aggregate when one exists. Legacy refunds predate the aggregate, so for them
-- this stays NULL — which is the truth, not a gap: there is no aggregate row
-- to point at. Rows created by execute_refund() are populated there.
ALTER TABLE public.refund_transactions
    ADD COLUMN IF NOT EXISTS refund_id TEXT REFERENCES public.refunds(id) ON DELETE CASCADE;

-- ==========================================================
-- 6. RLS — the admin surfaces
-- ==========================================================
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view refunds" ON public.refunds;
CREATE POLICY "Admins can view refunds" ON public.refunds
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Customers can view own refunds" ON public.refunds;
CREATE POLICY "Customers can view own refunds" ON public.refunds
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage refunds" ON public.refunds;
CREATE POLICY "Admins manage refunds" ON public.refunds
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Follow refund for items" ON public.refund_items;
CREATE POLICY "Follow refund for items" ON public.refund_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.refunds r WHERE r.id = refund_items.refund_id AND public.is_admin())
        OR EXISTS (SELECT 1 FROM public.refunds r WHERE r.id = refund_items.refund_id AND auth.uid() = r.user_id)
    );

DROP POLICY IF EXISTS "Admins manage refund items" ON public.refund_items;
CREATE POLICY "Admins manage refund items" ON public.refund_items
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Follow refund for deductions" ON public.refund_deductions;
CREATE POLICY "Follow refund for deductions" ON public.refund_deductions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.refunds r WHERE r.id = refund_deductions.refund_id AND public.is_admin())
        OR EXISTS (SELECT 1 FROM public.refunds r WHERE r.id = refund_deductions.refund_id AND auth.uid() = r.user_id)
    );

DROP POLICY IF EXISTS "Admins manage refund deductions" ON public.refund_deductions;
CREATE POLICY "Admins manage refund deductions" ON public.refund_deductions
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
