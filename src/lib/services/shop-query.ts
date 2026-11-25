import { getCategories, getProducts, getProductsCount } from "@/lib/services/products";
import { resolveTermProductIds, TERM_TYPES, type TermType } from "@/lib/services/catalog";
import { getPublicSupabase } from "@/lib/supabase/public";
import { parseSport, sportFilter } from "@/lib/sports";
import type { Category, Product, ProductSize } from "@/types";

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
    sport: parseSport(read(p, "sport")),
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
 * The category a URL value means: slug, id or name of a top-level category or
 * of a sub-category. "accessories" is the sports accessories category whatever
 * its exact slug is (the header links to it).
 */
export function findCategory(tree: Category[], value: string): { parent: Category; child?: Category } | null {
  if (!value || value === "all") return null;
  const matches = (c: Category) => c.slug === value || c.id === value || c.name === value;
  const parent = tree.find(matches);
  if (parent) return { parent };
  for (const c of tree) {
    const child = c.children?.find(matches);
    if (child) return { parent: c, child };
  }
  if (value === "accessories") {
    const found = tree.find((c) => c.slug?.includes("accessories"));
    if (found) return { parent: found };
  }
  return null;
}

/** What each product contributes to the filters. */
interface FacetRow {
  id: string;
  category: string;
  sub_category: string | null;
  price: number;
  stock: number | null;
  sizes: ProductSize[] | null;
}

/** Rows the filters are built from. Beyond this the counts are of the newest products only. */
const FACET_ROWS = 1000;
/** Ids that fit in one request's address. */
const MAX_EXCLUDED = 150;

/** The products the filters choose from: this search, sport, deals and team, in any category. */
async function facetRows(f: ShopFilters, productIds: string[] | null): Promise<FacetRow[]> {
  const db = getPublicSupabase();
  if (!db || (productIds && productIds.length === 0)) return [];
  let q = db
    .from("products")
    .select("id, category, sub_category, price, stock, sizes")
    .is("deleted_at", null)
    .eq("status", "published");
  if (productIds) q = q.in("id", productIds);
  if (f.sport) q = q.or(sportFilter(f.sport));
  if (f.dealsOnly) q = q.gt("discount_percent", 0);
  const term = f.query.replace(/[,%()]/g, " ").trim();
  if (term) q = q.or(`title.ilike.%${term}%,short_description.ilike.%${term}%`);
  const { data, error } = await q.order("published_at", { ascending: false, nullsFirst: false }).limit(FACET_ROWS);
  return error ? [] : ((data ?? []) as FacetRow[]);
}

/** In stock, in one of the chosen sizes when any is chosen. */
function available(row: FacetRow, sizes: string[]): boolean {
  if (row.sizes && row.sizes.length > 0) {
    return row.sizes.some((s) => (s.stock ?? 0) > 0 && (sizes.length === 0 || sizes.includes(s.size)));
  }
  return (row.stock ?? 0) > 0;
}

const CLOTHING = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL"];
const isClothing = (s: string) => CLOTHING.includes(s.toUpperCase());
/** More options than this is a list of unrelated variants, not a filter. */
const MAX_OPTIONS = 12;

export interface SizeFacet {
  /** "size" for clothing and other measured sizes, "option" for anything else (a weight, a pack, a grip). */
  kind: "size" | "option";
  values: string[];
}

/**
 * The size filter for what is on screen, or null when one filter makes no
 * sense: products without sizes, or a mix of shirts and rackets.
 */
function sizeFacet(rows: FacetRow[]): SizeFacet | null {
  const values = [...new Set(rows.flatMap((r) => (r.sizes ?? []).map((s) => s.size).filter(Boolean)))];
  if (values.length < 2) return null;
  const clothing = values.filter(isClothing);
  if (clothing.length === values.length) {
    return { kind: "size", values: CLOTHING.filter((c) => values.some((v) => v.toUpperCase() === c)).map((c) => values.find((v) => v.toUpperCase() === c)!) };
  }
  if (clothing.length > 0 || values.length > MAX_OPTIONS) return null;
  const numeric = values.every((v) => /^\d+(\.\d+)?$/.test(v));
  return {
    kind: numeric ? "size" : "option",
    values: numeric ? values.sort((a, b) => Number(a) - Number(b)) : values.sort((a, b) => a.localeCompare(b)),
  };
}

export interface ShopCategory {
  id: string;
  slug: string;
  name: string;
  name_bn?: string | null;
  count: number;
  children: { id: string; name: string; name_bn?: string | null; count: number }[];
}

export interface ShopFacets {
  /** Only categories that have something in the current search or sport. */
  categories: ShopCategory[];
  /** All products of the current search or sport, whatever the category. */
  all: number;
  sizes: SizeFacet | null;
  /** Products that have a term (team, edition, ...), so terms that lead nowhere can be left out. */
  productIds: string[];
  priceRange: { min: number; max: number } | null;
  /** Some product here is sold out, so "in stock only" makes a difference. */
  hasSoldOut: boolean;
}

function buildFacets(rows: FacetRow[], tree: Category[], category?: string, sub?: string): ShopFacets {
  const byCategory = new Map<string, FacetRow[]>();
  for (const r of rows) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  const categories = tree
    .map((c) => {
      const own = byCategory.get(c.name) ?? [];
      return {
        id: c.id,
        slug: c.slug || c.id,
        name: c.name,
        name_bn: c.name_bn,
        count: own.length,
        children: (c.children ?? [])
          .map((k) => ({ id: k.id, name: k.name, name_bn: k.name_bn, count: own.filter((r) => r.sub_category === k.name).length }))
          .filter((k) => k.count > 0),
      };
    })
    .filter((c) => c.count > 0);

  const scope = rows.filter((r) => (!category || r.category === category) && (!sub || r.sub_category === sub));
  const prices = scope.map((r) => Number(r.price)).filter((n) => n > 0);
  return {
    categories,
    all: rows.length,
    // Across categories one size filter would mix shirts with rackets.
    sizes: category ? sizeFacet(scope) : null,
    productIds: scope.map((r) => r.id),
    priceRange: prices.length
      ? {
          min: Math.floor(Math.min(...prices) / PRICE_STEP) * PRICE_STEP,
          max: Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP,
        }
      : null,
    hasSoldOut: scope.some((r) => !available(r, [])),
  };
}

async function resolve(f: ShopFilters) {
  const [productIds, tree] = await Promise.all([resolveTermProductIds(f.termSelection), getCategories()]);
  const found = findCategory(tree, f.category);
  const category = found ? found.parent.name : f.category === "all" ? undefined : f.category;
  const subCategory = f.subCategory || found?.child?.name;
  return { productIds, tree, found, category, subCategory };
}

function query(f: ShopFilters, r: Awaited<ReturnType<typeof resolve>>, rows: FacetRow[] | null) {
  const soldOut = rows && f.inStockOnly ? rows.filter((x) => !available(x, f.sizes)).map((x) => x.id) : [];
  return {
    category: r.category,
    subCategory: r.subCategory,
    search: f.query || undefined,
    productIds: r.productIds ?? undefined,
    excludeIds: soldOut.slice(0, MAX_EXCLUDED),
    sport: f.sport,
    dealsOnly: f.dealsOnly,
    sizes: f.sizes.length > 0 ? f.sizes : undefined,
    minPrice: f.priceMin,
    maxPrice: f.priceMax,
  };
}

/** The next batch of the catalogue for these filters. */
export async function loadShopProducts(f: ShopFilters, offset: number, limit: number): Promise<Product[]> {
  const r = await resolve(f);
  const rows = f.inStockOnly ? await facetRows(f, r.productIds) : null;
  return getProducts({ ...query(f, r, rows), sortBy: f.sortBy, limit, offset });
}

/** Everything the shop page needs: the first batch, the exact count and the filters that apply. */
export async function loadShop(f: ShopFilters, limit: number) {
  const r = await resolve(f);
  const rows = await facetRows(f, r.productIds);
  const base = query(f, r, rows);
  const [products, total] = await Promise.all([
    getProducts({ ...base, sortBy: f.sortBy, limit, offset: 0 }),
    getProductsCount(base),
  ]);
  return {
    products,
    total,
    facets: buildFacets(rows, r.tree, r.category, r.subCategory),
    category: r.found?.parent ?? null,
    subCategory: r.subCategory ?? "",
  };
}

/** Which terms are on these products, so the filters offer no team that leads to an empty page. */
export async function termIdsOf(productIds: string[]): Promise<Set<string>> {
  const db = getPublicSupabase();
  if (!db || productIds.length === 0) return new Set();
  const { data } = await db.from("product_terms").select("term_id, product_id").limit(5000);
  const here = new Set(productIds);
  return new Set((data ?? []).filter((x) => here.has(x.product_id as string)).map((x) => x.term_id as string));
}
