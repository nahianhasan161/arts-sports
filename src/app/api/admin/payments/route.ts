import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isDynamicServerUsage } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/admin/payments
 * Returns all payments, optionally filtered by order_id or status.
 * Admin-only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const url = new URL(request.url);
    const orderId = url.searchParams.get("order_id");
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const provider = url.searchParams.get("provider");
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 100);

    let query = supabase
      .from("payments")
      .select(
        `
        id,
        order_id,
        user_id,
        type,
        provider,
        provider_txn_id,
        amount,
        status,
        metadata,
        created_at,
        updated_at,
        orders!inner (customer_name, total_amount, payment_method)
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (orderId) query = query.eq("order_id", orderId);
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (provider) query = query.eq("provider", provider);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, count });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/payments
 * Record a charge for an order, or a COD settlement.
 * Admin-only.
 *
 * A refund is NOT accepted here.
 *
 * This endpoint used to accept `type: 'refund'` and insert the row directly,
 * which bypassed every guard in execute_refund(): the refundable-balance check,
 * the per-line quantity limit, the deduction arithmetic, and the derived
 * payment status. An admin could therefore record a refund of any size, with no
 * items and no deductions, and leave the charge marked 'successful' because
 * nothing recomputed it.
 *
 * Refunds now go through POST /api/admin/refunds, which is the single entry
 * point and enforces all of it. This route keeps the raw insert for the case it
 * exists for: recording money that arrived.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { order_id, type, provider, amount, provider_txn_id, status, metadata } = body;

    if (!order_id || !type || !amount) {
      return NextResponse.json(
        { error: "order_id, type, and amount are required" },
        { status: 400 }
      );
    }

    if (type === "refund") {
      // A pointer, not just a refusal: the caller needs to know where to go and
      // what to send, or this is a dead end that pushes them back to guessing.
      return NextResponse.json(
        {
          error: "Refunds must be recorded through /api/admin/refunds, which validates the amount against what the order has paid.",
          reason: "refund_not_allowed_here",
          detail:
            "POST /api/admin/refunds with { order_id, original_payment_id, provider, items, deductions? }.",
        },
        { status: 409 }
      );
    }

    if (type !== "charge" && type !== "chargeback") {
      return NextResponse.json(
        { error: "type must be one of: charge, chargeback" },
        { status: 400 }
      );
    }

    /*
     * A manual charge may not take the customer past the order total.
     *
     * This is the same guard POST /api/payments/retrospective applies, and it is
     * missing here only because this route predates it. Without it an operator
     * can record two ৳1060 charges against a ৳1060 order and the order's
     * amount_paid doubles, which then doubles every refundable balance derived
     * from it.
     */
    const { data: outstanding, error: finError } = await supabase
      .from("order_financials")
      .select("amount_paid, outstanding_balance")
      .eq("order_id", order_id)
      .maybeSingle();

    if (finError) {
      return NextResponse.json({ error: finError.message }, { status: 500 });
    }

    // No row means no payments of any kind, so the outstanding balance is the
    // order's own total.
    let limit = Number(outstanding?.outstanding_balance ?? 0);
    if (!outstanding) {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("total_amount")
        .eq("id", order_id)
        .single();
      limit = Number(orderRow?.total_amount ?? 0);
    }

    const offered = Number(amount);
    if (offered > limit) {
      return NextResponse.json(
        {
          error: "That amount is more than the order still owes.",
          reason: "amount_exceeds_outstanding",
          detail: `outstanding ${limit.toFixed(2)}, offered ${offered.toFixed(2)}`,
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        order_id,
        type,
        provider: provider || "cod",
        amount: Number(amount),
        provider_txn_id: provider_txn_id || null,
        // 'successful' is the honest default here: an operator recording a
        // charge is recording money already in hand, so a row parked at
        // 'initiated' would never advance on its own.
        status: status || "successful",
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (!isDynamicServerUsage(error)) {
      console.error("Unexpected payments create error:", error);
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/payments
 * Update a payment's status (e.g. mark COD charge as successful, or
 * mark a refund as completed). Admin-only.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { id, status, provider_txn_id, metadata } = body;

    if (!id) {
      return NextResponse.json({ error: "Payment id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (provider_txn_id !== undefined) updates.provider_txn_id = provider_txn_id;
    if (metadata !== undefined) updates.metadata = metadata;

    const { data, error } = await supabase
      .from("payments")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * DELETE /api/admin/payments/:id
 * Delete a payment transaction. Admin-only.
 */
export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Payment id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("payments").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    return handleAdminError(error);
  }
}