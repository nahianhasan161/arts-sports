import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isDynamicServerUsage } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { canTransitionPayment, calculateNetPayment } from "@/lib/payments/state-machine";
import type { OrderFinancials, Payment } from "@/types";

/**
 * GET /api/orders/[id]/financials
 *
 * The money position of one order, read from the order_financials view.
 *
 * This is what the admin order-detail money panel reads, and the only place the
 * paid / refunded / refundable figures come from. Nothing computes them in the
 * client: the alternative is a figure the client derives from a list it only
 * partly fetched, which is how a refundable balance ends up disagreeing with the
 * one the refund RPC checks against.
 *
 * It returns the payments ledger too, so a panel can show what actually
 * happened without a second request -- and the ledger is what the numbers are
 * derived from, so showing them together makes a discrepancy visible.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const orderId = params.id;

    // The view and the ledger are fetched together. The view is a LEFT JOIN
    // over payments, so an order with no payment rows still appears, with
    // zeros -- which is the truth for an unpaid cash-on-delivery order and is
    // exactly what the refund guard needs to refuse.
    const [financials, ledger] = await Promise.all([
      supabase
        .from("order_financials")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle(),
      supabase
        .from("payments")
        .select(
          "id, type, provider, amount, status, purpose, refund_of_payment_id, provider_txn_id, recorded_by, created_at"
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
    ]);

    if (financials.error) {
      return NextResponse.json({ error: financials.error.message }, { status: 500 });
    }
    if (ledger.error) {
      return NextResponse.json({ error: ledger.error.message }, { status: 500 });
    }
    if (!financials.data) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const summary = financials.data as OrderFinancials;
    const payments = (ledger.data ?? []) as Payment[];

    /*
     * The net effect of the ledger, computed from the same rule the view uses:
     * only a settled transaction moves money.
     *
     * Returned alongside the view's own figures so a caller can see them agree.
     * calculateNetPayment has existed since the payments table was split out and
     * was called by nothing until now; this is its first real use.
     */
    const netFromLedger = payments.reduce(
      (sum, p) => sum + calculateNetPayment(Number(p.amount), p.type, p.status),
      0
    );

    return NextResponse.json({
      data: {
        ...summary,
        net_position: Number(summary.net_position),
        amount_paid: Number(summary.amount_paid),
        amount_refunded: Number(summary.amount_refunded),
        refundable_balance: Number(summary.refundable_balance),
        refundable_now: Number(summary.refundable_now),
      },
      payments,
      // Which charges could still take a refund, and into which status, so the
      // UI can disable a button rather than let the admin discover the rule
      // through a failed request.
      refund_targets: payments
        .filter((p) => p.type === "charge" && canTransitionPayment(p.status, "partially_refunded"))
        .map((p) => ({
          payment_id: p.id,
          provider: p.provider,
          amount: p.amount,
          status: p.status,
        })),
      agreement: {
        net_position_from_view: Number(summary.net_position),
        net_position_from_ledger: netFromLedger,
        // These must always match. If they ever diverge, the view has drifted
        // from the rows it claims to summarise, and that is a bug worth failing
        // loudly on rather than showing one number over the other.
        consistent: Number(netFromLedger.toFixed(2)) === Number(Number(summary.net_position).toFixed(2)),
      },
    });
  } catch (error) {
    if (isDynamicServerUsage(error)) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    console.error("Unexpected order financials error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
