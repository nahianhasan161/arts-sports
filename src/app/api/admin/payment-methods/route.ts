import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";

async function getSupabase() {
  return getSupabaseServerClient();
}

/**
 * GET /api/admin/payment-methods
 * List all payment methods.
 */
export async function GET() {
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

    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .order("display_name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/payment-methods
 * Create a new payment method.
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
    const { code, display_name, category, is_active, requires_confirmation, instructions } = body;

    if (!code || !display_name || !category) {
      return NextResponse.json(
        { error: "code, display_name, and category are required" },
        { status: 400 }
      );
    }

    const validCategories = ["offline", "online", "wallet"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("payment_methods")
      .insert({
        code,
        display_name,
        category,
        is_active: is_active ?? true,
        requires_confirmation: requires_confirmation ?? false,
        instructions,
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
 * PATCH /api/admin/payment-methods
 * Update a payment method.
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
    const { id, is_active, requires_confirmation, instructions, display_name } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (is_active !== undefined) updates.is_active = is_active;
    if (requires_confirmation !== undefined) updates.requires_confirmation = requires_confirmation;
    if (instructions !== undefined) updates.instructions = instructions;
    if (display_name !== undefined) updates.display_name = display_name;

    const { data, error } = await supabase
      .from("payment_methods")
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
 * DELETE /api/admin/payment-methods?id=:id
 * Delete a payment method.
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
      return NextResponse.json({ error: "Payment method id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("payment_methods").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    return handleAdminError(error);
  }
}