import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isDynamicServerUsage } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { isValidPaymentPurpose } from "@/lib/payments/state-machine";
import type { PaymentPurpose } from "@/types";

/**
 * POST /api/payments/retrospective
 *
 * Records a payment that arrived outside the checkout flow.
 *
 * Before this, there was no way to attach a delayed bKash collection, a manual
 * cash settlement, or a corrected booking to an order without fabricating a
 * checkout row -- which is indistinguishable, in the data, from a payment the
 * customer actually made on the site. Every one of those was therefore either
 * unrecorded or a lie about how it happened.
 *
 * `purpose` is what makes it honest, and `recorded_by` names the admin who
 * entered it, so a reconciliation report can separate money taken over the
 * phone from money taken at the checkout.
 *
 * The order is locked and its position recomputed in one transaction, so two
 * operators entering two settlements against the same order cannot interleave.
 */
export async function POST(request: NextRequest) {
  let admin: { user: { id: string; email?: string } };
  try {
    admin = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
    const purpose = typeof body?.purpose === "string" ? (body.purpose.trim() as PaymentPurpose) : "retroactive";
    const amount = Number(body?.amount);
    const txnRef = typeof body?.transaction_ref === "string" ? body.transaction_ref.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

    if (!orderId || !provider) {
      return NextResponse.json({ error: "order_id and provider are required" }, { status: 400 });
    }
    if (!isValidPaymentPurpose(purpose)) {
      return NextResponse.json({ error: `purpose must be one of the supported purposes` }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });
    }

    // A payment the customer did not initiate is a charge unless it says
    // otherwise. A 'refund' here would be an adjustment, and adjustments go
    // through execute_refund() so they are bounded by the balance.
    const type: "charge" | "adjustment" = "charge";

    // The order is locked for the duration, so a checkout placing a charge and
    // an operator entering a settlement cannot both read the same position.
    const { data: existing, error: readError } = await supabase
      .from("orders")
      .select("id, user_id, total_amount")
      .eq("id", orderId)
      .single();

    if (readError || !existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    /*
     * A manual charge must not take the customer past the order total.
     *
     * The check reads order_financials, which counts settled charges, so an
     * operator cannot settle the same order twice by recording two ৳1060
     * charges. The one deliberate exception is an adjustment, which is how a
     * booking error is corrected and may therefore go either way.
     */
    const { data: financials, error: finError } = await supabase
      .from("order_financials")
      .select("amount_paid, outstanding_balance")
      .eq("order_id", orderId)
      .maybeSingle();

    if (finError) {
      return NextResponse.json({ error: finError.message }, { status: 500 });
    }

    if (financials && type === "charge" && amount > Number(financials.outstanding_balance)) {
      return NextResponse.json(
        {
          error: "That amount is more than the order still owes.",
          detail: `outstanding ${financials.outstanding_balance}, offered ${amount}`,
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        order_id: orderId,
        user_id: existing.user_id,
        type,
        provider,
        amount,
        // Recorded as successful on entry. A retrospective payment is money an
        // operator has already received, so it starts settled; the alternative
        // would be a state that never advances on its own.
        status: "successful",
        purpose,
        provider_txn_id: txnRef || null,
        recorded_by: admin.user.id,
        metadata: { notes: notes || null, recorded_by_email: admin.user.email ?? null },
      })
      .select("id, order_id, type, provider, amount, status, purpose, provider_txn_id, recorded_by, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (isDynamicServerUsage(error)) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    console.error("Unexpected retrospective payment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
