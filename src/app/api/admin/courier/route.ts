import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { applyParcelUpdate, bookOrder, CourierError, getCourier, listCouriers } from "@/lib/courier";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";

/**
 * GET   /api/admin/courier?view=unsettled|all     parcels + COD reconciliation
 * POST  /api/admin/courier { order_id, courier? }  book a parcel
 * PUT   /api/admin/courier { order_id }            refresh status from the courier
 * PATCH /api/admin/courier { order_ids, amount? }  mark COD as received from the courier
 */
export async function GET(request: Request) {
  try {
    const { supabase } = await requirePermission("orders.view");
    const view = new URL(request.url).searchParams.get("view") ?? "unsettled";
    let query = supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone, total_amount, status, courier, courier_consignment_id, courier_tracking_code, courier_status, courier_fee, courier_booked_at, delivered_at, cod_expected, cod_collected, cod_settled_at, cod_settled_amount"
      )
      .not("courier_consignment_id", "is", null)
      .order("courier_booked_at", { ascending: false })
      .limit(300);
    if (view === "unsettled") query = query.is("cod_settled_at", null);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ parcels: data ?? [], couriers: listCouriers() });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("orders.manage");
    if (!isServiceSupabaseConfigured()) return NextResponse.json({ error: "Service key not set" }, { status: 503 });
    const body = (await request.json()) as { order_id?: string; courier?: string };
    if (!body.order_id) return NextResponse.json({ error: "order_id is required" }, { status: 400 });
    const booked = await bookOrder(body.order_id, body.courier);
    return NextResponse.json({ booked });
  } catch (error) {
    if (error instanceof CourierError) {
      return NextResponse.json({ error: error.message }, { status: error.status && error.status < 600 ? error.status : 502 });
    }
    return handleAdminError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase } = await requirePermission("orders.manage");
    const body = (await request.json()) as { order_id?: string };
    const { data: order } = await supabase
      .from("orders")
      .select("id, courier, courier_consignment_id")
      .eq("id", body.order_id ?? "")
      .maybeSingle();
    if (!order?.courier || !order.courier_consignment_id) {
      return NextResponse.json({ error: "No parcel booked for this order" }, { status: 404 });
    }
    const courier = getCourier(order.courier);
    if (!courier?.isConfigured()) return NextResponse.json({ error: "Courier keys are not set" }, { status: 503 });
    const status = await courier.status(order.courier_consignment_id);
    const result = await applyParcelUpdate(courier.code, {
      consignmentId: order.courier_consignment_id,
      orderId: order.id,
      state: status.state,
      rawStatus: status.rawStatus,
      codCollected: null,
      fee: null,
      message: null,
      raw: { source: "status_check", ...status },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourierError) return NextResponse.json({ error: error.message }, { status: 502 });
    return handleAdminError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase } = await requirePermission("payments.manage");
    const body = (await request.json()) as { order_ids?: string[]; amount?: number };
    const ids = Array.isArray(body.order_ids) ? body.order_ids.filter((x) => typeof x === "string").slice(0, 200) : [];
    if (ids.length === 0) return NextResponse.json({ error: "order_ids is required" }, { status: 400 });

    // One order: the amount typed by staff (if any). Several: each order's collected amount.
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, cod_collected, cod_expected")
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const now = new Date().toISOString();
    for (const o of orders ?? []) {
      const amount =
        ids.length === 1 && typeof body.amount === "number" ? body.amount : Number(o.cod_collected ?? o.cod_expected ?? 0);
      const { error: upErr } = await supabase
        .from("orders")
        .update({ cod_settled_at: now, cod_settled_amount: amount })
        .eq("id", o.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ settled: orders?.length ?? 0 });
  } catch (error) {
    return handleAdminError(error);
  }
}
