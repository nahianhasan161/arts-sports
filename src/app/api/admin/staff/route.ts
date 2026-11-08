import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * PUT /api/admin/staff   { user_id?, email?, role_ids: string[] }
 *
 * Sets exactly these roles for one person, found by id or by the email they
 * signed up with. Giving a customer account a role makes it staff; removing
 * every role makes it a customer again.
 */
export async function PUT(request: Request) {
  try {
    const { supabase } = await requirePermission("staff.manage");
    const body = (await request.json().catch(() => null)) as {
      user_id?: string;
      email?: string;
      role_ids?: string[];
    } | null;
    if (!body || !Array.isArray(body.role_ids)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    let userId = body.user_id ?? null;
    if (!userId && body.email) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", body.email.trim())
        .maybeSingle();
      userId = data?.id ?? null;
      if (!userId) {
        return NextResponse.json(
          { error: "No account with that email. They need to sign up on the site once first." },
          { status: 404 }
        );
      }
    }
    if (!userId) return NextResponse.json({ error: "Give a user id or email" }, { status: 400 });

    const { error } = await supabase.rpc("admin_set_staff_roles", {
      p_user_id: userId,
      p_role_ids: body.role_ids,
    });
    if (error) {
      const status = error.message.includes("forbidden") ? 403 : error.message.includes("profile_not_found") ? 404 : 500;
      return NextResponse.json({ error: status === 500 ? "Could not save roles." : error.message }, { status });
    }
    return NextResponse.json({ ok: true, user_id: userId });
  } catch (error) {
    return handleAdminError(error);
  }
}
