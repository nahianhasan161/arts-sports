import { NextResponse, type NextRequest } from "next/server";
import { handleAdminError, requireAdmin } from "@/lib/admin/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { countRows, dhakaDayKey, dhakaDayStart, dhakaKeyStart, emptyRange, lowStockCount, shopSalesSince } from "@/lib/admin/overview";

/**
 * GET /api/admin/overview — the numbers on the website dashboard:
 * today's orders and sales, what is waiting, a chart for the chosen dates
 * (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, default last 7 days) and the latest orders. Cancelled orders are not counted as sales.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const { user: actor } = await requireAdmin();
    const db = getServiceSupabase(actor);
    const today = dhakaDayKey(new Date());
    // Date filter (Bangladesh days, inclusive). Default: last 7 days. Max ~2 years.
    let from = req.nextUrl.searchParams.get("from") ?? "";
    let to = req.nextUrl.searchParams.get("to") ?? "";
    if (!DAY_RE.test(to) || to > today) to = today;
    if (!DAY_RE.test(from)) from = dhakaDayKey(dhakaDayStart(6));
    if (from > to) from = to;
    if (Date.parse(to) - Date.parse(from) > 731 * 86_400_000) from = dhakaDayKey(new Date(Date.parse(to) - 731 * 86_400_000));
    const rangeStart = dhakaKeyStart(from);
    const rangeEnd = new Date(dhakaKeyStart(to).getTime() + 86_400_000);
    const todayStart = dhakaDayStart(0);
    const weekStart = rangeStart < todayStart ? rangeStart : todayStart;

    const [orders, recent, pendingOrders, pendingReturns, newCustom, pendingReviews, pendingQuestions, products, lowStock, shopSales] = await Promise.all([
      db.from("orders").select("total_amount, status, created_at").gte("created_at", weekStart.toISOString()).limit(50000),
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

    const { slots, monthly } = emptyRange(from, to);
    const bySlot = new Map(slots.map((d) => [d.day, d]));
    const slotOf = (iso: string) => {
      const t = new Date(iso).getTime();
      if (t < rangeStart.getTime() || t >= rangeEnd.getTime()) return undefined;
      const key = dhakaDayKey(iso);
      return bySlot.get(monthly ? key.slice(0, 7) : key);
    };
    let ordersToday = 0;
    let salesToday = 0;
    let shopToday = 0;
    const range = { orders: 0, website: 0, shop: 0, cancelled: 0 };
    for (const o of orders.data ?? []) {
      const iso = o.created_at as string;
      const isToday = dhakaDayKey(iso) === today;
      if (isToday) ordersToday += 1;
      const slot = slotOf(iso);
      if (slot) range.orders += 1;
      if (o.status === "cancelled") {
        if (slot) range.cancelled += 1;
        continue;
      }
      const amount = Number(o.total_amount ?? 0);
      if (isToday) salesToday += amount;
      if (slot) {
        slot.website += amount;
        slot.orders += 1;
        range.website += amount;
      }
    }
    for (const s of shopSales) {
      if (dhakaDayKey(s.created_at) === today) shopToday += s.net;
      const slot = slotOf(s.created_at);
      if (slot) {
        slot.shop += s.net;
        range.shop += s.net;
      }
    }

    return NextResponse.json({
      orders_today: ordersToday,
      sales_today: salesToday,
      shop_today: shopToday,
      pending_orders: pendingOrders,
      pending_returns: pendingReturns,
      new_custom: newCustom,
      pending_reviews: pendingReviews + pendingQuestions,
      low_stock: lowStock,
      products,
      from,
      to,
      monthly,
      series: slots,
      range,
      recent: recent.data ?? [],
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
