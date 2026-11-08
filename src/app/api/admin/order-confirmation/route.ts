import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { notifyOrderEvent } from "@/lib/notifications";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";

/**
 * POST /api/admin/order-confirmation { order_id, decision: confirmed|rejected|needs_call, via?: call|whatsapp }
 *
 * Staff confirm an order after a call or a WhatsApp message, or reject it.
 * A confirmed pending order moves to processing.
 */
export async function POST(request: Request) {
  try {
    const { supabase } = await requirePermission("orders.manage");
    const body = (await request.json()) as { order_id?: string; decision?: string; via?: string };
    if (!body.order_id || !body.decision) {
      return NextResponse.json({ error: "order_id and decision are required" }, { status: 400 });
    }
    const via = body.via === "whatsapp" ? "whatsapp" : "call";
    const { data, error } = await supabase.rpc("admin_set_order_confirmation", {
      p_order_id: body.order_id,
      p_decision: body.decision,
      p_via: via,
    });
    if (error) {
      const status = /forbidden/.test(error.message) ? 403 : /not_found/.test(error.message) ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (body.decision === "confirmed" && isServiceSupabaseConfigured()) {
      notifyOrderEvent(body.order_id, "order_confirmed").catch((err) =>
        console.error("order_confirmed notification failed:", err)
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    return handleAdminError(error);
  }
}
