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

/**
 * Applies an approved cancellation.
 *
 * The refund path now goes through execute_refund(), the single entry point for
 * money leaving the system. It used to insert a refund_transactions row directly,
 * which was one of the three refund writers with no shared check -- so a
 * cancellation could record a refund larger than the order had ever paid.
 *
 * The distinction between voiding and refunding was also wrong. A charge that
 * settled is money the customer gave us: cancelling it does nothing to get it
 * back, and marking it cancelled simply removed it from amount_paid while the
 * customer's money stayed with the store. A settled charge is therefore
 * refunded. Only a charge still in 'initiated' is voided, which is correct
 * because it never collected anything.
 */
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
        cancelled_at: cancellation.updated_at ?? new Date().toISOString(),
        cancelled_by: adminUserId,
        cancellation_id: cancellationId,
      })
      .eq("id", order_id);

    const { data: charges } = await supabase
      .from("payments")
      .select("id, status, amount, provider")
      .eq("order_id", order_id)
      .eq("type", "charge");

    for (const payment of charges || []) {
      // Void only what never settled. A settled charge leaves through
      // execute_refund() below, so the customer's money is actually returned
      // rather than the row being quietly relabelled.
      if (payment.status === "initiated") {
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
    }

    // Refund the settled charge, through the one entry point.
    const settled = (charges || []).find(
      (p) => p.status === "successful" || p.status === "partially_refunded"
    );
    const wanted = Number(refund_amount ?? 0);

    if (settled && wanted > 0) {
      await refundSettledItems(supabase, {
        orderId: order_id,
        chargeId: settled.id,
        provider: settled.provider,
        cancellationId,
        userId: cancellation.user_id,
        wanted,
        reason: cancellation.reason,
        // A cancellation that refunds less than the goods is common -- the
        // customer has had the parcel for a few days, or changes their mind --
        // so the difference is recorded as a deduction rather than disappearing.
        note: "Cancellation refund",
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

/**
 * Refunds the whole order by its settled items, then adds a deduction for any
 * difference between the goods and the amount the admin approved.
 *
 * Building the quote from the order's own lines means item_total is the order
 * total and the approved figure is reached by subtraction, which makes the
 * shortfall an explicit deduction row instead of an unexplained smaller number.
 */
async function refundSettledItems(
  supabase: SupabaseClient,
  args: {
    orderId: string;
    chargeId: string;
    provider: string;
    cancellationId: string | null;
    userId: string | null;
    wanted: number;
    reason: string;
    note: string;
  }
) {
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, quantity, unit_price")
    .eq("order_id", args.orderId);

  if (!orderItems || orderItems.length === 0) return;

  const items = orderItems.map((it) => ({
    order_item_id: it.id,
    quantity: Number(it.quantity),
    unit_refund: Number(it.unit_price),
  }));

  const itemTotal = items.reduce((sum, it) => sum + it.unit_refund * it.quantity, 0);
  const shortfall = Math.round((itemTotal - args.wanted) * 100) / 100;

  const payload: Record<string, unknown> = {
    order_id: args.orderId,
    original_payment_id: args.chargeId,
    provider: args.provider,
    reason: args.reason,
    notes: args.note,
    cancellation_id: args.cancellationId,
    items,
  };

  if (shortfall > 0) {
    payload.deductions = [
      {
        kind: "customer_request",
        label: "Approved refund below merchandise value",
        amount: shortfall,
        notes: "Set when the cancellation was approved.",
      },
    ];
  }

  const { error } = await supabase.rpc("execute_refund", { payload });

  if (error) {
    /*
     * A cancellation must not half-apply. execute_refund() runs in its own
     * transaction, so a refusal here leaves no partial rows, but the caller
     * has already marked the order cancelled -- so the error is surfaced as a
     * rejection rather than swallowed, and the admin has to resolve it
     * deliberately rather than discovering an unrefunded cancelled order later.
     */
    throw new Error(`refund_failed: ${error.message}`);
  }
}

// Types
import type { CancellationStatus } from "@/types";