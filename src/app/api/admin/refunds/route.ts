import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isDynamicServerUsage } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Refund } from "@/types";

async function getSupabase() {
  return getSupabaseServerClient();
}

/** The named errors execute_refund() raises, mapped to a status and a message. */
const REFUND_REJECTIONS: Record<string, { status: number; message: string }> = {
  auth_required: { status: 401, message: "Not signed in." },
  // A configuration fault on the store's side, not a customer error.
  refund_without_payment: {
    status: 409,
    message: "This order has no collected payment, so there is nothing to refund.",
  },
  refund_exceeds_balance: {
    status: 409,
    message: "That refund is more than the order has actually paid.",
  },
  refund_quantity_exceeds_ordered: {
    status: 409,
    message: "That is more units than were ordered on this line.",
  },
  payment_not_found: { status: 404, message: "That charge could not be found." },
  payment_not_refundable: {
    status: 409,
    message: "The charge has not settled, so it cannot be refunded.",
  },
  not_a_charge: { status: 400, message: "Only a charge can be refunded." },
  order_item_not_found: { status: 404, message: "That item is not on this order." },
  unit_refund_exceeds_paid: {
    status: 400,
    message: "The per-unit refund cannot be more than the unit price.",
  },
  deductions_exceed_items: {
    status: 400,
    message: "The deductions are larger than the value being refunded.",
  },
};

/**
 * The reason out of a Postgres error message.
 *
 * execute_refund() raises `named_reason: detail`, and the detail carries the
 * numbers the admin needs -- "is 440.00 more than the 60.00 refundable". Both
 * halves are forwarded: the reason drives the status code, the detail is what
 * the message says.
 */
function reasonOf(message: string): { reason: string; detail: string } {
  const m = message.match(/^([a-z_]+):\s*(.*)$/i);
  if (m) return { reason: m[1], detail: m[2] };
  // Only take the leading reason when there is no detail, so the mapped
  // message above is what the user sees rather than raw database text.
  return { reason: message.trim().split(/[\s:]/)[0], detail: "" };
}

/**
 * GET /api/admin/refunds
 * List refunds, optionally filtered by status.
 *
 * Reads the refunds aggregate, so each row carries its deductions and its
 * money position rather than only a flat amount.
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
    // Capped: an unbounded limit is a slow query on a table that only grows.
    const limit = Math.min(Number(url.searchParams.get("limit") || 25), 200);

    let query = supabase
      .from("refunds")
      .select(
        `
        id,
        order_id,
        return_id,
        cancellation_id,
        original_payment_id,
        user_id,
        status,
        item_total,
        deductions_total,
        refund_total,
        provider,
        transaction_ref,
        reason,
        notes,
        approved_by,
        approved_at,
        executed_by,
        executed_at,
        created_at,
        updated_at,
        refund_items (
            id, order_item_id, quantity, unit_refund, line_total
        ),
        refund_deductions (
            id, kind, label, amount, notes
        )
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

    return NextResponse.json({ data: data as Refund[], count });
  } catch (error) {
    if (!isDynamicServerUsage(error)) {
      console.error("Unexpected refunds listing error:", error);
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/refunds
 * Execute a refund.
 *
 * This route no longer writes to refund_transactions or to payments directly.
 * Both were how the refund was recorded before, and neither checked how much
 * had already been refunded -- so a second refund could take money the order
 * had never paid. Everything now goes through execute_refund(), which does the
 * whole thing in one transaction and refuses when it would over-refund.
 *
 * The body is a refund quote:
 *
 *   {
 *     order_id, original_payment_id, provider, reason, notes, transaction_ref,
 *     return_id?, cancellation_id?,
 *     items:        [{ order_item_id, quantity, unit_refund? }],
 *     deductions:   [{ kind, label, amount, notes? }]
 *   }
 */
export async function POST(request: NextRequest) {
  let admin: { user: { id: string; email?: string } };
  try {
    admin = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  /*
   * Throttled even though the endpoint is admin-only.
   *
   * A refund is irreversible once executed, and this route has no idempotency
   * key -- a client that retries after a timeout refunds again, and the second
   * one succeeds if the balance allows it. Thirty a minute is far above any
   * real session, and turns an accidental retry storm into a wait rather than a
   * double refund.
   */
  const limit = checkRateLimit(request, "refund");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many refunds in a short time. Wait a moment and check the refunds list before retrying.",
        reason: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();

    const items = Array.isArray(body?.items) ? body.items : [];
    const deductions = Array.isArray(body?.deductions) ? body.deductions : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required for a refund" },
        { status: 400 }
      );
    }

    // Normalised here so the RPC receives well-formed numbers rather than
    // coercing whatever arrived, which is how a stray string becomes a
    // quantity of zero.
    const normalisedItems = items.map((it: Record<string, unknown>) => ({
      order_item_id: String(it?.order_item_id ?? ""),
      quantity: Number(it?.quantity),
      ...(it?.unit_refund !== undefined && it?.unit_refund !== null
        ? { unit_refund: Number(it.unit_refund) }
        : {}),
    }));

    for (const it of normalisedItems) {
      if (!it.order_item_id || !Number.isInteger(it.quantity) || it.quantity <= 0) {
        return NextResponse.json(
          { error: "Each refund item needs an order_item_id and a positive quantity" },
          { status: 400 }
        );
      }
    }

    const normalisedDeductions = deductions.map((d: Record<string, unknown>) => ({
      kind: String(d?.kind ?? "customer_request"),
      label: String(d?.label ?? d?.kind ?? "Deduction"),
      amount: Number(d?.amount),
      ...(d?.notes ? { notes: String(d.notes) } : {}),
    }));

    const { data, error } = await supabase.rpc("execute_refund", {
      payload: {
        order_id: String(body?.order_id ?? ""),
        original_payment_id: String(body?.original_payment_id ?? ""),
        provider: body?.provider ? String(body.provider) : undefined,
        reason: body?.reason ? String(body.reason) : undefined,
        notes: body?.notes ? String(body.notes) : undefined,
        transaction_ref: body?.transaction_ref ? String(body.transaction_ref) : undefined,
        return_id: body?.return_id ? String(body.return_id) : undefined,
        cancellation_id: body?.cancellation_id ? String(body.cancellation_id) : undefined,
        items: normalisedItems,
        deductions: normalisedDeductions,
      },
    });

    if (error) {
      const { reason, detail } = reasonOf(error.message);
      const mapped = REFUND_REJECTIONS[reason];
      return NextResponse.json(
        {
          error: mapped?.message ?? "We could not process that refund.",
          reason,
          // The RPC's detail line is the useful part for an admin: it names the
          // shortfall, so it is forwarded rather than replaced by a generic
          // message.
          detail: detail || undefined,
        },
        { status: mapped?.status ?? 400 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (isDynamicServerUsage(error)) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    console.error("Unexpected refund execution error:", error, "admin:", admin.user.id);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/refunds
 * Update a refund's settlement details.
 *
 * Only the fields the admin owns after the fact: the transaction reference once
 * the gateway returns one, and the notes. Status and amounts are not writable
 * here -- they are owned by execute_refund() and the database triggers, which
 * is what stops a second writer from contradicting the money trail.
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
    const { id, transaction_ref, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (transaction_ref !== undefined) updates.transaction_ref = transaction_ref;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("refunds")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data as Refund });
  } catch (error) {
    if (isDynamicServerUsage(error)) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    console.error("Unexpected refund update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
