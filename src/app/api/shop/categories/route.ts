import { NextResponse } from "next/server";
import { getCategories } from "@/lib/services/products";

/** Top-level categories, a page at a time, for the shop's horizontal category strip. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const offset = Math.max(0, Number(params.get("offset") ?? "0") || 0);
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? "10") || 10));
  const all = await getCategories();
  const items = all.slice(offset, offset + limit).map(({ id, slug, name }) => ({ id, slug, name }));
  return NextResponse.json(
    { items, hasMore: offset + limit < all.length },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
