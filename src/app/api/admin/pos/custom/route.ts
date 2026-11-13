import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { customerLink, dueFor, explainDbError, findOrder, moveOrder, paidTotal, recordManualPayment } from "@/lib/custom-jersey/server";
import { bad, failed } from "@/lib/pos/http";

const PAY_METHODS = ["cash", "card", "bkash", "nagad"];
const NOT_PAYABLE = ["submitted", "in_review", "changes_needed", "mockup_sent", "revision_requested", "rejected", "cancelled"];

/**
 * Custom jersey orders at the counter (roadmap 4.3).
 *
 * GET  ?q=<order number, phone, or the scanned receipt QR>   stage and balance
 * POST { id, action: "payment", amount, method, trx_id }     take the advance or the balance
 *      { id, action: "handover" }                            ready -> delivered, once fully paid
 */
export async function GET(request: Request) {
  try {
    await requirePermission("pos.use");
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const q = (params.get("q") ?? "").trim().slice(0, 200);
    if (!q && !id) return NextResponse.json({ orders: [] });
    const db = getServiceSupabase();

    const columns = "id, order_number, access_token, customer_name, customer_phone, quantity, fabric_name, sport, final_price, estimated_price, advance_amount, delivery_charge, status, due_date, needed_by, created_at";
    let query = db.from("custom_orders").select(columns).order("created_at", { ascending: false }).limit(10);
    // The receipt QR is the customer's link, which ends in the access token.
    const token = q.match(/order\/([0-9a-f]{40,})/i)?.[1];
    const phone = normalizeBdPhone(q);
    if (id) query = query.eq("id", id);
    else if (token) query = query.eq("access_token", token);
    else if (phone) query = query.eq("customer_phone", phone);
    else query = query.ilike("order_number", `%${q.replace(/[%,()]/g, "")}%`);

    const { data, error } = await query;
    if (error) return bad(explainDbError(error.message), 500);

    const orders = [];
    for (const o of data ?? []) {
      const paid = await paidTotal(o.id);
      const due = dueFor({ ...o, final_price: o.final_price === null ? null : Number(o.final_price), delivery_charge: Number(o.delivery_charge), advance_amount: o.advance_amount === null ? null : Number(o.advance_amount) }, paid);
      const { access_token, ...rest } = o;
      orders.push({ ...rest, link: customerLink(access_token), paid: due.paid, total: due.total, payable: due.payable, kind: due.kind, can_pay: !NOT_PAYABLE.includes(o.status) && o.final_price !== null });
    }
    return NextResponse.json({ orders });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("pos.use");
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const order = await findOrder({ id: String(b.id ?? "") });
    if (!order) return bad("Order not found", 404);
    const paid = await paidTotal(order.id);
    const due = dueFor(order, paid);

    if (b.action === "payment") {
      if (NOT_PAYABLE.includes(order.status) || order.final_price === null) return bad("Money is taken only after the customer has confirmed the design");
      const amount = Number(b.amount);
      const method = String(b.method ?? "");
      if (!Number.isFinite(amount) || amount <= 0) return bad("Enter the amount");
      if (!PAY_METHODS.includes(method)) return bad("Choose how it was paid");
      if (amount > due.total - due.paid + 0.001) return bad(`That is more than what is left to pay (৳${due.total - due.paid})`);
      await recordManualPayment({ order, amount, method, kind: due.kind, trxId: typeof b.trx_id === "string" ? b.trx_id.trim().slice(0, 60) : null, note: "Taken at the shop counter", staffId: user.id });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "handover") {
      if (order.status !== "ready") return bad("The order is not marked ready yet");
      if (due.total - due.paid > 0.001) return bad(`৳${due.total - due.paid} is still to be paid`);
      const moved = await moveOrder(order, "delivered", { kind: "staff", id: user.id }, { note: "Handed over at the shop" });
      if (!moved) return bad("Someone else just changed this order. Search again.", 409);
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}
