import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError, requireUser, handleAuthError } from "@/lib/admin/auth";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/cancellations
 * Returns cancellations — admin sees all, authenticated users see own.
 */
export async function GET(request: NextRequest) {
  let isAdmin = false;
  let userId: string | null = null;

   try {
    await requireAdmin();
    isAdmin = true;
  } catch {
    try {
      const userContext = await requireUser();
      userId = userContext.user.id;
    } catch (error) {
      return handleAuthError(error);
    }
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

    if (!isAdmin && userId) {
      query = query.eq("user_id", userId);
    }

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
 * POST /api/cancellations
 * Customer-initiated cancellation request.
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const userContext = await requireUser();
    userId = userContext.user.id;
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { order_id, type, reason, reason_category, notes } = body;

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

    // Verify order belongs to user
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id, status, total_amount")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Order must be in a cancellable state
    if (["shipped", "delivered", "returned"].includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot cancel order in '${order.status}' status` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cancellations")
      .insert({
        order_id,
        user_id: userId,
        type,
        reason,
        reason_category,
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