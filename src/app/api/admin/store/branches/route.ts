import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { bad, failed } from "@/lib/pos/http";
import { dhakaDayStart, shopSalesSince } from "@/lib/admin/overview";

/**
 * The physical shops ("showrooms" in the database). Each has its own stock
 * (product_stock) and cash drawers (pos_sessions).
 *
 * GET   /api/admin/store/branches                  every shop, open or closed
 * POST  /api/admin/store/branches  { name, address }
 * PATCH /api/admin/store/branches  { id, name?, address?, is_active? }
 *
 * Shops are closed, never deleted: old sales and stock history point at them.
 */
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  try {
    await requirePermission("settings.manage");
    const db = getServiceSupabase();
    const [rooms, stock, sales] = await Promise.all([
      db.from("showrooms").select("id, name, address, is_active, fulfillment_priority").order("fulfillment_priority"),
      db.from("product_stock").select("showroom_id, quantity").limit(20000),
      shopSalesSince(db, dhakaDayStart()),
    ]);
    if (rooms.error) return bad(rooms.error.message, 500);
    const pieces = new Map<string, number>();
    for (const row of stock.data ?? []) pieces.set(row.showroom_id as string, (pieces.get(row.showroom_id as string) ?? 0) + Number(row.quantity));
    return NextResponse.json({
      branches: (rooms.data ?? []).map((r) => ({
        ...r,
        pieces: pieces.get(r.id as string) ?? 0,
        today: sales.filter((s) => s.showroom_id === r.id).reduce((sum, s) => sum + s.net, 0),
      })),
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("settings.manage");
    const db = getServiceSupabase();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = text(b.name, 80);
    if (!name) return bad("Write the shop's name");

    const { data: last } = await db.from("showrooms").select("fulfillment_priority").order("fulfillment_priority", { ascending: false }).limit(1).maybeSingle();
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
    const id = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    const { error } = await db.from("showrooms").insert({
      id,
      name,
      slug: id,
      address: text(b.address, 200) || null,
      is_active: true,
      fulfillment_priority: Number(last?.fulfillment_priority ?? 0) + 1,
    });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermission("settings.manage");
    const db = getServiceSupabase();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = text(b.id, 120);
    if (!id) return bad("Choose a shop");

    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = text(b.name, 80);
      if (!name) return bad("Write the shop's name");
      patch.name = name;
    }
    if (b.address !== undefined) patch.address = text(b.address, 200) || null;
    if (typeof b.is_active === "boolean") {
      if (!b.is_active) {
        const [{ count: others }, { count: drawers }] = await Promise.all([
          db.from("showrooms").select("id", { count: "exact", head: true }).eq("is_active", true).neq("id", id),
          db.from("pos_sessions").select("id", { count: "exact", head: true }).eq("showroom_id", id).eq("status", "open"),
        ]);
        if (!others) return bad("This is your only open shop. The website sells from its stock, so it cannot be closed.");
        if (drawers) return bad("A cash drawer is still open in this shop. Close it first.");
      }
      patch.is_active = b.is_active;
    }
    if (!Object.keys(patch).length) return bad("Nothing to change");

    const { error } = await db.from("showrooms").update(patch).eq("id", id);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
