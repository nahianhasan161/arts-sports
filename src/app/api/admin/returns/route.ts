import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { checkReturnableQuantity } from "@/lib/returns/quantity";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/admin/returns
 * Returns all returns with their items. Admin-only.
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
    const orderId = url.searchParams.get("order_id");
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || 100);

    let query = supabase
      .from("returns")
      .select(
        `
        id,
        order_id,
        user_id,
        reason,
        status,
        refund_amount,
        refund_payment_id,
        notes,
        created_at,
        updated_at,
        return_items (
          id,
          order_item_id,
          quantity,
          condition_at_return
        ),
        orders!inner (customer_name, total_amount)
        `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (orderId) query = query.eq("order_id", orderId);

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
 * POST /api/admin/returns
 * Create a new return request. Can be called by admin (on behalf of
 * customer) or by the customer themselves (via a separate route).
 * Admin-only for now.
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
    const { order_id, reason, items, notes } = body;

    if (!order_id || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "order_id and at least one return item are required" },
        { status: 400 }
      );
    }

    /*
     * The same quantity rule the customer route applies.
     *
     * An admin approving a return the customer's own request would have been
     * refused for is confusing, and two copies of the arithmetic eventually
     * disagree -- so this calls the shared helper rather than reimplementing it.
     * The authoritative guard is still the trigger on refund_items, which runs
     * against live rows when the money moves.
     */
    const check = await checkReturnableQuantity(supabase, order_id, items);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, reason: check.reason, detail: check.detail },
        { status: check.status }
      );
    }

    // Create the return record
    const { data: returnRecord, error: returnError } = await supabase
      .from("returns")
      .insert({
        order_id,
        reason: reason || null,
        notes: notes || null,
        status: "requested",
      })
      .select()
      .single();

    if (returnError) {
      return NextResponse.json({ error: returnError.message }, { status: 500 });
    }

    // Create return items
    const returnItems = items.map((item: { order_item_id: string; quantity: number; condition_at_return?: string }) => ({
      return_id: returnRecord.id,
      order_item_id: item.order_item_id,
      quantity: item.quantity,
      condition_at_return: item.condition_at_return || null,
    }));

    const { data: itemsData, error: itemsError } = await supabase
      .from("return_items")
      .insert(returnItems)
      .select();

    if (itemsError) {
      // Rollback the return record if items fail
      await supabase.from("returns").delete().eq("id", returnRecord.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    return NextResponse.json(
      { data: { ...returnRecord, return_items: itemsData } },
      { status: 201 }
    );
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * PATCH /api/admin/returns
 * Update a return's status and optionally set the refund payment.
 * Admin-only.
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
    const { id, status, refund_payment_id, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Return id is required" }, { status: 400 });
    }

    const validStatuses = ["requested", "approved", "received", "completed", "rejected"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    /*
     * refund_amount is deliberately not writable here.
     *
     * It used to be, which is how a number got onto a return with no payment
     * row behind it: the admin prompt on the returns table asked for a "refund
     * amount" and wrote it straight to this column. The value is now derived by
     * execute_refund() from the refunds that actually ran, so it can only ever
     * equal money that moved. To refund a return, POST the refund with this
     * return's id.
     */
    const ignoredRefundAmount = body.refund_amount !== undefined;

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (refund_payment_id !== undefined) updates.refund_payment_id = refund_payment_id;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0 && !ignoredRefundAmount) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("returns")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      ...(ignoredRefundAmount
        ? {
            note: "refund_amount is derived from the refunds executed against this return. Use POST /api/admin/refunds with return_id to refund it.",
          }
        : {}),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * DELETE /api/admin/returns?id=:id
 * Delete a return request. Admin-only.
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
      return NextResponse.json({ error: "Return id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("returns").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    return handleAdminError(error);
  }
}