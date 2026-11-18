import { NextResponse } from "next/server";
import { failed } from "@/lib/pos/http";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listShowrooms } from "@/lib/pos/server";
import { loadShelf } from "@/lib/pos/catalog";

/**
 * GET /api/admin/pos/stock?showroom_id=
 *
 * What one shop has free to sell: { variants: { variant_id: qty }, plain: { product_id: qty } }.
 * The register polls this (on open, after each sale, every minute or so);
 * the catalogue itself comes from /api/admin/pos/catalog.
 */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("pos.use").catch(() => requirePermission("inventory.manage"));
    const db = getServiceSupabase(user);
    const wanted = new URL(request.url).searchParams.get("showroom_id");
    const showrooms = await listShowrooms(db);
    const showroomId = showrooms.find((s) => s.id === wanted)?.id ?? showrooms[0]?.id;
    if (!showroomId) return NextResponse.json({ error: "No shop is set up. Add a showroom first." }, { status: 400 });
    return NextResponse.json(await loadShelf(db, showroomId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failed(error);
  }
}
