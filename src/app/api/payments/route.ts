import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, handleAuthError } from "@/lib/admin/auth";

/**
 * GET /api/payments
 * Returns the current user's own payment transactions.
 * Authenticated users only.
 */
export async function GET(request: NextRequest) {
  let userId: string;
  try {
    const context = await requireUser();
    userId = context.user.id;
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const cookieStore = cookies();
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // Read-only here; the middleware refreshes the session.
      },
    });

    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const url = new URL(request.url);
    const orderId = url.searchParams.get("order_id");

    let query = supabase
      .from("payments")
      .select(
        `
        id,
        order_id,
        type,
        provider,
        provider_txn_id,
        amount,
        status,
        metadata,
        created_at,
        updated_at
        `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (orderId) query = query.eq("order_id", orderId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * POST /api/payments
 * Record a payment transaction for the current user's own order.
 * Authenticated users only.
 *
 * Used by checkout to record the initial charge after an order is placed.
 * For COD the status stays "initiated" until an admin confirms it.
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const context = await requireUser();
    userId = context.user.id;
  } catch (error) {
    return handleAuthError(error);
  }

  try {
    const cookieStore = cookies();
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // Read-only here; the middleware refreshes the session.
      },
    });

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

    const validTypes = ["charge", "refund", "chargeback"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const validProviders = ["cod", "bkash", "nagad", "stripe", "paypal"];
    if (provider && !validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `provider must be one of: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    const validStatuses = ["initiated", "successful", "failed", "cancelled", "refunded"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify the order belongs to this user
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id, total_amount")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        order_id,
        user_id: userId,
        type,
        provider: provider || "cod",
        amount: Number(amount),
        provider_txn_id: provider_txn_id || null,
        status: status || "initiated",
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleAuthError(error);
  }
}