import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser, handleAdminError, handleAuthError } from "@/lib/admin/auth";
import {
  validateCancellationTransition,
  isExecutionEligible,
} from "@/lib/cancellations/state-machine";
import type { CancellationStatus } from "@/types";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/cancellations/[id]
 * Returns a single cancellation — admin sees any, users see own.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let isAdmin = false;
  try {
    await requireAdmin();
    isAdmin = true;
  } catch {
    // Not admin, will try user auth below
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const { id } = params;

    let query = supabase
      .from("cancellations")
      .select("*")
      .eq("id", id);

    if (!isAdmin) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query.single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (isAdmin) {
      return handleAdminError(error);
    }
    return handleAuthError(error);
  }
}

/**
 * PATCH /api/cancellations/[id]
 * Customer can cancel their own pending/approved cancellation.
 * Admin actions (approve/reject/execute) go through /api/admin/cancellations.
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let userId: string | null = null;
  let isAdmin = false;

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

    const { id } = params;
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    // Customer can only cancel their own cancellations in eligible states
    const validCustomerActions = ["cancel"];
    if (!isAdmin && !validCustomerActions.includes(action)) {
      return NextResponse.json({ error: "Unauthorized action" }, { status: 403 });
    }

    const { data: cancellation, error: fetchError } = await supabase
      .from("cancellations")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !cancellation) {
      return NextResponse.json({ error: "Cancellation not found" }, { status: 404 });
    }

    if (!isAdmin && cancellation.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isExecutionEligible(cancellation.status)) {
      return NextResponse.json(
        { error: `Cannot modify cancellation in '${cancellation.status}' status` },
        { status: 400 }
      );
    }

    const statusMap: Record<string, string> = {
      cancel: "cancelled",
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    try {
      validateCancellationTransition(cancellation.status as CancellationStatus, newStatus as CancellationStatus);
    } catch (validationError) {
      return NextResponse.json({ error: String(validationError) }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: newStatus,
      cancelled_at: isAdmin ? cancellation.cancelled_at : now,
      cancelled_by: isAdmin ? cancellation.cancelled_by : userId,
    };

    const { data, error } = await supabase
      .from("cancellations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (isAdmin) {
      return handleAdminError(error);
    }
    return handleAuthError(error);
  }
}

/**
 * DELETE /api/cancellations/[id]
 * Customer can delete their own cancellations in eligible states.
 * Admin actions go through /api/admin/cancellations.
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let userId: string | null = null;
  let isAdmin = false;

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

    const { id } = params;

    const { data: cancellation, error: fetchError } = await supabase
      .from("cancellations")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !cancellation) {
      return NextResponse.json({ error: "Cancellation not found" }, { status: 404 });
    }

    if (!isAdmin && cancellation.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isExecutionEligible(cancellation.status)) {
      return NextResponse.json(
        { error: `Cannot delete cancellation in '${cancellation.status}' status` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("cancellations")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isAdmin) {
      return handleAdminError(error);
    }
    return handleAuthError(error);
  }
}