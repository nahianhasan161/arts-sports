import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { explainPosError } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/** GET /api/admin/pos/customer?phone=01XXXXXXXXX — who this is, if they have bought before. */
export async function GET(request: Request) {
  try {
    await requirePermission("pos.use");
    const phone = normalizeBdPhone(new URL(request.url).searchParams.get("phone"));
    if (!phone) return NextResponse.json({ customer: null });
    const db = getServiceSupabase();
    const { data: customer, error } = await db
      .from("customers")
      .select("id, phone, name, tags, marketing_consent, is_blacklisted, notes")
      .eq("phone", phone)
      .maybeSingle();
    if (error) return bad(explainPosError(error.message), 500);
    if (!customer) return NextResponse.json({ customer: null });
    const { data: stats } = await db.from("customer_stats").select("total_spent, online_orders, shop_sales, custom_orders, last_purchase_at").eq("customer_id", customer.id).maybeSingle();
    return NextResponse.json({ customer: { ...customer, stats: stats ?? null } });
  } catch (error) {
    return failed(error);
  }
}
