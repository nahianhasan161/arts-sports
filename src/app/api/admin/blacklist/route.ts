import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { normalizeBdPhone } from "@/lib/phone";

/**
 * POST /api/admin/blacklist { phone, blacklisted, reason? }
 * A blacklisted number gets the highest risk score: COD only with an advance.
 */
export async function POST(request: Request) {
  try {
    const { supabase } = await requirePermission("customers.manage");
    const body = (await request.json()) as { phone?: string; blacklisted?: boolean; reason?: string };
    const phone = normalizeBdPhone(body.phone ?? "");
    if (!phone) return NextResponse.json({ error: "Enter a valid BD mobile number" }, { status: 400 });

    const { data, error } = await supabase
      .from("customers")
      .update({
        is_blacklisted: Boolean(body.blacklisted),
        blacklist_reason: body.blacklisted ? (body.reason ?? "").slice(0, 300) || null : null,
      })
      .eq("phone", phone)
      .select("id, phone, is_blacklisted")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No customer with that number yet" }, { status: 404 });
    return NextResponse.json({ customer: data });
  } catch (error) {
    return handleAdminError(error);
  }
}
