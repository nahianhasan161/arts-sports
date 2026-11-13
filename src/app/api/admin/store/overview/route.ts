import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { failed } from "@/lib/pos/http";
import { listShowrooms, staffNames } from "@/lib/pos/server";
import { dhakaDayStart, lowStockCount, shopSalesSince } from "@/lib/admin/overview";

/**
 * GET /api/admin/store/overview — the shop dashboard: today's counter
 * sales in every shop, how they were paid, and whose drawer is open.
 */
export async function GET() {
  try {
    await requirePermission("pos.use");
    const db = getServiceSupabase();
    const start = dhakaDayStart();

    const [showrooms, sales, payments, sessions, lowStock] = await Promise.all([
      listShowrooms(db),
      shopSalesSince(db, start),
      db.from("pos_payments").select("type, method, amount").gte("created_at", start.toISOString()).limit(10000),
      db.from("pos_sessions").select("id, showroom_id, opened_by, opened_at").eq("status", "open").order("opened_at"),
      lowStockCount(db),
    ]);

    const names = await staffNames(db, (sessions.data ?? []).map((s) => s.opened_by as string));
    const shops = showrooms.map((s) => {
      const mine = sales.filter((x) => x.showroom_id === s.id);
      return { id: s.id, name: s.name, bills: mine.length, total: mine.reduce((sum, x) => sum + x.net, 0) };
    });

    const methods = new Map<string, number>();
    for (const p of payments.data ?? []) {
      const amount = Number(p.amount) * (p.type === "refund" ? -1 : 1);
      methods.set(p.method as string, (methods.get(p.method as string) ?? 0) + amount);
    }

    return NextResponse.json({
      shops,
      total: shops.reduce((sum, s) => sum + s.total, 0),
      bills: shops.reduce((sum, s) => sum + s.bills, 0),
      methods: [...methods].map(([method, amount]) => ({ method, amount })).filter((m) => m.amount !== 0),
      drawers: (sessions.data ?? []).map((s) => ({
        id: s.id,
        shop: showrooms.find((r) => r.id === s.showroom_id)?.name ?? "",
        staff: names.get(s.opened_by as string) ?? "Staff",
        opened_at: s.opened_at,
      })),
      low_stock: lowStock,
    });
  } catch (error) {
    return failed(error);
  }
}
