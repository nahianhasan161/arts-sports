import { getProducts, getProductsCount } from "@/lib/services/products";
import { resolveTermProductIds, TERM_TYPES, type TermType } from "@/lib/services/catalog";
import type { Product } from "@/types";

type Params = { [key: string]: string | string[] | undefined } | URLSearchParams;

const SORTS = new Set(["newest", "popular", "price_asc", "price_desc"]);

function read(p: Params, key: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined;
  const v = p[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

/** The shop's filter state, parsed the same way by the page and the "load more" API. */
export function parseShopFilters(p: Params) {
  const sort = read(p, "sort") ?? "";
  const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const termSelection: Partial<Record<TermType, string[]>> = {};
  for (const type of TERM_TYPES) {
    const slugs = read(p, type)?.split(",").map((s) => s.trim()).filter(Boolean);
    if (slugs && slugs.length > 0) termSelection[type] = slugs;
  }
  const sizes = read(p, "sizes")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return {
    category: read(p, "category") ?? "all",
    query: read(p, "q") ?? read(p, "search") ?? "",
    subCategory: read(p, "sub") ?? "",
    sortBy: SORTS.has(sort) ? sort : "newest",
    inStockOnly: read(p, "stock") === "in",
    dealsOnly: read(p, "deals") === "true",
    priceMin: num(read(p, "price_min")),
    priceMax: num(read(p, "price_max")),
    sizes,
    termSelection,
  };
}

export type ShopFilters = ReturnType<typeof parseShopFilters>;

/** One batch of the catalogue for these filters. `withTotal` adds the count query. */
export async function loadShopProducts(
  f: ShopFilters,
  offset: number,
  limit: number,
  withTotal = false
): Promise<{ products: Product[]; total: number | null }> {
  const productIds = await resolveTermProductIds(f.termSelection);
  const base = {
    category: f.category,
    subCategory: f.subCategory || undefined,
    search: f.query || undefined,
    productIds: productIds ?? undefined,
  };
  const [products, total] = await Promise.all([
    getProducts({
      ...base,
      sizes: f.sizes.length > 0 ? f.sizes : undefined,
      minPrice: f.priceMin,
      maxPrice: f.priceMax,
      sortBy: f.sortBy,
      limit,
      offset,
    }),
    withTotal ? getProductsCount(base) : Promise.resolve(null),
  ]);
  return { products, total };
}
