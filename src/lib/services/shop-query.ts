import { getCategories, getProducts, getProductsCount } from "@/lib/services/products";
import { resolveTermProductIds, TERM_TYPES, type TermType } from "@/lib/services/catalog";
import { getPublicSupabase } from "@/lib/supabase/public";
import { searchProductIds } from "@/lib/services/search";
import { parseSport, sportFilter } from "@/lib/sports";
import type { Category, Product, ProductSize } from "@/types";

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
  /** `slug` is what goes in the address (`?sub=`): the slug, or the id when there is none. */
  children: { id: string; slug: string; name: string; name_bn?: string | null; count: number }[];
}

/** A ready-made price range. No `min` = "under", no `max` = "and up". */
export interface PriceBand {
  min?: number;
  max?: number;
  count: number;
}

export interface ShopFacets {
  /** Only categories that have something in the current search or sport. */
  categories: ShopCategory[];
  /** All products of the current search or sport, whatever the category. */
  all: number;
  sizes: SizeFacet | null;
  /** Products that have a term (team, edition, ...), so terms that lead nowhere can be left out. */
  productIds: string[];
  priceBands: PriceBand[];
  /** Some product here is sold out, so "in stock only" makes a difference. */
  hasSoldOut: boolean;
}

/** A round number near n, so ranges read "৳500 – ৳1,000", not "৳487 – ৳1,013". */
function roundPrice(n: number): number {
  const step = n < 1000 ? 100 : n < 5000 ? 500 : 1000;
  return Math.round(n / step) * step;
}

/**
 * Up to four price ranges that split these prices into similar-sized groups,
 * each with how many products it has. A range ends one taka below the next
 * one's start, so no product is counted twice.
 */
function priceBands(values: number[]): PriceBand[] {
  const prices = values.filter((n) => n > 0).sort((a, b) => a - b);
  if (prices.length < 2 || prices[0] === prices[prices.length - 1]) return [];
  const edges = [...new Set([0.25, 0.5, 0.75].map((q) => roundPrice(prices[Math.floor(q * (prices.length - 1))])))]
    .filter((e) => e > prices[0] && e <= prices[prices.length - 1])
    .sort((a, b) => a - b);
  if (edges.length === 0) return [];
  const bands: Omit<PriceBand, "count">[] = [];
  let low: number | undefined;
  for (const e of edges) {
    bands.push({ min: low, max: e - 1 });
    low = e;
  }
  bands.push({ min: low });
  const counted = bands.map((b) => ({
    ...b,
    count: prices.filter((p) => (b.min === undefined || p >= b.min) && (b.max === undefined || p <= b.max)).length,
  }));
  // An empty range joins its neighbour, so the ranges leave no gap.
  const out: PriceBand[] = [];
  for (const b of counted) {
    const last = out[out.length - 1];
    if (last && b.count === 0) last.max = b.max;
    else if (last && last.count === 0) out[out.length - 1] = { ...b, min: last.min };
    else out.push({ ...b });
  }
  return out.length > 1 ? out : [];
}

/** Which of the price, size and stock filters a count should apply; each list ignores its own. */
type Skip = { price?: boolean; size?: boolean };

function passes(r: FacetRow, f: ShopFilters, skip: Skip = {}): boolean {
  const price = Number(r.price);
  if (!skip.price && f.priceMin !== undefined && price < f.priceMin) return false;
  if (!skip.price && f.priceMax !== undefined && price > f.priceMax) return false;
  if (!skip.size && f.sizes.length > 0 && !(r.sizes ?? []).some((s) => f.sizes.includes(s.size))) return false;
  if (f.inStockOnly && !available(r, skip.size ? [] : f.sizes)) return false;
  return true;
}

/**
 * The filter lists and their counts. Every count is what a click would show:
 * it applies the other filters (price, size, stock, team), so a number in the
 * sidebar matches the grid it leads to.
 * `treeRows` are the rows the category list and brands count: the same as
 * `rows` unless a brand is ticked (brand is the last level, so ticking one
 * keeps the categories and the other brands in view).
 */
function buildFacets(f: ShopFilters, rows: FacetRow[], treeRows: FacetRow[], tree: Category[], category?: string, sub?: string) {
  const inScope = (r: FacetRow) => (!category || r.category === category) && (!sub || r.sub_category === sub);
  const shown = treeRows.filter((r) => passes(r, f));
  const byCategory = new Map<string, FacetRow[]>();
  for (const r of shown) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
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
          .map((k) => ({ id: k.id, slug: k.slug || k.id, name: k.name, name_bn: k.name_bn, count: own.filter((r) => r.sub_category === k.name).length }))
          // The open sub-category stays even at 0, so it can be seen and closed.
          .filter((k) => k.count > 0 || (c.name === category && k.name === sub)),
      };
    })
    .filter((c) => c.count > 0 || c.name === category);

  const scope = rows.filter(inScope);
  const facets: ShopFacets = {
    categories,
    all: shown.length,
    // Across categories one size filter would mix shirts with rackets.
    sizes: category ? sizeFacet(scope.filter((r) => passes(r, f, { size: true }))) : null,
    productIds: scope.filter((r) => passes(r, f)).map((r) => r.id),
    priceBands: priceBands(scope.filter((r) => passes(r, f, { price: true })).map((r) => Number(r.price))),
    hasSoldOut: scope.some((r) => !available(r, [])),
  };
  return { facets, brandScope: treeRows.filter((r) => inScope(r) && passes(r, f)).map((r) => r.id) };
}

/** The sub-category a `?sub=` value means: slug, id or (older links) name. */
export function findSub(parent: Category | undefined, value: string): Category | undefined {
  if (!parent || !value) return undefined;
  const v = value.toLowerCase();
  return parent.children?.find((k) => k.slug === value || k.id === value || k.name.toLowerCase() === v);
}

async function resolve(f: ShopFilters) {
  const [termIds, tree, searchIds] = await Promise.all([
    resolveTermProductIds(f.termSelection),
    getCategories(),
    // The search is turned into ids once (English + Bangla, categories, teams),
    // so the grid, the count and the filters all agree on what matched.
    f.query.trim() ? searchProductIds(f.query) : Promise.resolve(null),
  ]);
  const productIds = searchIds === null ? termIds : termIds === null ? searchIds : termIds.filter((id) => searchIds.includes(id));
  const found = findCategory(tree, f.category);
  const category = found ? found.parent.name : f.category === "all" ? undefined : f.category;
  const child = findSub(found?.parent, f.subCategory) ?? found?.child;
  const subCategory = child?.name ?? (f.subCategory || undefined);
  return { productIds, tree, found, child, category, subCategory };
}

function query(f: ShopFilters, r: Awaited<ReturnType<typeof resolve>>, rows: FacetRow[] | null) {
  const soldOut = rows && f.inStockOnly ? rows.filter((x) => !available(x, f.sizes)).map((x) => x.id) : [];
  return {
    category: r.category,
    subCategory: r.subCategory,
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
  const [products, total, loose] = await Promise.all([
    getProducts({ ...base, sortBy: f.sortBy, limit, offset: 0 }),
    getProductsCount(base),
    brandFreeRows(f, rows),
  ]);
  const { facets, brandScope } = buildFacets(f, rows, loose, r.tree, r.category, r.subCategory);
  const sub = r.child ?? (r.subCategory ? { slug: r.subCategory, id: r.subCategory, name: r.subCategory, name_bn: null } : null);
  return {
    products,
    total,
    facets,
    brandScope,
    category: r.found?.parent ?? null,
    sub: sub ? { slug: sub.slug || sub.id, name: sub.name, name_bn: sub.name_bn ?? null } : null,
  };
}

/**
 * The rows with every filter except the brand. Brand is the last level under
 * category and sub-category, so ticking Yonex keeps the category list as it
 * was and still shows Li-Ning (with its count) to switch to or add.
 */
async function brandFreeRows(f: ShopFilters, rows: FacetRow[]): Promise<FacetRow[]> {
  if (!f.termSelection.brand) return rows;
  const rest: ShopFilters = { ...f, termSelection: { ...f.termSelection } };
  delete rest.termSelection.brand;
  return facetRows(rest, await resolveTermProductIds(rest.termSelection));
}

/**
 * How many products of each list carry each term (one read for all lists), so
 * the filters offer no team or brand that leads to an empty page.
 */
export async function termCounts(...lists: string[][]): Promise<Map<string, number>[]> {
  const out = lists.map(() => new Map<string, number>());
  const db = getPublicSupabase();
  if (!db || lists.every((l) => l.length === 0)) return out;
  const { data } = await db.from("product_terms").select("term_id, product_id").limit(5000);
  lists.forEach((list, i) => {
    const here = new Set(list);
    for (const x of data ?? []) {
      const term = x.term_id as string;
      if (here.has(x.product_id as string)) out[i].set(term, (out[i].get(term) ?? 0) + 1);
    }
  });
  return out;
}
