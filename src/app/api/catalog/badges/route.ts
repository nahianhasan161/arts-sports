import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/catalog/badges?ids=a,b,c
 * { [productId]: { bestseller, new } } computed from real sales and publish
 * dates. Products under the thresholds are simply absent.
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (ids.length === 0 || !url || !key) return NextResponse.json({});
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("product_badges_bulk", { p_product_ids: ids });
  const out: Record<string, { bestseller: boolean; new: boolean }> = {};
  if (!error) {
    for (const r of (data ?? []) as { product_id: string; is_bestseller: boolean; is_new: boolean }[]) {
      if (r.is_bestseller || r.is_new) out[r.product_id] = { bestseller: r.is_bestseller, new: r.is_new };
    }
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
