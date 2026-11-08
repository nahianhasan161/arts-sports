import { NextResponse } from "next/server";
import { syncPaymentById } from "@/lib/payments/online";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";

/**
 * GET /api/payments/online/<paymentId>
 *
 * Called by the page the customer returns to after paying. It refreshes the
 * payment from the gateway (so the order is confirmed even if the webhook is
 * late) and reports a minimal status. The payment id is an unguessable UUID
 * that only the customer's own return URL carries, and the response holds no
 * personal data.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isServiceSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    await syncPaymentById(paymentId);
  } catch (err) {
    // The stored state is still worth returning; the webhook will catch up.
    console.error("Payment sync on return failed:", err);
  }

  const { data } = await getServiceSupabase()
    .from("payments")
    .select("status, gateway_status, amount, order_id, checkout_url")
    .eq("id", paymentId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    status: data.status,
    gateway_status: data.gateway_status,
    amount: Number(data.amount),
    order_id: data.order_id,
    // Lets the customer go back and finish paying if they left early.
    checkout_url: data.status === "initiated" ? data.checkout_url : null,
  });
}
