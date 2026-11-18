import { NextResponse } from "next/server";
import { failed } from "@/lib/pos/http";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listDesigns, loadDesignCategories } from "@/lib/custom-jersey/designs-server";

/**
 * GET /api/admin/pos/designs?category=&q=&offset=&limit=  (or ?ids=a,b)
 *
 * Our own custom-jersey designs (custom_gallery, published only), for the
 * counter's design picker. Separate from the product catalogue.
 * `other` also returns old rows that have no category yet. Offset 0 also returns `categories`.
 */
export async function GET(request: Request) {
  try {
    const { user: actor } = await requirePermission("pos.use").catch(() => requirePermission("custom_orders.manage"));
    const url = new URL(request.url);
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    // `ids=a,b` loads chosen designs (the catalogue's "make a jersey" button).
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10);
    const db = getServiceSupabase(actor);
    const [page, categories] = await Promise.all([
      listDesigns(db, { ids: ids.length ? ids : undefined, category: url.searchParams.get("category"), q: url.searchParams.get("q"), offset, limit: Math.min(60, Number(url.searchParams.get("limit")) || 40) }),
      offset === 0 ? loadDesignCategories(db) : Promise.resolve(undefined),
    ]);
    if (page.error) return NextResponse.json({ error: page.error }, { status: 500 });
    return NextResponse.json({ designs: page.designs, has_more: page.has_more, ...(categories ? { categories } : {}) });
  } catch (error) {
    return failed(error);
  }
}
