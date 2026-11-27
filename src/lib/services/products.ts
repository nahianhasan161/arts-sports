import { cache } from "react";
import { Product, Category } from "@/types";
import { PRODUCTS, CATEGORIES } from "@/lib/data/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sportFilter, type StoreSport } from "@/lib/sports";
import { productTextFilter, searchTerms } from "@/lib/search";
import type { SupabaseClient } from "@supabase/supabase-js";

async function getActiveSupabaseClient(): Promise<SupabaseClient | null> {
  if (typeof window === "undefined") {
    // No cookies: these are public catalogue reads, and a session-free client
    // keeps the pages that call them cacheable.
    const { getPublicSupabase } = await import("@/lib/supabase/public");
    return getPublicSupabase();
  }
  return getSupabaseBrowserClient();
}

/**
 * Products that come in any of these sizes, as a PostgREST `or` filter over
 * the `sizes` JSON list. The JSON is quoted, so a size from the URL cannot
 * add conditions of its own.
 */
function sizesFilter(sizes: string[]): string {
  return sizes
    .map((size) => `sizes.cs."${JSON.stringify([{ size }]).replace(/[\\"]/g, "\\$&")}"`)
    .join(",");
}

/** What the shop paid for a product is not for the pages it is sold on. */
function withoutCost(product: Product): Product {
  const copy = { ...product };
  delete copy.cost_price;
  return copy;
}

/** Ids as a PostgREST list. They come from the database, never from the URL. */
const inList = (ids: string[]) => `(${ids.map((id) => `"${id.replace(/["\\]/g, "")}"`).join(",")})`;

export async function getProducts(options?: {
  category?: string;
  subCategory?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  tags?: string[];
  search?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
  /** Restrict to these product ids (team/league/season filters). Empty = no matches. */
  productIds?: string[];
  /** Leave these out (sold-out products, the product being looked at). */
  excludeIds?: string[];
  sport?: StoreSport | null;
  /** Only products with a markdown. */
  dealsOnly?: boolean;
  /** Column to order by, for callers that need something other than the sort presets. */
  order?: { column: string; ascending?: boolean };
}): Promise<Product[]> {
  if (options?.productIds && options.productIds.length === 0) return [];
  // If Supabase is configured and reachable
  const supabase = await getActiveSupabaseClient();
  if (supabase) {
    try {
      let query = supabase.from("products").select("*");

      // A shopper may only ever see rows that are both live and on sale. This
      // was not filtered at all before, so every draft an admin saved was
      // immediately browseable and purchasable, and a retired product stayed
      // on sale after an admin deleted it. Both predicates are indexed
      // (products_live_idx, products_status_idx) so this is not a scan.
      query = query.is("deleted_at", null).eq("status", "published");

      if (options?.category && options.category !== "all") {
        query = query.eq("category", options.category);
      }
      if (options?.subCategory) {
        query = query.eq("sub_category", options.subCategory);
      }
      if (options?.productIds) {
        query = query.in("id", options.productIds);
      }
      if (options?.excludeIds?.length) query = query.not("id", "in", inList(options.excludeIds));
      if (options?.sport) query = query.or(sportFilter(options.sport));
      if (options?.dealsOnly) query = query.gt("discount_percent", 0);
      if (options?.minPrice !== undefined) {
        query = query.gte("price", options.minPrice);
      }
      if (options?.maxPrice !== undefined) {
        query = query.lte("price", options.maxPrice);
      }
      if (options?.sizes && options.sizes.length > 0) query = query.or(sizesFilter(options.sizes));
      // Overlap, not equality: a product tagged ["summer","linen"] matches a
      // shopper looking for "summer". PostgREST's `cs` is `&&`.
      if (options?.tags && options.tags.length > 0) {
        query = query.filter("tags", "cs", options.tags);
      }
      if (options?.search) {
        // Title and the plain-text summary only. `description` is rich HTML
        // and matching inside markup produces hits on attribute names.
        const terms = searchTerms(options.search);
        if (terms.length > 0) query = query.or(productTextFilter(terms));
      }

      if (options?.sortBy === "price_asc") {
        query = query.order("price", { ascending: true });
      } else if (options?.sortBy === "price_desc") {
        query = query.order("price", { ascending: false });
      } else if (options?.sortBy === "popular") {
        query = query.order("reviews_count", { ascending: false });
      } else if (options?.sortBy === "newest") {
        // published_at, not created_at. created_at is when the row was typed
        // in, so a product drafted for three weeks and published on a
        // Thursday would otherwise appear three weeks old here. Falls back to
        // created_at only if published_at is somehow null, which the trigger
        // does not allow for a published row.
        query = query
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }
      // Rows that tie on the column above would come back in any order, so the
      // next page could repeat some and miss others.
      if (!options?.order) query = query.order("id", { ascending: true });

      if (options?.limit !== undefined) {
        query = query.limit(options.limit);
      }
      if (options?.offset !== undefined) {
        query = query.range(
          options.offset,
          options.offset + (options.limit ?? 24) - 1
        );
      }
      if (options?.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending ?? true,
        });
      }

      const { data, error } = await query;
      // An empty result is a real answer, not a failure. The `data.length > 0`
      // test that used to sit here meant that searching for a term with no
      // matches, or asking for a category that is genuinely empty, silently
      // substituted the entire mock catalogue — so a shopper who found nothing
      // was shown products that do not exist. Empty is returned; only a thrown
      // error or a missing client reaches the fallback below.
      if (!error) {
        // Lists (cards, grids) don't show the search text; only the product page reads it.
        return ((data ?? []) as Product[]).map((row) => {
          const copy = withoutCost(row);
          delete copy.seo;
          return copy;
        });
      }
      console.warn("Supabase query failed, falling back to local dataset:", error.message);
    } catch (err) {
      console.warn("Supabase fetch failed, falling back to local dataset:", err);
    }
  }

  // Local in-memory filtering fallback
  let items = [...PRODUCTS];

  if (options?.category && options.category !== "all") {
    items = items.filter(
      (p) => p.category.toLowerCase() === options.category?.toLowerCase()
    );
  }

  if (options?.subCategory) {
    items = items.filter(
      (p) => p.sub_category?.toLowerCase() === options.subCategory?.toLowerCase()
    );
  }

  if (options?.minPrice !== undefined) {
    items = items.filter((p) => p.price >= (options.minPrice || 0));
  }

  if (options?.maxPrice !== undefined) {
    items = items.filter((p) => p.price <= (options.maxPrice || Infinity));
  }

  if (options?.sizes && options.sizes.length > 0) {
    items = items.filter((p) =>
      p.sizes.some((s) => options.sizes?.includes(s.size))
    );
  }

  if (options?.sortBy === "price_asc") {
    items.sort((a, b) => a.price - b.price);
  } else if (options?.sortBy === "price_desc") {
    items.sort((a, b) => b.price - a.price);
  } else if (options?.sortBy === "popular") {
    items.sort((a, b) => b.reviews_count - a.reviews_count);
  }

  if (options?.limit) {
    items = items.slice(0, options.limit);
  }

  return items;
}

/**
 * One product by slug. Wrapped in cache() so generateMetadata and the page
 * share a single query per render.
 */
export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  const supabase = await getActiveSupabaseClient();
  if (supabase) {
    try {
      // The same two predicates as getProducts(). Without them a draft or a
      // retired product still had a working detail page and could be added to
      // the cart, which is the exact gap the soft delete was added to close.
      // A miss here is a 404, not a reason to show mock data: the mock list
      // does not contain this slug, and falling through to it would 200 a
      // product the caller believes exists in the database.
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .is("deleted_at", null)
        .eq("status", "published")
        .maybeSingle();
      if (!error) {
        return data ? withoutCost(data as Product) : null;
      }
      console.warn("Supabase getProductBySlug error, using fallback:", error.message);
    } catch (err) {
      console.warn("Supabase getProductBySlug error, using fallback:", err);
    }
  }

  const found = PRODUCTS.find((p) => p.slug === slug);
  return found || null;
});

/**
 * The colour + size pairs a product can be bought in, for the product page.
 * Only switched-on variants (checkout's `resolve_order_variant()` refuses an
 * off one). Names are what the page and the cart use: the colour name and the
 * size's display name / name, lower-cased.
 */
export interface VariantCombo {
  color: string | null;
  sizes: string[];
  stock: number;
  /**
   * Set when the variation has its own price: its regular price and what it
   * sells for after the product's discount / live promotion
   * (`get_effective_variant_prices()`, the same source checkout charges from).
   */
  price?: { regular: number; final: number };
}

export const getVariantCombos = cache(async (productId: string): Promise<VariantCombo[]> => {
  const supabase = await getActiveSupabaseClient();
  if (!supabase) return [];
  return variantCombosFrom(supabase, productId);
});

/** getVariantCombos with a given client (the admin preview reads a draft's variants with the service client). */
export async function variantCombosFrom(
  supabase: SupabaseClient,
  productId: string
): Promise<VariantCombo[]> {
  try {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, stock, regular_price_override, colors(name), sizes(name, display_name)")
      .eq("product_id", productId)
      .eq("is_active", true);
    if (error || !data) return [];
    type Row = {
      id: string;
      stock: number | null;
      regular_price_override: number | string | null;
      colors: { name: string } | { name: string }[] | null;
      sizes: { name: string; display_name: string | null } | { name: string; display_name: string | null }[] | null;
    };
    const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
    const rows = data as Row[];
    const priced = new Map<string, { regular: number; final: number }>();
    const own = rows.filter((r) => r.regular_price_override != null).map((r) => r.id);
    if (own.length > 0) {
      const { data: prices } = await supabase.rpc("get_effective_variant_prices", { p_variant_ids: own });
      for (const p of (prices ?? []) as { variant_id: string; regular_price: number | string; final_price: number | string }[]) {
        const regular = Number(p.regular_price);
        const final = Number(p.final_price);
        if (regular > 0 && final > 0) priced.set(p.variant_id, { regular, final });
      }
    }
    return rows.map((r) => {
      const c = one(r.colors);
      const s = one(r.sizes);
      const price = priced.get(r.id);
      return {
        color: c ? c.name.toLowerCase() : null,
        sizes: s ? [...new Set([s.name, s.display_name ?? ""].filter(Boolean).map((x) => x.toLowerCase()))] : [],
        stock: Math.max(0, r.stock ?? 0),
        ...(price ? { price } : {}),
      };
    });
  } catch {
    return [];
  }
}

export async function getFeaturedProducts(): Promise<Product[]> {
  return getProducts({ limit: 6 });
}

/**
 * Categories from the database, shaped into the tree the header and the shop
 * sidebar render.
 *
 * This used to return the hardcoded CATEGORIES constant, which meant the
 * entire /admin/categories surface had no effect on the storefront: creating
 * a category in the admin panel produced a page nobody could reach. The
 * table is now the source of truth, and the mock constant is only a fallback
 * for a local run with no Supabase project.
 */
export async function getCategories(): Promise<Category[]> {
  const supabase = await getActiveSupabaseClient();
  if (supabase) {
    try {
      // `name`, matching the admin list. The categories table carries no
      // display_order column, so ordering by one would fail the whole query
      // and silently fall back to the mock tree.
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name", { ascending: true });

      if (!error && data && data.length > 0) {
        return buildCategoryTree(data as Category[]);
      }
    } catch (err) {
      console.warn("Supabase getCategories failed, using fallback:", err);
    }
  }
  return CATEGORIES;
}

/**
 * Assemble a flat category list into parents with nested children.
 *
 * `parent_id` is a string on the live rows, so a top-level category is one
 * whose parent_id is null or points at a row that is not in the set. The
 * orphans are re-attached at the top rather than dropped, which is what
 * silently hid categories created under a parent that was later renamed.
 */
function buildCategoryTree(rows: Category[]): Category[] {
  const byId = new Map<string, Category>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }

  const roots: Category[] = [];
  for (const node of Array.from(byId.values())) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) {
      parent.children = [...(parent.children ?? []), node];
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * How many products match a filter set, ignoring limit/offset.
 *
 * The shop page used to print a hardcoded "148 curated products" beside a
 * real list, which told shoppers the catalogue was ten times the size it
 * was. The count now comes from the same query the grid uses, so the two
 * can never disagree.
 */
export async function getProductsCount(options?: {
  category?: string;
  subCategory?: string;
  search?: string;
  status?: string;
  productIds?: string[];
  excludeIds?: string[];
  sport?: StoreSport | null;
  dealsOnly?: boolean;
  sizes?: string[];
  minPrice?: number;
  maxPrice?: number;
}): Promise<number> {
  if (options?.productIds && options.productIds.length === 0) return 0;
  const supabase = await getActiveSupabaseClient();
  if (supabase) {
    try {
      let query = supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("status", options?.status ?? "published");

      if (options?.category && options.category !== "all") {
        query = query.eq("category", options.category);
      }
      if (options?.subCategory) {
        query = query.eq("sub_category", options.subCategory);
      }
      if (options?.productIds) {
        query = query.in("id", options.productIds);
      }
      if (options?.excludeIds?.length) query = query.not("id", "in", inList(options.excludeIds));
      if (options?.sport) query = query.or(sportFilter(options.sport));
      if (options?.dealsOnly) query = query.gt("discount_percent", 0);
      if (options?.sizes && options.sizes.length > 0) query = query.or(sizesFilter(options.sizes));
      if (options?.minPrice !== undefined) query = query.gte("price", options.minPrice);
      if (options?.maxPrice !== undefined) query = query.lte("price", options.maxPrice);
      if (options?.search) {
        const terms = searchTerms(options.search);
        if (terms.length > 0) query = query.or(productTextFilter(terms));
      }

      const { count, error } = await query;
      if (!error && typeof count === "number") {
        return count;
      }
      console.warn("Supabase product count failed:", error?.message);
    } catch (err) {
      console.warn("Supabase product count failed, using fallback:", err);
    }
  }

  // Local fallback, same predicates as getProducts().
  const categoryFilter = options?.category;
  const subCategoryFilter = options?.subCategory;
  let items = PRODUCTS.filter((p) => p.status !== "draft");
  if (categoryFilter && categoryFilter !== "all") {
    items = items.filter((p) => p.category.toLowerCase() === categoryFilter.toLowerCase());
  }
  if (options?.sizes && options.sizes.length > 0) items = items.filter((p) => p.sizes.some((s) => options.sizes!.includes(s.size)));
  if (options?.minPrice !== undefined) items = items.filter((p) => p.price >= options.minPrice!);
  if (options?.maxPrice !== undefined) items = items.filter((p) => p.price <= options.maxPrice!);
  if (subCategoryFilter) {
    items = items.filter(
      (p) => p.sub_category?.toLowerCase() === subCategoryFilter.toLowerCase()
    );
  }
  return items.length;
}

/** Distinct sub-category names for a parent category, used by the shop chips. */
export async function getSubCategories(parentId?: string): Promise<string[]> {
  const tree = await getCategories();
  const scope = parentId
    ? tree.find((c) => c.id === parentId || c.slug === parentId)?.children ?? []
    : tree;

  const names = new Set<string>();
  for (const child of scope) {
    if (child.name) names.add(child.name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
