import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { canTransitionPayment } from "@/lib/payments/state-machine";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/admin/refunds
 * List all refund transactions.
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
    const status = url.searchParams.get("status");
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 25);

    let query = supabase
      .from("refund_transactions")
      .select(
        `
        id,
        original_payment_id,
        cancellation_id,
        return_id,
        user_id,
        amount,
        payment_method,
        status,
        processed_at,
        processed_by,
        transaction_ref,
        notes,
        created_at,
        updated_at,
        payments!inner(type, provider, order_id)
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);

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
 * POST /api/admin/refunds
 * Create a refund transaction.
 */
export async function POST(request: NextRequest) {
  let admin: { user: { id: string; email?: string } };
  try {
    admin = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const {
      original_payment_id,
      cancellation_id,
      return_id,
      amount,
      payment_method,
      notes,
    } = body;

    if (!original_payment_id || !amount) {
      return NextResponse.json(
        { error: "original_payment_id and amount are required" },
        { status: 400 }
      );
    }

    // Verify the original payment exists and is successful
    const { data: originalPayment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status, type, amount, order_id, user_id")
      .eq("id", original_payment_id)
      .single();

    if (paymentError || !originalPayment) {
      return NextResponse.json({ error: "Original payment not found" }, { status: 404 });
    }

    if (!canTransitionPayment(originalPayment.status, "refunded")) {
      return NextResponse.json(
        { error: `Cannot refund payment in '${originalPayment.status}' status` },
        { status: 400 }
      );
    }

    // Create refund transaction
    const { data: refund, error: refundError } = await supabase
      .from("refund_transactions")
      .insert({
        original_payment_id,
        cancellation_id: cancellation_id || null,
        return_id: return_id || null,
        user_id: originalPayment.user_id || null,
        amount: Number(amount),
        payment_method: payment_method || "cod",
        status: "pending",
        notes: notes || null,
        processed_by: admin.user.id,
      })
      .select()
      .single();

    if (refundError) {
      return NextResponse.json({ error: refundError.message }, { status: 500 });
    }

    // Update original payment to refunded
    await supabase
      .from("payments")
      .update({ status: "refunded" })
      .eq("id", original_payment_id);

    return NextResponse.json({ data: refund }, { status: 201 });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * PATCH /api/admin/refunds
 * Update refund status.
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
    const { id, status, transaction_ref, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Refund id is required" }, { status: 400 });
    }

    const validStatuses = ["pending", "processed", "failed", "cancelled"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400}
      );
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (transaction_ref !== undefined) updates.transaction_ref = transaction_ref;
    if (notes !== undefined) updates.notes = notes;
    if (status === "processed") updates.processed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("refund_transactions")
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
 * DELETE /api/admin/refunds?id=:id
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
      return NextResponse.json({ error: "Refund id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("refund_transactions").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    return handleAdminError(error);
  }
}