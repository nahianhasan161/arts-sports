-- Notification log and Bangla content columns (Phase 0).
--
-- notifications: every message the store sends or prepares, on any channel.
-- Email and SMS are sent by a provider; WhatsApp is a prepared wa.me link a
-- staff member opens and sends from the WhatsApp Business app (free), so
-- those rows wait with status 'manual' until someone marks them sent.
--
-- *_bn columns: Bangla title/description next to the English ones, so the
-- language switch can be added later without changing the catalogue.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
    template TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'bn' CHECK (locale IN ('bn', 'en')),
    recipient TEXT NOT NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    subject TEXT,
    body TEXT NOT NULL,
    -- WhatsApp: the click-to-chat link staff open to send it.
    action_url TEXT,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'manual')),
    provider TEXT,
    provider_message_id TEXT,
    error TEXT,
    sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_order_idx ON public.notifications (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_manual_idx ON public.notifications (created_at DESC) WHERE status = 'manual';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order staff read notifications" ON public.notifications;
CREATE POLICY "Order staff read notifications" ON public.notifications
    FOR SELECT USING (public.has_permission('orders.view'));

-- Staff mark a prepared WhatsApp message as sent.
DROP POLICY IF EXISTS "Order staff update notifications" ON public.notifications;
CREATE POLICY "Order staff update notifications" ON public.notifications
    FOR UPDATE USING (public.has_permission('orders.manage'))
    WITH CHECK (public.has_permission('orders.manage'));

-- Bangla content
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS title_bn TEXT,
    ADD COLUMN IF NOT EXISTS short_description_bn TEXT,
    ADD COLUMN IF NOT EXISTS description_bn TEXT;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS name_bn TEXT,
    ADD COLUMN IF NOT EXISTS description_bn TEXT;

-- The customer's preferred language for messages.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'bn'
        CHECK (preferred_locale IN ('bn', 'en'));
