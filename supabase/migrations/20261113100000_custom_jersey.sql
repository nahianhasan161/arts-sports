-- Phase 3: custom jersey orders.
--
--   custom_fabrics            fabrics a customer picks from, with a per-piece price
--   jersey_templates          catalogue designs for "pick a design" (path B)
--   custom_orders             one request, from submission to delivery
--   custom_order_roster       player name, number, size and sleeve per piece
--   custom_order_mockups      the designer's print-ready mockups, one row per version
--   custom_order_messages     comments between the customer and staff
--   custom_order_events       status history (who moved it, when, why)
--   custom_order_payments     the 30% advance and the balance, online or in the shop
--   custom_gallery            finished-jersey photos shown on the site
--   app_settings.custom_jersey_pricing   quantity tiers, extras and rush charge (JSON)
--
-- A custom order is deliberately separate from `orders`: it has no products,
-- no stock, and its price is not final until a designer has looked at it.
-- Its payments are kept apart for the same reason, so the refund and
-- financial views over `payments` are not affected.
--
-- Access: every read and write goes through API routes that use the service
-- role after checking either the custom_orders.manage permission (staff) or
-- the order's access_token (the customer's private link). Row level security
-- is on for every table; the policies below only open what is public anyway
-- (active fabrics, templates, the published gallery) and staff reads.
--
-- source = 'ai' is reserved so AI-made designs can be added later without a
-- schema change.
--
-- Safe to re-run.

-- ----------------------------------------------------------------------
-- Fabrics
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_fabrics (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
    name_en TEXT NOT NULL,
    name_bn TEXT,
    description_en TEXT,
    description_bn TEXT,
    image_url TEXT,
    price_per_piece NUMERIC(10, 2) NOT NULL CHECK (price_per_piece >= 0),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Starting prices are placeholders: set the real ones in Admin > Custom jersey setup.
INSERT INTO public.custom_fabrics (slug, name_en, name_bn, description_en, description_bn, price_per_piece, display_order) VALUES
    ('mesh',      'Mesh',               'মেশ',                'Light and airy. The usual choice for football and practice kits.', 'হালকা আর বাতাস চলাচল করে। Football আর practice kit-এ সবচেয়ে বেশি চলে।', 450, 10),
    ('interlock', 'Interlock / PP',     'ইন্টারলক / পিপি',     'Smooth and a little thicker. Prints look sharp.',                    'মসৃণ আর একটু মোটা। Print পরিষ্কার আসে।',                              520, 20),
    ('polo-pique','Polo pique',         'পোলো পিকে',          'Textured knit with a collar feel. Good for cricket and team polos.', 'বুনটওয়ালা কাপড়। Cricket আর team polo-র জন্য ভালো।',                 600, 30),
    ('jacquard',  'Jacquard / premium', 'জ্যাকার্ড / প্রিমিয়াম', 'Woven-in pattern, match-kit feel.',                                'বুনটে নকশা, match kit-এর মতো অনুভূতি।',                              750, 40)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------
-- Design templates (path B)
-- ----------------------------------------------------------------------
-- `pattern` is one of the shapes the site can draw itself (see JerseyPreview).
-- `layers` is reserved for the image-layer format in docs/3d-store-and-app.md
-- (base / mask / shade PNGs); when it is filled the preview will use it.
CREATE TABLE IF NOT EXISTS public.jersey_templates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
    sport TEXT NOT NULL CHECK (sport IN ('football', 'cricket', 'badminton', 'running', 'other')),
    name_en TEXT NOT NULL,
    name_bn TEXT,
    pattern TEXT NOT NULL DEFAULT 'plain'
        CHECK (pattern IN ('plain', 'stripes', 'hoops', 'sash', 'halves', 'chevron', 'side-panels', 'sleeves')),
    default_colors JSONB NOT NULL DEFAULT '["#0b3d91", "#ffffff", "#c89b3c"]'::jsonb,
    layers JSONB,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.jersey_templates (slug, sport, name_en, name_bn, pattern, default_colors, display_order) VALUES
    ('football-classic',  'football',  'Classic',        'ক্লাসিক',        'plain',       '["#0b3d91", "#ffffff", "#c89b3c"]', 10),
    ('football-stripes',  'football',  'Stripes',        'স্ট্রাইপ',        'stripes',     '["#b91c1c", "#111827", "#ffffff"]', 20),
    ('football-hoops',    'football',  'Hoops',          'হুপ',            'hoops',       '["#15803d", "#ffffff", "#111827"]', 30),
    ('football-sash',     'football',  'Sash',           'স্যাশ',          'sash',        '["#ffffff", "#b91c1c", "#111827"]', 40),
    ('football-halves',   'football',  'Halves',         'দুই ভাগ',        'halves',      '["#1d4ed8", "#b91c1c", "#facc15"]', 50),
    ('cricket-panels',    'cricket',   'Side panels',    'সাইড প্যানেল',    'side-panels', '["#15803d", "#b91c1c", "#facc15"]', 10),
    ('cricket-chevron',   'cricket',   'Chevron',        'শেভরন',          'chevron',     '["#1e3a8a", "#f97316", "#ffffff"]', 20),
    ('cricket-sleeves',   'cricket',   'Contrast sleeves','আলাদা হাতা',     'sleeves',     '["#111827", "#facc15", "#ffffff"]', 30),
    ('badminton-chevron', 'badminton', 'Chevron',        'শেভরন',          'chevron',     '["#ffffff", "#0ea5e9", "#111827"]', 10),
    ('badminton-panels',  'badminton', 'Side panels',    'সাইড প্যানেল',    'side-panels', '["#111827", "#22c55e", "#ffffff"]', 20),
    ('running-sash',      'running',   'Sash',           'স্যাশ',          'sash',        '["#f97316", "#111827", "#ffffff"]', 10),
    ('running-plain',     'running',   'Plain',          'একরঙা',          'plain',       '["#111827", "#f97316", "#ffffff"]', 20)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------
-- Pricing table (admin editable)
-- ----------------------------------------------------------------------
-- tiers: discount on the fabric price from that quantity upwards.
-- extras: taka per piece. rush: +percent when needed sooner than normal_days;
-- nothing is promised sooner than min_days.
INSERT INTO public.app_settings (key, value) VALUES (
    'custom_jersey_pricing',
    '{"tiers":[{"min":1,"discount_percent":0},{"min":5,"discount_percent":5},{"min":11,"discount_percent":10},{"min":21,"discount_percent":15},{"min":51,"discount_percent":20}],"extras":{"name":30,"number":30,"logo":40,"full_sleeve":60,"shorts":250,"polo_collar":50},"rush":{"normal_days":7,"min_days":3,"percent":20},"advance_percent":30,"free_revisions":2}'
) ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.custom_order_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.custom_orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_number TEXT NOT NULL UNIQUE DEFAULT ('CJ-' || nextval('public.custom_order_number_seq')::text),
    -- The customer's private link is /custom-jersey/order/<access_token>.
    access_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),

    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL CHECK (char_length(customer_name) BETWEEN 2 AND 120),
    customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^01[3-9][0-9]{8}$'),
    customer_email TEXT,
    locale TEXT NOT NULL DEFAULT 'bn' CHECK (locale IN ('bn', 'en')),
    channel TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online', 'shop', 'admin')),

    -- upload: the customer's own design. template: one of ours. ai: later.
    source TEXT NOT NULL CHECK (source IN ('upload', 'template', 'ai')),
    sport TEXT NOT NULL CHECK (sport IN ('football', 'cricket', 'badminton', 'running', 'other')),
    template_id TEXT REFERENCES public.jersey_templates(id) ON DELETE SET NULL,
    -- template path: { pattern, colors[], team_name, name, number, logo_path, preview_path }
    design JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- [{ path, name, mime, size, kind: 'design' | 'reference' }]
    files JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 4000),

    fabric_id TEXT REFERENCES public.custom_fabrics(id) ON DELETE SET NULL,
    fabric_name TEXT,
    sleeve TEXT NOT NULL DEFAULT 'short' CHECK (sleeve IN ('short', 'full')),
    collar TEXT NOT NULL DEFAULT 'round' CHECK (collar IN ('round', 'v', 'polo')),
    with_shorts BOOLEAN NOT NULL DEFAULT false,
    with_names BOOLEAN NOT NULL DEFAULT false,
    with_numbers BOOLEAN NOT NULL DEFAULT false,
    with_logo BOOLEAN NOT NULL DEFAULT false,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 2000),
    needed_by DATE,
    is_rush BOOLEAN NOT NULL DEFAULT false,

    delivery_method TEXT NOT NULL DEFAULT 'delivery' CHECK (delivery_method IN ('delivery', 'pickup')),
    delivery_zone TEXT CHECK (delivery_zone IS NULL OR delivery_zone IN ('dhaka', 'outside')),
    delivery_address TEXT,
    delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0,

    -- What the site showed ("estimated"), and how it was worked out.
    estimated_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    estimate_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Set by staff with the mockup. Excludes the delivery charge.
    final_price NUMERIC(12, 2) CHECK (final_price IS NULL OR final_price >= 0),
    advance_amount NUMERIC(12, 2),

    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'in_review', 'changes_needed', 'mockup_sent', 'revision_requested',
        'approved', 'queued', 'cutting', 'printing', 'sewing', 'qc', 'ready', 'delivered',
        'rejected', 'cancelled'
    )),
    status_reason TEXT,
    revision_count INTEGER NOT NULL DEFAULT 0,
    approved_at TIMESTAMPTZ,
    -- The customer ticked "no cancellation or refund after I confirm".
    terms_accepted_at TIMESTAMPTZ,
    gallery_consent BOOLEAN NOT NULL DEFAULT false,

    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    due_date DATE,
    staff_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS custom_orders_status_idx ON public.custom_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS custom_orders_phone_idx ON public.custom_orders (customer_phone);
CREATE INDEX IF NOT EXISTS custom_orders_user_idx ON public.custom_orders (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.custom_order_roster (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    custom_order_id TEXT NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    player_name TEXT CHECK (player_name IS NULL OR char_length(player_name) <= 40),
    player_number TEXT CHECK (player_number IS NULL OR char_length(player_number) <= 4),
    size TEXT NOT NULL CHECK (char_length(size) BETWEEN 1 AND 12),
    sleeve TEXT NOT NULL DEFAULT 'short' CHECK (sleeve IN ('short', 'full'))
);
CREATE INDEX IF NOT EXISTS custom_order_roster_order_idx ON public.custom_order_roster (custom_order_id, position);

CREATE TABLE IF NOT EXISTS public.custom_order_mockups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    custom_order_id TEXT NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    images TEXT[] NOT NULL CHECK (cardinality(images) BETWEEN 1 AND 8),
    note TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (custom_order_id, version)
);

CREATE TABLE IF NOT EXISTS public.custom_order_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    custom_order_id TEXT NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
    author TEXT NOT NULL CHECK (author IN ('customer', 'staff')),
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_order_messages_order_idx ON public.custom_order_messages (custom_order_id, created_at);

CREATE TABLE IF NOT EXISTS public.custom_order_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    custom_order_id TEXT NOT NULL REFERENCES public.custom_orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL CHECK (actor IN ('customer', 'staff', 'system')),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_order_events_order_idx ON public.custom_order_events (custom_order_id, created_at);

CREATE TABLE IF NOT EXISTS public.custom_order_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    custom_order_id TEXT NOT NULL REFERENCES public.custom_orders(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('advance', 'balance', 'other')),
    method TEXT NOT NULL CHECK (method IN ('univapayment', 'cash', 'card', 'bkash', 'nagad', 'bank', 'cod')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'successful', 'failed', 'cancelled')),
    gateway TEXT,
    gateway_payment_id TEXT,
    gateway_status TEXT,
    checkout_url TEXT,
    trx_id TEXT,
    note TEXT,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS custom_order_payments_order_idx ON public.custom_order_payments (custom_order_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS custom_order_payments_gateway_uidx
    ON public.custom_order_payments (gateway, gateway_payment_id)
    WHERE gateway_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.custom_gallery (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    -- Set when the photo is of a customer's order; that order must have gallery_consent.
    custom_order_id TEXT REFERENCES public.custom_orders(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    caption TEXT,
    sport TEXT,
    is_published BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_gallery_published_idx ON public.custom_gallery (is_published, display_order, created_at DESC);

-- Messages about a custom order are logged next to order messages.
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS custom_order_id TEXT REFERENCES public.custom_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS notifications_custom_order_idx
    ON public.notifications (custom_order_id, created_at DESC) WHERE custom_order_id IS NOT NULL;

-- updated_at triggers
DROP TRIGGER IF EXISTS custom_fabrics_set_updated_at ON public.custom_fabrics;
CREATE TRIGGER custom_fabrics_set_updated_at BEFORE UPDATE ON public.custom_fabrics
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS jersey_templates_set_updated_at ON public.jersey_templates;
CREATE TRIGGER jersey_templates_set_updated_at BEFORE UPDATE ON public.jersey_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS custom_orders_set_updated_at ON public.custom_orders;
CREATE TRIGGER custom_orders_set_updated_at BEFORE UPDATE ON public.custom_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------
-- Money: paid so far, and the automatic step into production
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_order_paid(p_order_id TEXT)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(SUM(amount), 0)
    FROM public.custom_order_payments
    WHERE custom_order_id = p_order_id AND status = 'successful';
$$;
REVOKE EXECUTE ON FUNCTION public.custom_order_paid(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_order_paid(TEXT) TO service_role;

-- Marks a payment successful (once) and, when the advance is now covered,
-- moves an approved order into the production queue. Returns what happened so
-- the caller can send the right message. Service role only.
CREATE OR REPLACE FUNCTION public.custom_order_settle_payment(
    p_payment_id TEXT,
    p_status TEXT,
    p_gateway_status TEXT DEFAULT NULL,
    p_trx_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment public.custom_order_payments%ROWTYPE;
    v_order public.custom_orders%ROWTYPE;
    v_new_status TEXT;
    v_became_successful BOOLEAN := false;
    v_entered_production BOOLEAN := false;
    v_paid NUMERIC;
BEGIN
    IF p_status NOT IN ('initiated', 'successful', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'bad_payment_status';
    END IF;

    SELECT * INTO v_payment FROM public.custom_order_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'custom_payment_not_found'; END IF;

    -- A settled row never moves again (webhooks can arrive late or twice).
    v_new_status := CASE WHEN v_payment.status = 'initiated' THEN p_status ELSE v_payment.status END;
    v_became_successful := v_payment.status = 'initiated' AND v_new_status = 'successful';

    UPDATE public.custom_order_payments
    SET status = v_new_status,
        gateway_status = COALESCE(p_gateway_status, gateway_status),
        trx_id = COALESCE(NULLIF(p_trx_id, ''), trx_id),
        paid_at = CASE WHEN v_became_successful THEN now() ELSE paid_at END
    WHERE id = v_payment.id;

    SELECT * INTO v_order FROM public.custom_orders WHERE id = v_payment.custom_order_id FOR UPDATE;
    v_paid := public.custom_order_paid(v_order.id);

    IF v_became_successful AND v_order.status = 'approved'
       AND v_paid >= COALESCE(v_order.advance_amount, 0) THEN
        UPDATE public.custom_orders
        SET status = 'queued',
            due_date = COALESCE(due_date, GREATEST(COALESCE(needed_by, current_date + 7), current_date + 1))
        WHERE id = v_order.id;
        INSERT INTO public.custom_order_events (custom_order_id, from_status, to_status, actor, note)
        VALUES (v_order.id, 'approved', 'queued', 'system', 'Advance received');
        v_entered_production := true;
    END IF;

    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'custom_order_id', v_order.id,
        'status', v_new_status,
        'amount', v_payment.amount,
        'paid_total', v_paid,
        'became_successful', v_became_successful,
        'entered_production', v_entered_production
    );
END;
$$;
REVOKE ALL ON FUNCTION public.custom_order_settle_payment(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_order_settle_payment(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------
ALTER TABLE public.custom_fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jersey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_order_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_order_mockups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads active fabrics" ON public.custom_fabrics;
CREATE POLICY "Anyone reads active fabrics" ON public.custom_fabrics
    FOR SELECT USING (is_active OR public.has_permission('custom_orders.manage'));

DROP POLICY IF EXISTS "Anyone reads active templates" ON public.jersey_templates;
CREATE POLICY "Anyone reads active templates" ON public.jersey_templates
    FOR SELECT USING (is_active OR public.has_permission('custom_orders.manage'));

DROP POLICY IF EXISTS "Anyone reads the published gallery" ON public.custom_gallery;
CREATE POLICY "Anyone reads the published gallery" ON public.custom_gallery
    FOR SELECT USING (is_published OR public.has_permission('custom_orders.manage'));

-- Staff may read order data directly; customers go through the API with
-- their access token, so there is no customer policy here on purpose.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'custom_orders', 'custom_order_roster', 'custom_order_mockups',
        'custom_order_messages', 'custom_order_events', 'custom_order_payments'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Custom order staff read" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "Custom order staff read" ON public.%I FOR SELECT USING (public.has_permission(''custom_orders.manage''))',
            t
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- Audit log: prices, payments and order changes by staff
-- ----------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    IF to_regproc('public.audit_row_change') IS NULL THEN
        RETURN;
    END IF;
    FOREACH t IN ARRAY ARRAY['custom_fabrics', 'custom_order_payments']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
        EXECUTE format(
            'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
             FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',
            t
        );
    END LOOP;
    -- Orders: changes only. An insert would copy the whole row, including the
    -- customer's access_token, into the audit log.
    DROP TRIGGER IF EXISTS audit_custom_orders ON public.custom_orders;
    CREATE TRIGGER audit_custom_orders AFTER UPDATE ON public.custom_orders
        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
END $$;
