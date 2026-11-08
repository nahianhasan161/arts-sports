-- Roles and permissions (Phase 0).
--
-- Instead of one "admin" switch, staff get roles and roles get permissions.
-- Roles are data, not code: the owner can create a role and tick its
-- permissions. A person can hold several roles.
--
-- How existing accounts map:
--   super_admin -> the Owner. Has every permission.
--   admin       -> every permission except staff.manage (as today: only a
--                  super admin could change roles).
--   staff       -> new profile role: only what their roles grant.
--   user        -> customers; no staff permissions.
--
-- Seeded roles: Owner, Manager, Cashier (the roadmap starts with these;
-- add Inventory, Designer, Support... from the admin page when the team grows).
--
-- The admin area is still opened to admin/super_admin only. Staff accounts
-- get in when their screens exist (POS in Phase 4); until then this is the
-- foundation those screens check with has_permission().
--
-- Safe to re-run.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'staff', 'admin', 'super_admin'));

CREATE TABLE IF NOT EXISTS public.permissions (
    code TEXT PRIMARY KEY,
    area TEXT NOT NULL,
    description TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
    name TEXT NOT NULL,
    description TEXT,
    -- System roles cannot be deleted; their permissions can still be edited,
    -- except Owner, which always has everything.
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS public.staff_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

DROP TRIGGER IF EXISTS roles_set_updated_at ON public.roles;
CREATE TRIGGER roles_set_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------
-- Permission catalogue
-- ----------------------------------------------------------------------
INSERT INTO public.permissions (code, area, description, display_order) VALUES
    ('dashboard.view',        'General',    'See the admin dashboard', 10),
    ('orders.view',           'Orders',     'See online orders', 20),
    ('orders.manage',         'Orders',     'Edit, confirm, cancel and ship orders; book couriers', 21),
    ('returns.manage',        'Orders',     'Handle returns and cancellations', 22),
    ('leads.manage',          'Orders',     'Work the leads / follow-up list and confirm orders by phone', 23),
    ('payments.view',         'Money',      'See payments', 30),
    ('payments.manage',       'Money',      'Record and adjust payments', 31),
    ('refunds.manage',        'Money',      'Create and send refunds', 32),
    ('reports.view',          'Money',      'See sales reports', 33),
    ('reports.financial',     'Money',      'See cost price, profit and cash totals', 34),
    ('products.manage',       'Catalogue',  'Create and edit products, prices, categories, sizes and colours', 40),
    ('media.manage',          'Catalogue',  'Upload and organise images', 41),
    ('promotions.manage',     'Catalogue',  'Promotions, coupons and campaigns', 42),
    ('inventory.manage',      'Stock',      'Stock in, counts, adjustments, transfers and barcode labels', 50),
    ('pos.use',               'Shop',       'Sell in the shop (POS), hold bills and close the day', 60),
    ('custom_orders.manage',  'Custom jersey', 'Review designs, mockups and the production board', 70),
    ('customers.view',        'Customers',  'See customers and their history', 80),
    ('customers.manage',      'Customers',  'Edit customers, tags, notes and the blacklist', 81),
    ('marketing.manage',      'Marketing',  'Landing content, campaigns and messages to segments', 90),
    ('audit.view',            'Admin',      'See the audit log', 100),
    ('settings.manage',       'Admin',      'Store settings, payment and courier configuration', 101),
    ('staff.manage',          'Admin',      'Add staff, create roles and assign them', 102)
ON CONFLICT (code) DO UPDATE
    SET area = EXCLUDED.area, description = EXCLUDED.description, display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------
-- Seed roles
-- ----------------------------------------------------------------------
INSERT INTO public.roles (code, name, description, is_system) VALUES
    ('owner',   'Owner',   'Everything, including staff and roles', true),
    ('manager', 'Manager', 'Everything except staff, roles and store settings', true),
    ('cashier', 'Cashier', 'The shop POS, their own sales and the day''s cash count', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'owner'
ON CONFLICT DO NOTHING;

-- Only on first run, so later edits from the admin page are kept.
INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'manager'
  AND p.code NOT IN ('staff.manage', 'settings.manage')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'cashier'
  AND p.code IN ('dashboard.view', 'pos.use', 'orders.view', 'customers.view')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id)
ON CONFLICT DO NOTHING;

-- Super admins show up as Owners in the staff list.
INSERT INTO public.staff_roles (user_id, role_id)
SELECT pr.id, r.id FROM public.profiles pr JOIN public.roles r ON r.code = 'owner'
WHERE pr.role = 'super_admin'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------
-- Checks
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(p_code TEXT, p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := COALESCE(p_user_id, auth.uid());
    v_role TEXT;
BEGIN
    IF v_uid IS NULL THEN RETURN false; END IF;
    -- Only staff managers may ask about someone else.
    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid()
       AND auth.uid() IS NOT NULL AND NOT public.has_permission('staff.manage') THEN
        RETURN false;
    END IF;

    SELECT role INTO v_role FROM public.profiles
    WHERE id = v_uid AND COALESCE(status, 'active') = 'active';

    IF v_role = 'super_admin' THEN RETURN true; END IF;
    IF v_role = 'admin' THEN RETURN p_code <> 'staff.manage'; END IF;
    IF v_role IS DISTINCT FROM 'staff' THEN RETURN false; END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.staff_roles sr
        JOIN public.role_permissions rp ON rp.role_id = sr.role_id
        WHERE sr.user_id = v_uid AND rp.permission_code = p_code
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(array_agg(p.code ORDER BY p.display_order), '{}')
    FROM public.permissions p
    WHERE public.has_permission(p.code);
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('staff', 'admin', 'super_admin')
          AND COALESCE(status, 'active') = 'active'
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ----------------------------------------------------------------------
-- Management RPCs (staff.manage only)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_role(
    p_role_id TEXT,
    p_code TEXT,
    p_name TEXT,
    p_description TEXT,
    p_permissions TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id TEXT := p_role_id;
    v_code TEXT;
BEGIN
    IF NOT public.has_permission('staff.manage') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(p_name), '') IS NULL THEN
        RAISE EXCEPTION 'role_name_required';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.roles (code, name, description)
        VALUES (lower(trim(p_code)), trim(p_name), NULLIF(trim(p_description), ''))
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.roles
        SET name = trim(p_name), description = NULLIF(trim(p_description), '')
        WHERE id = v_id
        RETURNING code INTO v_code;
        IF NOT FOUND THEN RAISE EXCEPTION 'role_not_found'; END IF;
        -- Owner always keeps every permission.
        IF v_code = 'owner' THEN RETURN v_id; END IF;
    END IF;

    DELETE FROM public.role_permissions
    WHERE role_id = v_id AND permission_code <> ALL (COALESCE(p_permissions, '{}'));

    INSERT INTO public.role_permissions (role_id, permission_code)
    SELECT v_id, p.code FROM public.permissions p
    WHERE p.code = ANY (COALESCE(p_permissions, '{}'))
    ON CONFLICT DO NOTHING;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_role(p_role_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.has_permission('staff.manage') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id AND is_system) THEN
        RAISE EXCEPTION 'system_role';
    END IF;
    DELETE FROM public.roles WHERE id = p_role_id;
END;
$$;

/**
 * Sets exactly these roles for a person. A customer account given a role
 * becomes 'staff'; a staff account left with no roles goes back to 'user'.
 * admin and super_admin accounts keep their profile role.
 */
CREATE OR REPLACE FUNCTION public.admin_set_staff_roles(p_user_id UUID, p_role_ids TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT public.has_permission('staff.manage') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

    DELETE FROM public.staff_roles
    WHERE user_id = p_user_id AND role_id <> ALL (COALESCE(p_role_ids, '{}'));

    INSERT INTO public.staff_roles (user_id, role_id, assigned_by)
    SELECT p_user_id, r.id, auth.uid() FROM public.roles r
    WHERE r.id = ANY (COALESCE(p_role_ids, '{}'))
    ON CONFLICT DO NOTHING;

    IF v_role = 'user' AND COALESCE(array_length(p_role_ids, 1), 0) > 0 THEN
        UPDATE public.profiles SET role = 'staff' WHERE id = p_user_id;
    ELSIF v_role = 'staff' AND COALESCE(array_length(p_role_ids, 1), 0) = 0 THEN
        UPDATE public.profiles SET role = 'user' WHERE id = p_user_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_role(TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_role(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_staff_roles(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_role(TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_roles(UUID, TEXT[]) TO authenticated;

-- ----------------------------------------------------------------------
-- RLS: anyone on staff can read the catalogue; writes go through the RPCs.
-- ----------------------------------------------------------------------
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read permissions" ON public.permissions;
CREATE POLICY "Staff read permissions" ON public.permissions FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "Staff read roles" ON public.roles;
CREATE POLICY "Staff read roles" ON public.roles FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "Staff read role permissions" ON public.role_permissions;
CREATE POLICY "Staff read role permissions" ON public.role_permissions FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "Read own or managed staff roles" ON public.staff_roles;
CREATE POLICY "Read own or managed staff roles" ON public.staff_roles
    FOR SELECT USING (user_id = auth.uid() OR public.has_permission('staff.manage'));

-- Customers: switch from the blanket admin check to permissions.
DROP POLICY IF EXISTS "Admins manage customers" ON public.customers;
DROP POLICY IF EXISTS "Staff read customers" ON public.customers;
CREATE POLICY "Staff read customers" ON public.customers
    FOR SELECT USING (public.has_permission('customers.view'));
DROP POLICY IF EXISTS "Staff manage customers" ON public.customers;
CREATE POLICY "Staff manage customers" ON public.customers
    FOR ALL USING (public.has_permission('customers.manage'))
    WITH CHECK (public.has_permission('customers.manage'));
