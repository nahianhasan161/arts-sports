import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBdPhone } from "@/lib/phone";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { getCourier } from "@/lib/courier";

/**
 * POST /api/track { order_id, phone }
 *
 * Order status for the public tracking page. Both the order number and the
 * phone on the order must match, and the endpoint is rate limited, so it
 * cannot be used to read other people's orders.
 */
export async function POST(request: Request) {
  if (!isServiceSupabaseConfigured()) return NextResponse.json({ error: "Tracking is not available" }, { status: 503 });
  const limit = checkRateLimit(request as NextRequest, "track");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many tries. Please wait a minute." }, { status: 429 });
  }

  let body: { order_id?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orderId = (body.order_id ?? "").trim().toUpperCase().replace(/^#/, "");
  const phone = normalizeBdPhone(body.phone ?? "");
  if (!orderId || !phone) {
    return NextResponse.json({ error: "Enter your order number and the phone number used for the order." }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, status, confirmation_status, payment_plan, total_amount, shipping_fee, created_at, shipped_at, delivered_at, customer_phone, courier, courier_consignment_id, courier_tracking_code, courier_status, thana, district, order_items(title, size, color, quantity)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.customer_phone !== phone) {
    return NextResponse.json({ error: "No order found with that number and phone." }, { status: 404 });
  }

  const courier = order.courier ? getCourier(order.courier) : null;
  const trackingUrl =
    courier && order.courier_consignment_id
      ? courier.trackingUrl({
          consignmentId: order.courier_consignment_id,
          trackingCode: order.courier_tracking_code,
          phone: order.customer_phone,
        })
      : null;

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      confirmation_status: order.confirmation_status,
      payment_plan: order.payment_plan,
      total_amount: Number(order.total_amount),
      created_at: order.created_at,
      shipped_at: order.shipped_at,
      delivered_at: order.delivered_at,
      area: [order.thana, order.district].filter(Boolean).join(", "),
      courier: courier?.label ?? null,
      courier_status: order.courier_status,
      tracking_code: order.courier_tracking_code,
      tracking_url: trackingUrl,
      items: order.order_items ?? [],
    },
  });
}
