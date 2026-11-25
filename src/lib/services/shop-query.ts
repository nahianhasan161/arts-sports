import { getCategories, getProducts, getProductsCount } from "@/lib/services/products";
import { resolveTermProductIds, TERM_TYPES, type TermType } from "@/lib/services/catalog";
import type { Product } from "@/types";

/** The slider moves in these steps, so its ends are rounded out to them. */
const PRICE_STEP = 50;

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

/**
 * The URL carries a category slug (or id); products store the category's name.
 * A sub-category's slug selects its parent plus that sub-category.
 */
async function resolveCategory(value: string): Promise<{ category: string; sub?: string }> {
  if (!value || value === "all") return { category: "all" };
  const tree = await getCategories();
  const matches = (c: { id: string; slug: string }) => c.slug === value || c.id === value;
  const parent = tree.find(matches);
  if (parent) return { category: parent.name };
  for (const c of tree) {
    const child = c.children?.find(matches);
    if (child) return { category: c.name, sub: child.name };
  }
  return { category: value };
}

/** One batch of the catalogue for these filters. `withTotal` adds the count and the price range. */
export async function loadShopProducts(
  f: ShopFilters,
  offset: number,
  limit: number,
  withTotal = false
): Promise<{ products: Product[]; total: number | null; priceRange: { min: number; max: number } | null }> {
  const [productIds, resolved] = await Promise.all([
    resolveTermProductIds(f.termSelection),
    resolveCategory(f.category),
  ]);
  const base = {
    category: resolved.category,
    subCategory: f.subCategory || resolved.sub,
    search: f.query || undefined,
    productIds: productIds ?? undefined,
    sizes: f.sizes.length > 0 ? f.sizes : undefined,
  };
  const [products, total, cheapest, dearest] = await Promise.all([
    getProducts({
      ...base,
      minPrice: f.priceMin,
      maxPrice: f.priceMax,
      sortBy: f.sortBy,
      limit,
      offset,
    }),
    withTotal ? getProductsCount({ ...base, minPrice: f.priceMin, maxPrice: f.priceMax }) : Promise.resolve(null),
    // The slider's ends: of everything these filters could show, whatever price is chosen.
    withTotal ? getProducts({ ...base, sortBy: "price_asc", limit: 1 }) : Promise.resolve([]),
    withTotal ? getProducts({ ...base, sortBy: "price_desc", limit: 1 }) : Promise.resolve([]),
  ]);
  const priceRange =
    cheapest[0] && dearest[0]
      ? {
          min: Math.floor(Number(cheapest[0].price) / PRICE_STEP) * PRICE_STEP,
          max: Math.ceil(Number(dearest[0].price) / PRICE_STEP) * PRICE_STEP,
        }
      : null;
  return { products, total, priceRange };
}
