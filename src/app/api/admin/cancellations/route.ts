import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { validateCancellationTransition, isExecutionEligible } from "@/lib/cancellations/state-machine";
import type { Cancellation } from "@/types";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/admin/cancellations
 * Admin view all cancellations with filters.
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
    const type = url.searchParams.get("type");
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 25);

    let query = supabase
      .from("cancellations")
      .select(
        `
        id,
        order_id,
        user_id,
        type,
        reason,
        reason_category,
        status,
        refund_amount,
        refund_payment_id,
        notes,
        requested_at,
        reviewed_at,
        reviewed_by,
        executed_at,
        created_at,
        updated_at
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);

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
 * POST /api/admin/cancellations
 * Admin creates a cancellation on behalf of a customer.
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
    const {
      order_id,
      user_id,
      type,
      reason,
      reason_category,
      refund_amount,
      notes,
    } = body;

    if (!order_id || !type || !reason || !reason_category) {
      return NextResponse.json(
        { error: "order_id, type, reason, and reason_category are required" },
        { status: 400 }
      );
    }

    const validTypes = ["order", "payment", "return"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cancellations")
      .insert({
        order_id,
        user_id: user_id || null,
        type,
        reason,
        reason_category,
        refund_amount: refund_amount ? Number(refund_amount) : 0,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * PATCH /api/admin/cancellations
 * Admin review + execution actions.
 */
export async function PATCH(request: NextRequest) {
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
    const { id, action, notes, refund_amount } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const validActions = ["approve", "reject", "execute", "cancel"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch current cancellation
    const { data: cancellation, error: fetchError } = await supabase
      .from("cancellations")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !cancellation) {
      return NextResponse.json({ error: "Cancellation not found" }, { status: 404 });
    }

    const currentStatus = cancellation.status as CancellationStatus;

    // Validate transition
    let newStatus: CancellationStatus;
    switch (action) {
      case "approve":
        newStatus = "approved";
        break;
      case "reject":
        newStatus = "rejected";
        break;
      case "execute":
        if (!isExecutionEligible(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot execute cancellation in '${currentStatus}' status. Must be 'approved'.` },
            { status: 400}
          );
        }
        newStatus = "executed";
        break;
      case "cancel":
        newStatus = "cancelled";
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    try {
      validateCancellationTransition(currentStatus, newStatus);
    } catch (validationError) {
      return NextResponse.json({ error: String(validationError) }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: newStatus,
    };

    if (action === "approve" || action === "execute") {
      updates.reviewed_at = now;
      updates.reviewed_by = admin.user.id;
    }

    if (action === "execute") {
      updates.executed_at = now;
      if (refund_amount !== undefined) {
        updates.refund_amount = Number(refund_amount);
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    const { data, error } = await supabase
      .from("cancellations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If executing, perform downstream actions based on type
    if (action === "execute") {
      await executeCancellation(supabase, cancellation, admin.user.id);
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAdminError(error);
  }
}

async function executeCancellation(
  supabase: SupabaseClient,
  cancellation: Cancellation,
  adminUserId: string
) {
  const { type, order_id, refund_amount, id: cancellationId, refund_payment_id } = cancellation;

  if (type === "order") {
    // Update order status to cancelled
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminUserId,
        cancellation_id: cancellationId,
      })
      .eq("id", order_id);

    // Cancel successful charges on this order
    const { data: payments } = await supabase
      .from("payments")
      .select("id, status, amount")
      .eq("order_id", order_id)
      .eq("type", "charge")
      .eq("status", "successful");

    for (const payment of payments || []) {
      await supabase
        .from("payments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: adminUserId,
          cancellation_id: cancellationId,
        })
        .eq("id", payment.id);
    }

    // Create refund transaction if refund amount > 0 and there's a payment to refund
    if (refund_amount && refund_amount > 0 && refund_payment_id) {
      await supabase.from("refund_transactions").insert({
        original_payment_id: refund_payment_id,
        cancellation_id: cancellationId,
        user_id: cancellation.user_id,
        amount: Number(refund_amount),
         payment_method: "cod",
        status: "pending",
        processed_by: adminUserId,
      });
    }
  }

  if (type === "payment" && refund_payment_id) {
    // Cancel the payment
    await supabase
      .from("payments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminUserId,
        cancellation_id: cancellationId,
      })
      .eq("id", refund_payment_id);
  }

  if (type === "return") {
    // Update return status to cancelled
    await supabase
      .from("returns")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminUserId,
        cancellation_id: cancellationId,
      })
      .eq("order_id", order_id)
      .in("status", ["requested", "approved", "received"]);
  }
}

// Types
import type { CancellationStatus } from "@/types";