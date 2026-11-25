import { NextResponse } from "next/server";
import { parseShopFilters, loadShopProducts } from "@/lib/services/shop-query";

/** Next batch of the public catalogue for the shop's "show more" button. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const offset = Math.max(0, Number(params.get("offset") ?? "0") || 0);
  const limit = Math.min(48, Math.max(1, Number(params.get("limit") ?? "12") || 12));
  const products = await loadShopProducts(parseShopFilters(params), offset, limit);
  return NextResponse.json(
    { products, hasMore: products.length === limit },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
