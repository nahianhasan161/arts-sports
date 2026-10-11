-- Migration: Returns & Payments Cancellation Workflow
-- Date: 2026-10-09
-- Description:
--   Adds cancellations table, payment_methods catalog, refund_transactions ledger.
--   Adds cancellation columns to payments, returns, and orders tables.

-- ==========================================================
-- 1. PAYMENT METHODS — Catalog of supported payment providers
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('offline', 'online', 'wallet')),
    is_active BOOLEAN DEFAULT true,
    requires_confirmation BOOLEAN DEFAULT false,
    icon_url TEXT,
    instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_code ON public.payment_methods(code);
CREATE INDEX IF NOT EXISTS idx_payment_methods_category ON public.payment_methods(category);

-- Seed data
INSERT INTO public.payment_methods (code, display_name, category, requires_confirmation, instructions)
VALUES
  ('cod', 'Cash on Delivery', 'offline', true, 'Pay cash to the delivery agent when your package arrives.'),
  ('bkash', 'bKash', 'wallet', false, 'Pay instantly via your bKash wallet. You will receive a confirmation SMS.'),
  ('nagad', 'Nagad', 'wallet', false, 'Pay securely using your Nagad wallet balance.'),
  ('bank_transfer', 'Bank Transfer', 'offline', true, 'Transfer to our bank account and upload the transaction ID.'),
  ('stripe', 'Stripe', 'online', false, 'Pay securely with credit/debit card via Stripe.'),
  ('paypal', 'PayPal', 'online', false, 'Pay with your PayPal account.')
ON CONFLICT (code) DO NOTHING;

-- ==========================================================
-- 2. CANCELLATIONS — Cancellation requests for orders/payments/returns
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.cancellations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('order', 'payment', 'return')),
    reason TEXT NOT NULL,
    reason_category TEXT NOT NULL CHECK (reason_category IN (
        'changed_mind', 'wrong_item', 'damaged_item',
        'not_as_described', 'delivery_delay', 'duplicate',
        'billing_error', 'other'
    )),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
    refund_amount NUMERIC(10, 2) DEFAULT 0,
    refund_payment_id TEXT REFERENCES public.payments(id) ON DELETE SET NULL,
    notes TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cancellations_order_id ON public.cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_user_id ON public.cancellations(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_status ON public.cancellations(status);
CREATE INDEX IF NOT EXISTS idx_cancellations_type ON public.cancellations(type);

-- ==========================================================
-- 3. REFUND TRANSACTIONS — Ledger for refunds
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.refund_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    original_payment_id TEXT REFERENCES public.payments(id) ON DELETE SET NULL NOT NULL,
    cancellation_id TEXT REFERENCES public.cancellations(id) ON DELETE SET NULL,
    return_id TEXT REFERENCES public.returns(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processed', 'failed', 'cancelled')),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES auth.users(id),
    transaction_ref TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refund_transactions_original_payment ON public.refund_transactions(original_payment_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_cancellation ON public.refund_transactions(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_return ON public.refund_transactions(return_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_status ON public.refund_transactions(status);

-- ==========================================================
-- 4. Add cancellation columns to existing tables
-- ==========================================================

-- Payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancellation_id TEXT REFERENCES public.cancellations(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method_id TEXT REFERENCES public.payment_methods(id);

-- Returns
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS cancellation_id TEXT REFERENCES public.cancellations(id) ON DELETE SET NULL;

-- Orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_id TEXT REFERENCES public.cancellations(id) ON DELETE SET NULL;

-- ==========================================================
-- 5. Updated trigger for cancellations table
-- ==========================================================
DROP TRIGGER IF EXISTS trg_cancellations_updated_at ON public.cancellations;
CREATE TRIGGER trg_cancellations_updated_at
    BEFORE UPDATE ON public.cancellations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_refund_transactions_updated_at ON public.refund_transactions;
CREATE TRIGGER trg_refund_transactions_updated_at
    BEFORE UPDATE ON public.refund_transactions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================
-- 6. RLS Policies
-- ==========================================================

-- Cancellations
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create cancellations" ON public.cancellations FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own cancellations" ON public.cancellations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all cancellations" ON public.cancellations FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update cancellations" ON public.cancellations FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete cancellations" ON public.cancellations FOR DELETE USING (public.is_admin());

-- Payment Methods
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view payment methods" ON public.payment_methods FOR SELECT USING (true);
CREATE POLICY "Admins can manage payment methods" ON public.payment_methods FOR ALL USING (public.is_admin());

-- Refund Transactions
ALTER TABLE public.refund_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own refunds" ON public.refund_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage refunds" ON public.refund_transactions FOR ALL USING (public.is_admin());
