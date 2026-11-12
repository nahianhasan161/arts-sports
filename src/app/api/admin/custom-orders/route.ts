import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainDbError } from "@/lib/custom-jersey/server";
import { normalizeBdPhone } from "@/lib/phone";

/**
 * GET /api/admin/custom-orders?scope=open|closed|all&q=<order number, name or phone>
 * Orders for the production board and the list, with what has been paid,
 * plus the staff who can be given an order.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("custom_orders.manage");
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "open";
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
    const db = getServiceSupabase();

    let query = db
      .from("custom_orders")
      .select("id, order_number, customer_name, customer_phone, source, sport, quantity, fabric_name, needed_by, is_rush, estimated_price, final_price, advance_amount, delivery_charge, status, revision_count, assigned_to, due_date, created_at, updated_at, design")
      .order("created_at", { ascending: false })
      .limit(300);
    const closed = ["delivered", "rejected", "cancelled"];
    if (scope === "open") query = query.not("status", "in", `(${closed.join(",")})`);
    else if (scope === "closed") query = query.in("status", closed);
    if (q) {
      const phone = normalizeBdPhone(q);
      const safe = q.replace(/[%,()]/g, "");
      query = phone ? query.eq("customer_phone", phone) : query.or(`order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`);
    }
    const { data: orders, error } = await query;
    if (error) return NextResponse.json({ error: explainDbError(error.message) }, { status: 500 });

    const ids = (orders ?? []).map((o) => o.id);
    const paid = new Map<string, number>();
    if (ids.length) {
      const { data: payments } = await db.from("custom_order_payments").select("custom_order_id, amount").eq("status", "successful").in("custom_order_id", ids);
      for (const p of payments ?? []) paid.set(p.custom_order_id, (paid.get(p.custom_order_id) ?? 0) + Number(p.amount));
    }

    const { data: staff } = await db.from("profiles").select("id, full_name, email").in("role", ["staff", "admin", "super_admin"]).order("full_name");

    return NextResponse.json({
      orders: (orders ?? []).map((o) => ({ ...o, paid_total: paid.get(o.id) ?? 0 })),
      staff: (staff ?? []).map((s) => ({ id: s.id, name: s.full_name || s.email || "Staff" })),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
