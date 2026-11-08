-- Customers identified by phone number (Phase 0).
--
-- One customer = one Bangladeshi mobile number, stored as 01XXXXXXXXX.
-- Guest orders, Google sign-ins and (later) shop sales all land on the same
-- customer row. A signed-in account is linked to the customer the first time
-- it places an order with that number.
--
-- Every new order gets customer_id from a BEFORE INSERT trigger, so the
-- order RPC did not need to change.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.normalize_bd_phone(p_raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    -- Bangla digits to ASCII, then keep digits only.
    v := translate(p_raw, '০১২৩৪৫৬৭৮৯', '0123456789');
    v := regexp_replace(v, '[^0-9]', '', 'g');
    IF v LIKE '00880%' THEN v := substr(v, 5);
    ELSIF v LIKE '880%' THEN v := substr(v, 3);
    ELSIF length(v) = 10 AND v LIKE '1%' THEN v := '0' || v;
    END IF;
    IF v ~ '^01[3-9][0-9]{8}$' THEN RETURN v; END IF;
    RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    phone TEXT NOT NULL UNIQUE CHECK (phone ~ '^01[3-9][0-9]{8}$'),
    name TEXT,
    email TEXT,
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Promotional messages only with consent; order updates are always sent.
    marketing_consent BOOLEAN NOT NULL DEFAULT false,
    marketing_consent_at TIMESTAMPTZ,
    tags TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    is_blacklisted BOOLEAN NOT NULL DEFAULT false,
    blacklist_reason TEXT,
    first_seen_channel TEXT NOT NULL DEFAULT 'online' CHECK (first_seen_channel IN ('online', 'shop', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers (lower(email));
CREATE INDEX IF NOT EXISTS customers_tags_idx ON public.customers USING gin (tags);

DROP TRIGGER IF EXISTS customers_set_updated_at ON public.customers;
CREATE TRIGGER customers_set_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);

-- ----------------------------------------------------------------------
-- upsert_customer: find or create by phone, fill gaps, link the account.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_customer(
    p_phone TEXT,
    p_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_channel TEXT DEFAULT 'online'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_phone TEXT := public.normalize_bd_phone(p_phone);
    v_id TEXT;
BEGIN
    IF v_phone IS NULL THEN RETURN NULL; END IF;

    INSERT INTO public.customers (phone, name, email, first_seen_channel)
    VALUES (v_phone, NULLIF(trim(p_name), ''), NULLIF(trim(p_email), ''),
            CASE WHEN p_channel IN ('online', 'shop', 'admin') THEN p_channel ELSE 'online' END)
    ON CONFLICT (phone) DO UPDATE
        SET name = COALESCE(public.customers.name, EXCLUDED.name),
            email = COALESCE(public.customers.email, EXCLUDED.email)
    RETURNING id INTO v_id;

    -- Link the signed-in account, unless it already belongs to another
    -- customer (one account, one number) or this customer has another account.
    IF p_user_id IS NOT NULL THEN
        UPDATE public.customers
        SET user_id = p_user_id
        WHERE id = v_id
          AND user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.customers WHERE user_id = p_user_id);
    END IF;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_customer(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_customer(TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

-- ----------------------------------------------------------------------
-- Every order gets its customer.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_attach_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_phone TEXT := public.normalize_bd_phone(NEW.customer_phone);
BEGIN
    IF v_phone IS NOT NULL THEN
        NEW.customer_phone := v_phone;
        IF NEW.customer_id IS NULL THEN
            NEW.customer_id := public.upsert_customer(v_phone, NEW.customer_name, NEW.customer_email, NEW.user_id, 'online');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_attach_customer ON public.orders;
CREATE TRIGGER orders_attach_customer
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_attach_customer();

-- Backfill existing orders, oldest first so the first name/email wins.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id, customer_phone, customer_name, customer_email, user_id
             FROM public.orders WHERE customer_id IS NULL ORDER BY created_at
    LOOP
        UPDATE public.orders
        SET customer_id = public.upsert_customer(r.customer_phone, r.customer_name, r.customer_email, r.user_id, 'online')
        WHERE id = r.id;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- Access: staff with customers.* permissions (see roles migration), and a
-- signed-in customer can read their own row.
-- ----------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers read own row" ON public.customers;
CREATE POLICY "Customers read own row" ON public.customers
    FOR SELECT USING (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage customers" ON public.customers;
CREATE POLICY "Admins manage customers" ON public.customers
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
