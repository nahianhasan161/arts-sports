import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * GET    /api/admin/roles            roles with their permissions, the permission catalogue, and staff
 * POST   /api/admin/roles            create or update a role { id?, code?, name, description, permissions[] }
 * DELETE /api/admin/roles?id=<id>    delete a non-system role
 *
 * All writes go through SECURITY DEFINER RPCs that re-check staff.manage.
 */

const ERRORS: Record<string, { status: number; message: string }> = {
  forbidden: { status: 403, message: "Only the owner can change roles." },
  role_name_required: { status: 422, message: "Give the role a name." },
  role_not_found: { status: 404, message: "That role no longer exists." },
  system_role: { status: 409, message: "Owner, Manager and Cashier cannot be deleted." },
  roles_code_check: { status: 422, message: "Role code must be lowercase letters, digits or _ (e.g. inventory)." },
  roles_code_key: { status: 409, message: "A role with that code already exists." },
};

function rpcError(message: string) {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  const mapped = key ? ERRORS[key] : null;
  return NextResponse.json({ error: mapped?.message ?? "Could not save the role." }, { status: mapped?.status ?? 500 });
}

export async function GET() {
  try {
    const { supabase } = await requirePermission("staff.manage");

    const [roles, perms, rolePerms, staffRoles, staffProfiles] = await Promise.all([
      supabase.from("roles").select("id, code, name, description, is_system").order("created_at"),
      supabase.from("permissions").select("code, area, description").order("display_order"),
      supabase.from("role_permissions").select("role_id, permission_code"),
      supabase.from("staff_roles").select("user_id, role_id"),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, status")
        .in("role", ["staff", "admin", "super_admin"])
        .order("email"),
    ]);
    const failed = [roles, perms, rolePerms, staffRoles, staffProfiles].find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

    const permsByRole = new Map<string, string[]>();
    for (const rp of rolePerms.data ?? []) {
      permsByRole.set(rp.role_id, [...(permsByRole.get(rp.role_id) ?? []), rp.permission_code]);
    }
    const rolesByUser = new Map<string, string[]>();
    for (const sr of staffRoles.data ?? []) {
      rolesByUser.set(sr.user_id, [...(rolesByUser.get(sr.user_id) ?? []), sr.role_id]);
    }

    return NextResponse.json({
      roles: (roles.data ?? []).map((r) => ({ ...r, permissions: permsByRole.get(r.id) ?? [] })),
      permissions: perms.data ?? [],
      staff: (staffProfiles.data ?? [])
        .filter((p) => p.status !== "deleted")
        .map((p) => ({ ...p, role_ids: rolesByUser.get(p.id) ?? [] })),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requirePermission("staff.manage");
    const body = (await request.json().catch(() => null)) as {
      id?: string | null;
      code?: string;
      name?: string;
      description?: string;
      permissions?: string[];
    } | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const { data, error } = await supabase.rpc("admin_save_role", {
      p_role_id: body.id ?? null,
      p_code: body.code ?? "",
      p_name: body.name ?? "",
      p_description: body.description ?? "",
      p_permissions: Array.isArray(body.permissions) ? body.permissions : [],
    });
    if (error) return rpcError(error.message);
    return NextResponse.json({ id: data });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase } = await requirePermission("staff.manage");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const { error } = await supabase.rpc("admin_delete_role", { p_role_id: id });
    if (error) return rpcError(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
