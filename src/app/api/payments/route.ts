import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin, handleAuthError, handleAdminError } from "@/lib/admin/auth";

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
    const cookieStore = await cookies();
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
 * PATCH /api/payments
 * Change a payment's status. Admins only.
 *
 * This is the last mile of the payment workflow, and it did not exist: the
 * admin payments table has a status dropdown that calls PATCH on this route,
 * but the route only implemented GET and POST. Next.js answered 405, so an
 * admin could see an "initiated" bKash charge, compare the transaction ID
 * against the merchant statement, try to mark it successful -- and have the
 * click silently fail. Every wallet payment therefore stayed "initiated" no
 * matter what the admin did.
 *
 * It requires an admin rather than merely a signed-in user, because confirming
 * someone else's payment is not something a customer account should be able to
 * do. The POST above stays user-scoped and is what checkout uses.
 */

/** The terminal states a payment may be moved into, and who may move it. */
const ALLOWED_STATUSES = ["initiated", "successful", "failed", "cancelled", "refunded"] as const;

export async function PATCH(request: NextRequest) {
  let callerId: string;
  try {
    // requireAdmin() also loads the caller's profile, so the role check is
    // authoritative rather than a claim in the payload.
    const context = await requireAdmin();
    callerId = context.user.id;
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Read the current row first so the transition can be reported rather
    // than silently overwriting. A payment already refunded being moved back
    // to successful would unwind a refund nobody recorded.
    const { data: existing, error: readError } = await supabase
      .from("payments")
      .select("id, status, provider, order_id")
      .eq("id", id)
      .single();

    if (readError || !existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (existing.status === status) {
      // Idempotent: a second click on the same status is not an error, and
      // the admin should not be shown a failure for it.
      return NextResponse.json({ data: existing });
    }

    const { data, error } = await supabase
      .from("payments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, order_id, provider, status, amount, provider_txn_id, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Who changed it, in the log rather than in the row: payments has no
    // updated_by column, and adding one for an audit trail is a schema change
    // this fix does not need.
    console.info(`payment ${data.id} (${data.provider}, order ${data.order_id}): "${existing.status}" -> "${data.status}" by admin ${callerId}`);

    return NextResponse.json({ data });
  } catch (error) {
    return handleAdminError(error);
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
    const cookieStore = await cookies();
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