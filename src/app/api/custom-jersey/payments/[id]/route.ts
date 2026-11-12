import { NextResponse } from "next/server";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { syncCustomPaymentById } from "@/lib/custom-jersey/server";

/**
 * GET /api/custom-jersey/payments/<id>
 * Called when the customer comes back from the gateway: refreshes the
 * payment so the order moves on even if the webhook is late. The id is an
 * unguessable UUID from the customer's own return URL; no personal data is returned.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isServiceSupabaseConfigured()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await syncCustomPaymentById(id);
  } catch (err) {
    console.error("Custom payment sync on return failed:", err);
  }
  const { data } = await getServiceSupabase().from("custom_order_payments").select("status, gateway_status, amount, checkout_url").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    status: data.status,
    gateway_status: data.gateway_status,
    amount: Number(data.amount),
    checkout_url: data.status === "initiated" ? data.checkout_url : null,
  });
}
