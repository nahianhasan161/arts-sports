import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { notifyOrderEvent } from "@/lib/notifications";
import { pathao } from "./pathao";
import { steadfast } from "./steadfast";
import { CourierError, type CourierAdapter, type CourierCode, type ParcelState, type ParcelUpdate } from "./types";

export * from "./types";

const ADAPTERS: Record<CourierCode, CourierAdapter> = { steadfast, pathao };

export function getCourier(code: string): CourierAdapter | null {
  return (ADAPTERS as Record<string, CourierAdapter>)[code] ?? null;
}

export function listCouriers() {
  return Object.values(ADAPTERS).map((c) => ({ code: c.code, label: c.label, configured: c.isConfigured() }));
}

/** Courier for an order by the admin rule (Dhaka -> Pathao, outside -> Steadfast by default). */
export async function pickCourier(city: string | null): Promise<CourierCode> {
  const db = getServiceSupabase();
  const outside = /outside/i.test(city ?? "");
  const key = outside ? "courier_outside" : "courier_dhaka";
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  const chosen = getCourier(data?.value ?? "") ?? (outside ? steadfast : pathao);
  // Fall back to whichever courier is set up.
  if (!chosen.isConfigured()) {
    const other = Object.values(ADAPTERS).find((c) => c.isConfigured());
    if (other) return other.code;
  }
  return chosen.code;
}

/** Books the parcel for an order and saves the consignment on it. */
export async function bookOrder(orderId: string, courierCode?: string) {
  const db = getServiceSupabase();
  const { data: order, error } = await db
    .from("orders")
    .select(
      "id, customer_name, customer_phone, delivery_address, address_line, district, thana, city, total_amount, status, notes, courier_consignment_id, order_items(title, quantity)"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new CourierError("Order not found", 404);
  if (order.courier_consignment_id) throw new CourierError("This order already has a parcel booked", 409);
  if (order.status === "cancelled") throw new CourierError("This order is cancelled", 409);

  const code = (courierCode as CourierCode) || (await pickCourier(order.city));
  const courier = getCourier(code);
  if (!courier) throw new CourierError(`Unknown courier ${code}`, 400);
  if (!courier.isConfigured()) throw new CourierError(`${courier.label} API keys are not set yet`, 503);

  // What the rider collects: the total minus everything paid online.
  const { data: paid } = await db
    .from("payments")
    .select("amount")
    .eq("order_id", orderId)
    .eq("type", "charge")
    .eq("status", "successful");
  const paidTotal = (paid ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const cod = Math.max(0, Number(order.total_amount) - paidTotal);

  const items = (order.order_items ?? []) as { title: string; quantity: number }[];
  const parcel = await courier.book({
    orderId: order.id,
    name: order.customer_name,
    phone: order.customer_phone,
    address: order.address_line || order.delivery_address,
    district: order.district,
    thana: order.thana,
    codAmount: cod,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    description: items.map((i) => `${i.quantity}x ${i.title}`).join(", "),
    note: order.notes,
  });

  await db
    .from("orders")
    .update({
      courier: courier.code,
      courier_consignment_id: parcel.consignmentId,
      courier_tracking_code: parcel.trackingCode,
      courier_status: parcel.state,
      courier_booked_at: new Date().toISOString(),
      courier_fee: parcel.fee,
      cod_expected: cod,
      status: order.status === "pending" ? "processing" : order.status,
    })
    .eq("id", order.id);

  await db.from("courier_events").insert({
    courier: courier.code,
    order_id: order.id,
    consignment_id: parcel.consignmentId,
    status: `booked:${parcel.state}`,
    payload: parcel.raw as object,
  });

  return { courier: courier.code, ...parcel, codAmount: cod };
}

const ORDER_STATUS_FOR: Partial<Record<ParcelState, string>> = {
  picked: "shipped",
  in_transit: "shipped",
  delivered: "delivered",
  partial: "delivered",
};

/** Applies a courier webhook or status check to the order. */
export async function applyParcelUpdate(courier: CourierCode, update: ParcelUpdate) {
  const db = getServiceSupabase();
  let query = db
    .from("orders")
    .select("id, status, courier, courier_status, courier_tracking_code, courier_consignment_id, customer_phone, shipped_at");
  query = update.consignmentId
    ? query.eq("courier", courier).eq("courier_consignment_id", update.consignmentId)
    : query.eq("id", update.orderId ?? "");
  const { data: order } = await query.maybeSingle();

  await db.from("courier_events").insert({
    courier,
    order_id: order?.id ?? null,
    consignment_id: update.consignmentId,
    status: update.rawStatus,
    payload: update.raw as object,
  });
  if (!order) return { matched: false };

  const patch: Record<string, unknown> = { courier_status: update.state };
  const nextStatus = ORDER_STATUS_FOR[update.state];
  // Never move an order backwards (a late "in transit" after "delivered").
  const rank = (s: string) => ["pending", "processing", "shipped", "delivered"].indexOf(s);
  const moves = nextStatus && rank(nextStatus) > rank(order.status);
  if (moves) patch.status = nextStatus;
  if (nextStatus === "shipped" && !order.shipped_at) patch.shipped_at = new Date().toISOString();
  if (update.state === "delivered" || update.state === "partial") {
    patch.delivered_at = new Date().toISOString();
    if (update.codCollected != null) patch.cod_collected = update.codCollected;
  }
  if (update.fee != null) patch.courier_fee = update.fee;
  await db.from("orders").update(patch).eq("id", order.id);

  if (moves) {
    const adapter = getCourier(courier);
    const trackingUrl =
      adapter && order.courier_consignment_id
        ? adapter.trackingUrl({
            consignmentId: order.courier_consignment_id,
            trackingCode: order.courier_tracking_code,
            phone: order.customer_phone,
          })
        : null;
    const template = nextStatus === "delivered" ? "order_delivered" : "order_shipped";
    notifyOrderEvent(order.id, template, {
      courier: adapter?.label ?? courier,
      tracking: trackingUrl ?? order.courier_tracking_code ?? "",
    }).catch((err) => console.error("Courier notification failed:", err));
  }
  return { matched: true, orderId: order.id, state: update.state };
}
