import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { customerLink, dueFor, explainDbError, findOrder, loadConfig, moveOrder, notifyCustomOrder, paidTotal, recordManualPayment } from "@/lib/custom-jersey/server";
import { advanceFor, estimate } from "@/lib/custom-jersey/pricing";
import { isDesignPath } from "@/lib/custom-jersey/files";
import { cleanRosterRow } from "@/lib/custom-jersey/roster";
import { SPORTS, orderTotal, type Collar, type RosterRow, type Sleeve, type UploadedFile } from "@/lib/custom-jersey/types";
import { bad, failed } from "@/lib/pos/http";

const PAY_METHODS = ["cash", "card", "bkash", "nagad"];
const NOT_PAYABLE = ["submitted", "in_review", "changes_needed", "mockup_sent", "revision_requested", "rejected", "cancelled"];

/**
 * Custom jersey orders at the counter (roadmap 4.3).
 *
 * GET  ?q=<order number, phone, or the scanned receipt QR>   stage and balance
 * POST { id, action: "payment", amount, method, trx_id }     take the advance or the balance
 *      { id, action: "handover" }                            ready -> delivered, once fully paid
 *      { action: "create", ... }                             a new order taken at the counter (see createOrder)
 */
export async function GET(request: Request) {
  try {
    const { user: actor } = await requirePermission("pos.use");
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const q = (params.get("q") ?? "").trim().slice(0, 200);
    if (!q && !id) return NextResponse.json({ orders: [] });
    const db = getServiceSupabase(actor);

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
    if (b.action === "create") return await createOrder(b, user.id);
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

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A custom jersey order taken at the counter, with the customer standing there.
 *
 *   confirm "now"    design and price agreed at the counter: the order is approved
 *                    straight away at the agreed price, and the advance can be taken
 *                    in the same step (paying it moves the order to the queue).
 *   confirm "later"  the designer still has to make a mockup: the order goes to the
 *                    board as "submitted" and the customer confirms on their link.
 *
 * The estimate is always worked out here from the price table; staff may agree a
 * different final price (a counter discount), which is what the customer pays.
 */
async function createOrder(b: Record<string, unknown>, staffId: string) {
  const name = text(b.customer_name, 120);
  const phone = normalizeBdPhone(text(b.customer_phone, 30));
  if (name.length < 2) return bad("Enter the customer's name");
  if (!phone) return bad("Enter a valid mobile number (01XXXXXXXXX)");

  const sport = SPORTS.find((s) => s === b.sport);
  if (!sport) return bad("Choose a sport");
  const sleeve: Sleeve = b.sleeve === "full" ? "full" : "short";
  const collar: Collar = b.collar === "v" || b.collar === "polo" ? b.collar : "round";

  const config = await loadConfig();
  const fabric = config.fabrics.find((f) => f.id === b.fabric_id);
  if (!fabric) return bad("Choose a fabric");

  // Sizes as counts ({ M: 5, L: 4 }) or a full roster with names and numbers.
  const roster: RosterRow[] = [];
  for (const r of Array.isArray(b.roster) ? b.roster.slice(0, 2000) : []) {
    const row = cleanRosterRow(r, sleeve);
    if (row) roster.push(row);
  }
  const quantity = roster.length || Math.floor(Number(b.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 2000) return bad("Quantity must be between 1 and 2000");

  const files: UploadedFile[] = [];
  for (const f of Array.isArray(b.files) ? b.files.slice(0, 10) : []) {
    const file = f as Partial<UploadedFile>;
    if (!isDesignPath(file.path)) continue;
    files.push({ path: file.path, name: text(file.name, 120) || "file", mime: text(file.mime, 80), size: Number(file.size) || 0, kind: file.kind === "reference" ? "reference" : "design" });
  }
  const notes = text(b.notes, 4000) || null;
  if (files.length === 0 && !notes) return bad("Add the design file, or write what the customer wants");

  const neededBy = /^\d{4}-\d{2}-\d{2}$/.test(text(b.needed_by, 10)) ? text(b.needed_by, 10) : null;
  const result = estimate(
    { fabricPrice: fabric.price_per_piece, quantity, sleeve, collar, withShorts: b.with_shorts === true, withNames: b.with_names === true, withNumbers: b.with_numbers === true, withLogo: b.with_logo === true, roster: roster.length ? roster : undefined, neededBy },
    config.pricing
  );
  if (result.tooSoon) return bad(`Too soon: the earliest is ${config.pricing.rush.min_days} days from today`);

  const pickup = b.delivery_method !== "delivery";
  const zone = pickup ? null : b.delivery_zone === "dhaka" ? "dhaka" : "outside";
  const address = pickup ? null : text(b.delivery_address, 500);
  if (!pickup && (address ?? "").length < 5) return bad("Enter the delivery address");
  const deliveryCharge = pickup ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;

  const confirmNow = b.confirm === "now";
  let finalPrice: number | null = null;
  if (confirmNow) {
    finalPrice = b.final_price === undefined || b.final_price === "" ? result.total : Number(b.final_price);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0 || finalPrice > 10_000_000) return bad("Enter the agreed price");
  }

  const db = getServiceSupabase({ id: staffId });
  const { data: customerId } = await db.rpc("upsert_customer", { p_phone: phone, p_name: name, p_email: null, p_user_id: null, p_channel: "shop" });

  const now = new Date().toISOString();
  const total = finalPrice === null ? 0 : orderTotal({ final_price: finalPrice, delivery_charge: deliveryCharge });
  const advance = finalPrice === null ? null : advanceFor(total, config.pricing);
  const { data: created, error } = await db
    .from("custom_orders")
    .insert({
      channel: "shop",
      customer_id: typeof customerId === "string" ? customerId : null,
      customer_name: name,
      customer_phone: phone,
      locale: "bn",
      source: "upload",
      sport,
      design: {},
      files,
      notes,
      fabric_id: fabric.id,
      fabric_name: fabric.name_en,
      sleeve,
      collar,
      with_shorts: b.with_shorts === true,
      with_names: b.with_names === true,
      with_numbers: b.with_numbers === true,
      with_logo: b.with_logo === true,
      quantity: result.quantity,
      needed_by: neededBy,
      is_rush: result.isRush,
      delivery_method: pickup ? "pickup" : "delivery",
      delivery_zone: zone,
      delivery_address: address,
      delivery_charge: deliveryCharge,
      estimated_price: result.total,
      estimate_breakdown: { ...result, fabric_price: fabric.price_per_piece },
      ...(confirmNow ? { status: "approved", final_price: finalPrice, advance_amount: advance, approved_at: now, terms_accepted_at: now } : {}),
    })
    .select("id")
    .single();
  if (error || !created) return bad(explainDbError(error?.message ?? "Could not save the order"), 500);

  if (roster.length) {
    const { error: rosterError } = await db
      .from("custom_order_roster")
      .insert(roster.map((r, position) => ({ custom_order_id: created.id, position, ...r, player_name: r.player_name || null, player_number: r.player_number || null })));
    if (rosterError) console.error("Could not save the roster:", rosterError.message);
  }
  await db.from("custom_order_events").insert({ custom_order_id: created.id, to_status: "submitted", actor: "staff", actor_id: staffId, note: "Taken at the shop counter" });
  if (confirmNow) {
    await db.from("custom_order_events").insert({ custom_order_id: created.id, from_status: "submitted", to_status: "approved", actor: "staff", actor_id: staffId, note: `Design and price (৳${finalPrice}) agreed at the counter` });
  }

  const order = await findOrder({ id: created.id });
  if (!order) return bad("Could not load the saved order", 500);

  // The advance, taken in the same step when the customer pays now.
  const payNow = Number(b.pay_amount);
  let paymentError: string | null = null;
  if (confirmNow && Number.isFinite(payNow) && payNow > 0) {
    const method = String(b.pay_method ?? "");
    if (!PAY_METHODS.includes(method)) paymentError = "Order saved, but the payment method was not valid: take the payment again";
    else if (payNow > total + 0.001) paymentError = `Order saved, but ৳${payNow} is more than the total (৳${total}): take the payment again`;
    else {
      try {
        await recordManualPayment({ order, amount: payNow, method, kind: payNow >= total ? "balance" : "advance", trxId: text(b.pay_trx, 60) || null, note: "Taken at the shop counter", staffId });
      } catch (err) {
        paymentError = `Order saved, but the payment failed: ${err instanceof Error ? err.message : "try again"}`;
      }
    }
  }

  await notifyCustomOrder(order, confirmNow ? "custom_approved" : "custom_submitted", confirmNow ? { amount: `৳${advance}` } : {});
  return NextResponse.json({ ok: true, id: order.id, order_number: order.order_number, estimated_price: result.total, payment_error: paymentError });
}
