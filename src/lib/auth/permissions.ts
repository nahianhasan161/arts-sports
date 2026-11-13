import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AdminAuthError } from "@/lib/admin/auth";

/**
 * Staff permissions. The list lives in the `permissions` table; these
 * constants are the same codes, so a typo is a type error.
 *
 *   super_admin -> everything
 *   admin       -> everything except staff.manage
 *   staff       -> what their roles grant
 */
export const PERMISSIONS = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "returns.manage",
  "leads.manage",
  "payments.view",
  "payments.manage",
  "refunds.manage",
  "reports.view",
  "reports.financial",
  "products.manage",
  "media.manage",
  "promotions.manage",
  "inventory.manage",
  "pos.use",
  "pos.manage",
  "custom_orders.manage",
  "customers.view",
  "customers.manage",
  "marketing.manage",
  "audit.view",
  "settings.manage",
  "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

async function sessionClient() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      } catch {
        // Read-only in some contexts; the middleware refreshes the session.
      }
    },
  });
  if (!supabase) throw new AdminAuthError(500, "Authentication service not configured");
  return supabase;
}

export interface PermissionContext {
  user: { id: string; email?: string };
  supabase: NonNullable<Awaited<ReturnType<typeof sessionClient>>>;
}

/**
 * Throws AdminAuthError (401/403) unless the signed-in person has the
 * permission. Use with handleAdminError() in API routes:
 *
 *   const { supabase } = await requirePermission("audit.view");
 */
export async function requirePermission(permission: Permission): Promise<PermissionContext> {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AdminAuthError(401, "Not signed in.");

  const { data, error } = await supabase.rpc("has_permission", { p_code: permission });
  if (error) throw new AdminAuthError(500, `Permission check failed: ${error.message}`);
  if (data !== true) {
    throw new AdminAuthError(403, `This needs the "${permission}" permission. Ask the owner to add it to your role.`);
  }
  return { user: { id: user.id, email: user.email ?? undefined }, supabase };
}

/** The signed-in person's permissions, for showing or hiding UI. Empty when signed out. */
export async function getMyPermissions(): Promise<Permission[]> {
  const supabase = await sessionClient();
  const { data } = await supabase.rpc("my_permissions");
  return Array.isArray(data) ? (data as Permission[]) : [];
}
