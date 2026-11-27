import "server-only";
import { config as appConfig, getServerUrl } from "@/lib/config";
import { parseReceiptSettings, RECEIPT_SETTINGS_KEY, shopMap } from "@/lib/pos/receipt-settings";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { notify, type Template } from "@/lib/notifications";
import { formatMoney, resolveLocale, translate, type Vars } from "@/i18n";
import { DEFAULT_GATEWAY, getGateway } from "@/lib/payments/gateway";
import { publicUrlFor } from "@/lib/media/storage";
import { normalizeFabricTiers, normalizePricing } from "./pricing";
import {
  orderTotal,
  type CustomJerseyConfig,
  type CustomOrderDetail,
  type CustomOrderStatus,
  type Fabric,
  type JerseyTemplate,
  type PricingConfig,
} from "./types";

/**
 * Server side of custom jersey orders. Every caller has already decided who
 * is asking: staff (custom_orders.manage) or the holder of the order's
 * access token. This module uses the service role and trusts that decision.
 */

/** One origin for the whole app (see getServerUrl); never localhost in a production build. */
export function siteUrl(): string {
  return getServerUrl();
}

export function customerLink(token: string): string {
  return `${siteUrl()}/custom-jersey/order/${token}`;
}

export function isOnlinePaymentAvailable(): boolean {
  try {
    return getGateway(DEFAULT_GATEWAY).isConfigured();
  } catch {
    return false;
  }
}

/** Turns a missing-table error into something staff can act on. */
export function explainDbError(message: string): string {
  if (/\bitems\b|item_id|pant_size/.test(message) && /does not exist|schema cache|Could not find/i.test(message)) {
    return "Several designs in one order need the migration 20261121100000_custom_order_items.sql, which has not been applied yet.";
  }
  if (/custom_|jersey_templates/.test(message) && /does not exist|schema cache|Could not find/i.test(message)) {
    return "Custom jersey is not set up yet: the Phase 3 migration (20261113100000_custom_jersey.sql) has not been applied.";
  }
  return message;
}

export async function loadPricing(): Promise<PricingConfig> {
  const { data } = await getServiceSupabase().from("app_settings").select("value").eq("key", "custom_jersey_pricing").maybeSingle();
  // normalizePricing({}) = the defaults plus the starting option lists.
  if (!data?.value) return normalizePricing({});
  try {
    return normalizePricing(JSON.parse(data.value));
  } catch {
    return normalizePricing({});
  }
}

/** The same for public pages, which show the defaults rather than fail when the database is not there. */
export async function loadPublicPricing(): Promise<PricingConfig> {
  if (!isServiceSupabaseConfigured()) return normalizePricing({});
  try {
    return await loadPricing();
  } catch {
    return normalizePricing({});
  }
}

async function deliveryFees(): Promise<{ dhaka: number; outside: number }> {
  const { data } = await getServiceSupabase().rpc("checkout_settings");
  const s = (data ?? {}) as { delivery_fee_dhaka?: number; delivery_fee_outside?: number };
  return { dhaka: Number(s.delivery_fee_dhaka ?? 70), outside: Number(s.delivery_fee_outside ?? 120) };
}

export async function loadConfig(includeInactive = false): Promise<CustomJerseyConfig> {
  const db = getServiceSupabase();
  let fabrics = db.from("custom_fabrics").select("*").order("display_order");
  let templates = db.from("jersey_templates").select("*").order("sport").order("display_order");
  if (!includeInactive) {
    fabrics = fabrics.eq("is_active", true);
    templates = templates.eq("is_active", true);
  }
  const [f, t, pricing, delivery, pickup] = await Promise.all([fabrics, templates, loadPricing(), deliveryFees(), pickupShop()]);
  if (f.error) throw new Error(explainDbError(f.error.message));
  if (t.error) throw new Error(explainDbError(t.error.message));
  return {
    fabrics: (f.data ?? []).map((row) => ({ ...row, price_per_piece: Number(row.price_per_piece), price_tiers: normalizeFabricTiers(row.price_tiers) })) as Fabric[],
    templates: (t.data ?? []) as JerseyTemplate[],
    pricing,
    delivery,
    onlinePayment: isOnlinePaymentAvailable(),
    pickup,
  };
}

/** The shop customers pick up from: the shop details on the Receipt settings page. */
async function pickupShop(): Promise<CustomJerseyConfig["pickup"]> {
  const { data } = await getServiceSupabase().from("app_settings").select("value").eq("key", RECEIPT_SETTINGS_KEY).maybeSingle();
  const s = parseReceiptSettings(data?.value ?? null);
  const name = s.shop_name || appConfig.app.name;
  const phone = s.phone || appConfig.business.phone;
  if (!s.address && !s.map_url) return null;
  return { name, address: s.address, phone, hours: s.hours, map: shopMap({ ...s, shop_name: name }) };
}

const ORDER_COLUMNS =
  "id, order_number, access_token, customer_name, customer_phone, customer_email, customer_id, user_id, locale, channel, source, sport, template_id, design, files, notes, fabric_id, fabric_name, sleeve, collar, with_shorts, with_names, with_numbers, with_logo, quantity, needed_by, is_rush, delivery_method, delivery_zone, delivery_address, delivery_charge, estimated_price, estimate_breakdown, final_price, advance_amount, status, status_reason, revision_count, approved_at, gallery_consent, assigned_to, due_date, staff_note, created_at, updated_at, delivered_at";

export type OrderRow = Omit<CustomOrderDetail, "paid_total" | "roster" | "mockups" | "messages" | "events" | "payments"> & {
  access_token: string;
  customer_id: string | null;
  user_id: string | null;
};

/** True when the error is "column ... does not exist" (a migration not applied yet). */
const missingColumn = (e: { message?: string } | null) => Boolean(e && /column .* does not exist|Could not find .* column/i.test(e.message ?? ""));

export async function findOrder(by: { id: string } | { token: string }): Promise<OrderRow | null> {
  const run = (columns: string) => {
    const query = getServiceSupabase().from("custom_orders").select(columns);
    return ("id" in by ? query.eq("id", by.id) : query.eq("access_token", by.token)).maybeSingle();
  };
  // `items` comes with migration 20261121100000; before it, orders read as one design.
  let { data, error } = await run(`${ORDER_COLUMNS}, items`);
  if (missingColumn(error)) ({ data, error } = await run(ORDER_COLUMNS));
  if (error) throw new Error(explainDbError(error.message));
  if (!data) return null;
  const row = data as unknown as OrderRow;
  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
    delivery_charge: Number(row.delivery_charge),
    estimated_price: Number(row.estimated_price),
    final_price: row.final_price === null ? null : Number(row.final_price),
    advance_amount: row.advance_amount === null ? null : Number(row.advance_amount),
  };
}

/**
 * The order with everything attached. For the customer the staff-only
 * fields are removed, and so are payment rows that never completed.
 */
export async function loadDetail(order: OrderRow, audience: "staff" | "customer"): Promise<CustomOrderDetail> {
  const db = getServiceSupabase();
  const rosterCols = "id, position, player_name, player_number, size, sleeve, fit, chest, length, sleeve_length";
  const readRoster = async () => {
    const res = await db.from("custom_order_roster").select(`${rosterCols}, item_id, pant_size`).eq("custom_order_id", order.id).order("position");
    return missingColumn(res.error) ? await db.from("custom_order_roster").select(rosterCols).eq("custom_order_id", order.id).order("position") : res;
  };
  const [roster, mockups, messages, events, payments] = await Promise.all([
    readRoster(),
    db.from("custom_order_mockups").select("id, version, images, note, created_at").eq("custom_order_id", order.id).order("version", { ascending: false }),
    db.from("custom_order_messages").select("id, author, body, created_at").eq("custom_order_id", order.id).order("created_at"),
    db.from("custom_order_events").select("id, from_status, to_status, actor, note, created_at").eq("custom_order_id", order.id).order("created_at"),
    db.from("custom_order_payments").select("id, kind, method, amount, status, trx_id, note, created_at, paid_at").eq("custom_order_id", order.id).order("created_at"),
  ]);

  const allPayments = (payments.data ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
  const paid_total = allPayments.filter((p) => p.status === "successful").reduce((s, p) => s + p.amount, 0);

  const { customer_id: _customerId, user_id: _userId, ...rest } = order;
  void _customerId;
  void _userId;
  const detail: CustomOrderDetail = {
    ...rest,
    paid_total,
    roster: (roster.data ?? []).map((r) => ({ ...r, player_name: r.player_name ?? "", player_number: r.player_number ?? "", chest: r.chest == null ? null : Number(r.chest), length: r.length == null ? null : Number(r.length), sleeve_length: r.sleeve_length == null ? null : Number(r.sleeve_length) })) as CustomOrderDetail["roster"],
    mockups: (mockups.data ?? []) as CustomOrderDetail["mockups"],
    messages: (messages.data ?? []) as CustomOrderDetail["messages"],
    events: (events.data ?? []) as CustomOrderDetail["events"],
    payments: allPayments as CustomOrderDetail["payments"],
  };

  if (audience === "customer") {
    delete detail.staff_note;
    detail.assigned_to = null;
    detail.payments = detail.payments.filter((p) => p.status === "successful").map((p) => ({ ...p, note: null }));
    // Staff notes on a status change stay internal; the reason field is what the customer reads.
    detail.events = detail.events.map((e) => ({ ...e, note: null }));
  }
  return detail;
}

/** Where a stored design file can be opened from. Images that are public anyway get their URL. */
export function fileUrl(orderRef: { token: string } | { id: string }, index: number): string {
  const ref = "token" in orderRef ? `token=${orderRef.token}` : `id=${orderRef.id}`;
  return `/api/custom-jersey/file?${ref}&i=${index}`;
}

export function previewUrl(path: string | null | undefined): string | null {
  return path ? publicUrlFor(path) : null;
}

export interface Actor {
  kind: "customer" | "staff" | "system";
  id?: string | null;
}

/**
 * Moves an order to a new status, only if it is still in the status the
 * caller saw (two people clicking at once: the second one gets false).
 */
export async function moveOrder(
  order: Pick<OrderRow, "id" | "status">,
  to: CustomOrderStatus,
  actor: Actor,
  options: { reason?: string | null; note?: string | null; patch?: Record<string, unknown> } = {}
): Promise<boolean> {
  const db = getServiceSupabase();
  const patch: Record<string, unknown> = { status: to, ...(options.patch ?? {}) };
  if (options.reason !== undefined) patch.status_reason = options.reason;
  if (to === "delivered") patch.delivered_at = new Date().toISOString();

  const { data, error } = await db.from("custom_orders").update(patch).eq("id", order.id).eq("status", order.status).select("id");
  if (error) throw new Error(explainDbError(error.message));
  if (!data?.length) return false;

  await db.from("custom_order_events").insert({
    custom_order_id: order.id,
    from_status: order.status,
    to_status: to,
    actor: actor.kind,
    actor_id: actor.id ?? null,
    note: options.note ?? options.reason ?? null,
  });
  return true;
}

/**
 * An approved order whose advance is already covered (no advance, or paid enough) goes
 * into the production queue now, like the payment RPC does when the advance comes in.
 * Returns true when it moved.
 */
export async function queueIfAdvanceCovered(orderId: string, actor: Actor, note: string): Promise<boolean> {
  const order = await findOrder({ id: orderId });
  if (!order || order.status !== "approved") return false;
  if (await paidTotal(order.id) < Number(order.advance_amount ?? 0)) return false;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const plus = (n: number) => day(new Date(today.getTime() + n * 86_400_000));
  const dueDate = order.due_date ?? [order.needed_by ?? plus(7), plus(1)].sort().pop()!;
  return moveOrder(order, "queued", actor, { reason: null, note, patch: { due_date: dueDate } });
}

type CustomTemplate = Extract<Template, `custom_${string}`>;

/** Message to the customer about their custom order. Never throws. */
export async function notifyCustomOrder(
  order: Pick<OrderRow, "id" | "order_number" | "access_token" | "customer_name" | "customer_phone" | "customer_email" | "customer_id" | "locale">,
  template: CustomTemplate,
  extra: Vars = {}
): Promise<void> {
  try {
    await notify({
      template,
      locale: resolveLocale(order.locale),
      to: { email: order.customer_email, phone: order.customer_phone },
      vars: { id: order.order_number, name: order.customer_name, link: customerLink(order.access_token), ...extra },
      customerId: order.customer_id,
      customOrderId: order.id,
    });
  } catch (err) {
    console.error(`custom order notification ${template} failed:`, err);
  }
}

export function stageLabel(status: CustomOrderStatus, locale: string): string {
  return translate(resolveLocale(locale), `customJersey.status.${status}`);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface Due {
  total: number;
  paid: number;
  advance: number;
  /** What can be paid right now, and what it would be called. */
  payable: number;
  kind: "advance" | "balance";
}

export function dueFor(order: Pick<OrderRow, "final_price" | "delivery_charge" | "advance_amount" | "status">, paid: number): Due {
  const total = orderTotal(order);
  const advance = Number(order.advance_amount ?? 0);
  const advanceLeft = Math.max(0, advance - paid);
  const balanceLeft = Math.max(0, total - paid);
  const awaitingAdvance = order.status === "approved" && advanceLeft > 0;
  return {
    total,
    paid,
    advance,
    payable: awaitingAdvance ? advanceLeft : balanceLeft,
    kind: awaitingAdvance ? "advance" : "balance",
  };
}

export async function paidTotal(orderId: string): Promise<number> {
  const { data } = await getServiceSupabase().from("custom_order_payments").select("amount").eq("custom_order_id", orderId).eq("status", "successful");
  return (data ?? []).reduce((s, p) => s + Number(p.amount), 0);
}

interface SettleResult {
  payment_id: string;
  custom_order_id: string;
  status: string;
  amount: number;
  paid_total: number;
  became_successful: boolean;
  entered_production: boolean;
}

async function settle(paymentId: string, status: string, gatewayStatus: string | null, trxId: string | null): Promise<SettleResult> {
  const { data, error } = await getServiceSupabase().rpc("custom_order_settle_payment", {
    p_payment_id: paymentId,
    p_status: status,
    p_gateway_status: gatewayStatus,
    p_trx_id: trxId,
  });
  if (error) throw new Error(explainDbError(error.message));
  const result = data as SettleResult;
  await notifySettled(result);
  return result;
}

/** Tells the customer about a payment that just went through. */
async function notifySettled(result: SettleResult): Promise<void> {
  if (!result.became_successful) return;
  const order = await findOrder({ id: result.custom_order_id });
  if (!order) return;
  await notifyCustomOrder(order, result.entered_production ? "custom_advance_received" : "custom_payment_received", {
    amount: formatMoney(Number(result.amount), resolveLocale(order.locale)),
  });
}

/** Starts an online payment for what is due now and returns the gateway's checkout link. */
export async function startCustomPayment(order: OrderRow): Promise<{ paymentId: string; checkoutUrl: string; amount: number }> {
  const gateway = getGateway(DEFAULT_GATEWAY);
  if (!gateway.isConfigured()) throw new Error("Online payment is not available right now.");

  const due = dueFor(order, await paidTotal(order.id));
  if (!(due.payable > 0)) throw new Error("Nothing is due on this order.");

  const db = getServiceSupabase();
  const { data: row, error } = await db
    .from("custom_order_payments")
    .insert({
      custom_order_id: order.id,
      kind: due.kind,
      method: gateway.code,
      amount: due.payable,
      status: "initiated",
      gateway: gateway.code,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(explainDbError(error?.message ?? "Could not record the payment"));

  const returnUrl = new URL(`/custom-jersey/order/${order.access_token}`, siteUrl());
  returnUrl.searchParams.set("payment", row.id);

  try {
    const created = await gateway.createPayment({
      amount: due.payable,
      orderId: order.order_number,
      idempotencyKey: row.id,
      returnUrl: returnUrl.toString(),
      metadata: { custom_order_payment_id: row.id, covers: due.kind },
    });
    if (!created.checkoutUrl) throw new Error("The gateway did not return a checkout link.");
    await db
      .from("custom_order_payments")
      .update({ gateway_payment_id: created.id, gateway_status: created.status, checkout_url: created.checkoutUrl })
      .eq("id", row.id);
    return { paymentId: row.id, checkoutUrl: created.checkoutUrl, amount: due.payable };
  } catch (err) {
    await db.from("custom_order_payments").update({ status: "failed", note: (err instanceof Error ? err.message : String(err)).slice(0, 300) }).eq("id", row.id);
    throw err;
  }
}

const GATEWAY_TO_STATUS: Record<string, string> = { completed: "successful", rejected: "failed", expired: "cancelled" };

/**
 * Reads the payment's state from the gateway and applies it. Returns null
 * when this gateway payment is not a custom-order payment, so the webhook
 * can tell "not ours" from a failure.
 */
export async function syncCustomGatewayPayment(gatewayCode: string, gatewayPaymentId: string): Promise<SettleResult | null> {
  const { data: row, error } = await getServiceSupabase()
    .from("custom_order_payments")
    .select("id")
    .eq("gateway", gatewayCode)
    .eq("gateway_payment_id", gatewayPaymentId)
    .maybeSingle();
  if (error || !row) return null;
  const remote = await getGateway(gatewayCode).getPayment(gatewayPaymentId);
  return settle(row.id, GATEWAY_TO_STATUS[remote.status] ?? "initiated", remote.status, remote.trxId);
}

export async function syncCustomPaymentById(paymentId: string): Promise<void> {
  const { data } = await getServiceSupabase().from("custom_order_payments").select("gateway, gateway_payment_id, status").eq("id", paymentId).maybeSingle();
  if (!data?.gateway || !data.gateway_payment_id || data.status !== "initiated") return;
  await syncCustomGatewayPayment(data.gateway, data.gateway_payment_id);
}

/** Turns custom_order_take_payment's error codes into a line staff can act on. */
function explainPaymentError(message: string): string {
  const [code, detail] = message.trim().split(":");
  if (code === "more_than_due") return `That is more than what is left to pay (৳${Number(detail ?? 0)})`;
  if (code === "not_payable") return "Money is taken only after the customer has confirmed the design";
  if (code === "session_not_open") return "Open the cash drawer first (Cash page), then take the cash";
  if (code === "invalid_payment_method") return "Choose how it was paid";
  if (code === "invalid_amount") return "Enter the amount";
  if (code === "order_not_found") return "Order not found";
  if (/custom_order_take_payment/.test(message) && /does not exist|schema cache|Could not find/i.test(message)) {
    return "Payment guard is not set up yet: the migration 20261119110000_custom_payment_guards.sql has not been applied.";
  }
  return explainDbError(message);
}

/**
 * Cash, card or a wallet transfer taken by staff (shop, COD on delivery).
 * Done in SQL under a lock on the order, so it can never go over the total.
 * atCounter: the money goes into the staff member's open cash drawer (cash needs one).
 */
export async function recordManualPayment(input: {
  order: OrderRow;
  amount: number;
  method: string;
  kind: "advance" | "balance" | "other";
  trxId?: string | null;
  note?: string | null;
  staffId: string;
  atCounter?: boolean;
}): Promise<SettleResult> {
  const { data, error } = await getServiceSupabase({ id: input.staffId }).rpc("custom_order_take_payment", {
    p: {
      actor: input.staffId,
      order_id: input.order.id,
      amount: input.amount,
      method: input.method,
      kind: input.kind,
      trx_id: input.trxId || null,
      note: input.note || null,
      at_counter: input.atCounter === true,
    },
  });
  if (error || !data) throw new Error(explainPaymentError(error?.message ?? "Could not record the payment"));
  const result = data as SettleResult;
  await notifySettled(result);
  return result;
}
