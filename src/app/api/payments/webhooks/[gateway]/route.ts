import { NextResponse } from "next/server";
import { getGateway, WebhookVerificationError } from "@/lib/payments/gateway";
import { syncGatewayPayment } from "@/lib/payments/online";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * POST /api/payments/webhooks/<gateway>
 *
 * For UnivaPayment the URL to enter in its dashboard is
 *   https://<site>/api/payments/webhooks/univapayment
 *
 * Steps: verify the signature on the raw body, store the event once (a retry
 * of the same event_id is acknowledged and skipped), then re-read the payment
 * from the gateway and apply that. The event body itself is never trusted for
 * the status, so a forged or out-of-order event cannot confirm an order.
 */
export async function POST(request: Request, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway: code } = await params;

  let gateway;
  try {
    gateway = getGateway(code);
  } catch {
    return NextResponse.json({ error: "Unknown gateway" }, { status: 404 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = await gateway.handleWebhook(request.headers, rawBody);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const db = getServiceSupabase();

  const { data: stored, error: storeError } = await db
    .from("payment_webhooks")
    .insert({
      provider: code,
      event_type: event.event,
      provider_event_id: event.eventId,
      payload: event.raw,
    })
    .select("id")
    .single();

  if (storeError) {
    // 23505: this event_id was stored before, i.e. a retried delivery.
    if (storeError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("Could not store webhook:", storeError.message);
    return NextResponse.json({ error: "Could not store event" }, { status: 500 });
  }

  if (!event.paymentId) {
    await db
      .from("payment_webhooks")
      .update({ processed: true, processed_at: new Date().toISOString(), error: "no payment id in event" })
      .eq("id", stored.id);
    return NextResponse.json({ received: true });
  }

  try {
    const result = await syncGatewayPayment(code, event.paymentId);
    await db
      .from("payment_webhooks")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", stored.id);
    return NextResponse.json({ received: true, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("payment_webhooks")
      .update({ processed: false, error: message.slice(0, 500) })
      .eq("id", stored.id);

    // A payment we never created (another integration on the same merchant)
    // is acknowledged so the gateway stops retrying it.
    if (message.includes("gateway_payment_not_found")) {
      return NextResponse.json({ received: true, ignored: true });
    }
    // Anything else: a 500 makes the gateway retry later. The stored row
    // would block the retry as a duplicate, so remove it first.
    await db.from("payment_webhooks").delete().eq("id", stored.id);
    console.error("Webhook processing failed:", message);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
