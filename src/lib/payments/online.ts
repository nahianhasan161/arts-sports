import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { notifyOrderEvent } from "@/lib/notifications";
import { sendCapiEvent } from "@/lib/tracking/capi";
import { DEFAULT_GATEWAY, getGateway, type GatewayPayment } from "./gateway";
import type { PaymentPurpose } from "@/types";

/**
 * Online payments, independent of what they pay for.
 *
 * The same two calls serve every place money is taken online: the full
 * order total, only the COD delivery charge, a custom jersey's 30% advance,
 * or a POS bill paid by QR. Each attempt is one payments row; its id is the
 * gateway's Idempotency-Key, so retrying a start never creates a second
 * charge at the gateway.
 */

export interface StartOnlinePaymentInput {
  orderId: string;
  amount: number;
  userId?: string | null;
  purpose?: PaymentPurpose;
  /** Path on this site the customer returns to, e.g. /order/<id>/confirmed */
  returnPath: string;
  /** What this payment covers, for staff: "full", "delivery_charge", "advance", ... */
  covers?: string;
  gateway?: string;
}

export interface StartedOnlinePayment {
  paymentId: string;
  checkoutUrl: string;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export async function startOnlinePayment(input: StartOnlinePaymentInput): Promise<StartedOnlinePayment> {
  const gatewayCode = input.gateway ?? DEFAULT_GATEWAY;
  const gateway = getGateway(gatewayCode);
  if (!gateway.isConfigured()) {
    throw new Error(`${gatewayCode} is not configured (missing API base or key).`);
  }
  if (!(input.amount > 0)) throw new Error("Payment amount must be positive.");

  const db = getServiceSupabase();
  const { data: row, error } = await db
    .from("payments")
    .insert({
      order_id: input.orderId,
      user_id: input.userId ?? null,
      type: "charge",
      provider: gatewayCode,
      gateway: gatewayCode,
      amount: input.amount,
      status: "initiated",
      purpose: input.purpose ?? "checkout",
      metadata: { recorded_by: "online_payment", covers: input.covers ?? "full" },
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`Could not record the payment: ${error?.message ?? "no row"}`);

  const returnUrl = new URL(input.returnPath, siteUrl());
  returnUrl.searchParams.set("payment", row.id);

  let created: GatewayPayment;
  try {
    created = await gateway.createPayment({
      amount: input.amount,
      orderId: input.orderId,
      idempotencyKey: row.id,
      returnUrl: returnUrl.toString(),
      metadata: { payment_id: row.id, covers: input.covers ?? "full" },
    });
  } catch (err) {
    await db
      .from("payments")
      .update({
        status: "failed",
        metadata: {
          recorded_by: "online_payment",
          covers: input.covers ?? "full",
          start_error: err instanceof Error ? err.message : String(err),
        },
      })
      .eq("id", row.id);
    throw err;
  }

  if (!created.checkoutUrl) throw new Error("The gateway did not return a checkout link.");

  const { error: updateError } = await db
    .from("payments")
    .update({
      gateway_payment_id: created.id,
      gateway_status: created.status,
      checkout_url: created.checkoutUrl,
      gateway_synced_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updateError) throw new Error(`Could not save the gateway payment id: ${updateError.message}`);

  return { paymentId: row.id, checkoutUrl: created.checkoutUrl };
}

export interface SyncResult {
  payment_id: string;
  order_id: string;
  previous_status: string;
  status: string;
  gateway_status: string;
  order_status: string | null;
  became_successful: boolean;
}

/**
 * Pulls the payment's current state from the gateway and stores it.
 *
 * The webhook calls this rather than trusting the event body, and the
 * return page calls it too, so an order is confirmed even when the webhook
 * is late or lost.
 */
export async function syncGatewayPayment(gatewayCode: string, gatewayPaymentId: string): Promise<SyncResult> {
  const gateway = getGateway(gatewayCode);
  const remote = await gateway.getPayment(gatewayPaymentId);

  const db = getServiceSupabase();
  const { data, error } = await db.rpc("apply_gateway_payment_update", {
    p_gateway: gatewayCode,
    p_gateway_payment_id: gatewayPaymentId,
    p_gateway_status: remote.status,
    p_trx_id: remote.trxId,
    p_details: {
      provider: remote.provider,
      review_reason: remote.reviewReason,
      amount: remote.amount,
    },
  });
  if (error) throw new Error(error.message);
  const result = data as SyncResult;

  if (result.became_successful) {
    // Best effort: a failed message must not undo a confirmed payment.
    await notifyOrderEvent(result.order_id, "payment_received").catch((err) =>
      console.error("payment_received notification failed:", err)
    );
    await sendPurchaseEvent(result.order_id).catch((err) => console.error("Meta Purchase event failed:", err));
  }
  return result;
}

/** Sync by our own payments.id (used by the return page). */
export async function syncPaymentById(paymentId: string): Promise<SyncResult | null> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("payments")
    .select("gateway, gateway_payment_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!data?.gateway || !data.gateway_payment_id) return null;
  return syncGatewayPayment(data.gateway, data.gateway_payment_id);
}

/**
 * Meta Purchase from the server once an order's first payment lands. The
 * order page fires the browser pixel with the same event id.
 */
async function sendPurchaseEvent(orderId: string) {
  const db = getServiceSupabase();
  const { data: order } = await db
    .from("orders")
    .select("id, total_amount, customer_name, customer_phone, customer_email, district, order_items(product_id, quantity)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const items = (order.order_items ?? []) as { product_id: string; quantity: number }[];
  await sendCapiEvent({
    name: "Purchase",
    eventId: `purchase-${order.id}`,
    value: Number(order.total_amount),
    contentIds: items.map((i) => i.product_id),
    numItems: items.reduce((s, i) => s + i.quantity, 0),
    orderId: order.id,
    user: {
      phone: order.customer_phone,
      email: order.customer_email,
      name: order.customer_name,
      district: order.district,
      externalId: order.customer_phone,
    },
  });
}
