import { NextResponse } from "next/server";
import { handleAdminError, requireAdmin } from "@/lib/admin/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { countRows, dhakaDayKey, dhakaDayStart, emptyWeek, lowStockCount, shopSalesSince } from "@/lib/admin/overview";

/**
 * GET /api/admin/overview — the numbers on the website dashboard:
 * today's orders and sales, what is waiting, the last 7 days and the
 * latest orders. Cancelled orders are not counted as sales.
 */
export async function GET() {
  try {
    await requireAdmin();
    const db = getServiceSupabase();
    const weekStart = dhakaDayStart(6);
    const today = dhakaDayKey(new Date());

    const [orders, recent, pendingOrders, pendingReturns, newCustom, pendingReviews, pendingQuestions, products, lowStock, shopSales] = await Promise.all([
      db.from("orders").select("total_amount, status, created_at").gte("created_at", weekStart.toISOString()).limit(10000),
      db.from("orders").select("id, customer_name, total_amount, status, created_at").order("created_at", { ascending: false }).limit(6),
      countRows(db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending")),
      countRows(db.from("returns").select("id", { count: "exact", head: true }).eq("status", "pending")),
      countRows(db.from("custom_orders").select("id", { count: "exact", head: true }).eq("status", "submitted")),
      countRows(db.from("product_reviews").select("id", { count: "exact", head: true }).eq("status", "pending")),
      countRows(db.from("product_questions").select("id", { count: "exact", head: true }).eq("status", "pending")),
      countRows(db.from("products").select("id", { count: "exact", head: true })),
      lowStockCount(db),
      shopSalesSince(db, weekStart),
    ]);
    if (orders.error) return NextResponse.json({ error: orders.error.message }, { status: 500 });

    const week = emptyWeek();
    const byDay = new Map(week.map((d) => [d.day, d]));
    let ordersToday = 0;
    for (const o of orders.data ?? []) {
      const day = dhakaDayKey(o.created_at as string);
      if (day === today) ordersToday += 1;
      if (o.status === "cancelled") continue;
      const slot = byDay.get(day);
      if (slot) slot.website += Number(o.total_amount ?? 0);
    }
    for (const s of shopSales) {
      const slot = byDay.get(dhakaDayKey(s.created_at));
      if (slot) slot.shop += s.net;
    }
    const todaySlot = byDay.get(today);

    return NextResponse.json({
      orders_today: ordersToday,
      sales_today: todaySlot?.website ?? 0,
      shop_today: todaySlot?.shop ?? 0,
      pending_orders: pendingOrders,
      pending_returns: pendingReturns,
      new_custom: newCustom,
      pending_reviews: pendingReviews + pendingQuestions,
      low_stock: lowStock,
      products,
      week,
      recent: recent.data ?? [],
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
