import { NextResponse } from "next/server";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { listDesigns, loadDesignCategories } from "@/lib/custom-jersey/designs-server";

/**
 * GET /api/custom-jersey/designs?category=&q=&ids=&offset=&limit=
 *
 * Published designs from our design catalogue (custom_gallery), for the
 * website's custom-jersey form picker. Read-only; `ids` fetches specific designs
 * (used when the form opens with ?design=<id>). The first page (offset 0, no ids)
 * also returns the active `categories`.
 */
export async function GET(request: Request) {
  if (!isServiceSupabaseConfigured()) return NextResponse.json({ designs: [], categories: [], has_more: false });
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 10);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const db = getServiceSupabase();
  const [page, categories] = await Promise.all([
    listDesigns(db, {
      category: url.searchParams.get("category"),
      q: url.searchParams.get("q"),
      ids,
      offset,
      limit: Math.min(60, Number(url.searchParams.get("limit")) || 40),
    }),
    offset === 0 && !ids.length ? loadDesignCategories(db) : Promise.resolve(undefined),
  ]);
  if (page.error) return NextResponse.json({ error: "Could not load designs" }, { status: 500 });
  return NextResponse.json(
    { designs: page.designs, has_more: page.has_more, ...(categories ? { categories } : {}) },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
