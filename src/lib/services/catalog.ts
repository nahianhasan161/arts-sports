import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "@/types";

/**
 * Phase 2 catalogue reads: teams, leagues, seasons, editions, collections.
 *
 * Everything here reads public rows with the anonymous key, so it works in
 * pages that stay cacheable. Each function returns an empty answer when the
 * Phase 2 migration has not been applied yet (the tables do not exist), so
 * the shop keeps working and the new sections just stay hidden.
 */

export const TERM_TYPES = ["team", "league", "player", "season", "brand", "edition"] as const;
export type TermType = (typeof TERM_TYPES)[number];

export const TERM_TYPE_LABEL: Record<TermType, string> = {
  team: "Team",
  league: "League",
  player: "Player",
  season: "Season",
  brand: "Brand",
  edition: "Edition",
};

export interface CatalogTerm {
  id: string;
  type: TermType;
  slug: string;
  name_en: string;
  name_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  image_url: string | null;
  details: Record<string, string>;
  is_featured: boolean;
  display_order: number;
}

export interface Collection {
  id: string;
  slug: string;
  title_en: string;
  title_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  banner_url: string | null;
  kind: "manual" | "new" | "bestseller";
  starts_at: string | null;
  ends_at: string | null;
  show_countdown: boolean;
  show_in_menu: boolean;
  display_order: number;
}

let client: SupabaseClient | null | undefined;
function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

const TERM_COLUMNS =
  "id, type, slug, name_en, name_bn, description_en, description_bn, image_url, details, is_featured, display_order";

export async function getTerms(type?: TermType): Promise<CatalogTerm[]> {
  const supabase = db();
  if (!supabase) return [];
  let query = supabase.from("catalog_terms").select(TERM_COLUMNS).eq("is_active", true);
  if (type) query = query.eq("type", type);
  const { data, error } = await query.order("display_order").order("name_en");
  return error ? [] : ((data ?? []) as CatalogTerm[]);
}

export async function getTermBySlug(type: TermType, slug: string): Promise<CatalogTerm | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("catalog_terms")
    .select(TERM_COLUMNS)
    .eq("type", type)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return error ? null : ((data as CatalogTerm | null) ?? null);
}

/** Terms attached to one product, for the product page (edition, team, ...). */
export async function getProductTerms(productId: string): Promise<CatalogTerm[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("product_terms")
    .select(`catalog_terms!inner(${TERM_COLUMNS}, is_active)`)
    .eq("product_id", productId);
  if (error) return [];
  return (data ?? [])
    .map((row) => (row as unknown as { catalog_terms: CatalogTerm & { is_active: boolean } }).catalog_terms)
    .filter((t) => t && t.is_active);
}

/**
 * Product ids matching a term selection: terms of the same type are OR-ed
 * (Argentina or Brazil), different types are AND-ed (a team AND a season).
 * Returns null when nothing is selected, meaning "do not filter by terms".
 */
export async function resolveTermProductIds(
  selection: Partial<Record<TermType, string[]>>
): Promise<string[] | null> {
  const supabase = db();
  const groups = Object.entries(selection).filter(([, slugs]) => slugs && slugs.length > 0) as [TermType, string[]][];
  if (groups.length === 0) return null;
  if (!supabase) return [];

  let result: Set<string> | undefined;
  for (const [type, slugs] of groups) {
    const { data, error } = await supabase
      .from("product_terms")
      .select("product_id, catalog_terms!inner(type, slug)")
      .eq("catalog_terms.type", type)
      .in("catalog_terms.slug", slugs);
    if (error) return [];
    const ids = new Set((data ?? []).map((r) => r.product_id as string));
    const prev: Set<string> | undefined = result;
    result = prev ? new Set([...prev].filter((id) => ids.has(id))) : ids;
    if (result.size === 0) return [];
  }
  return [...(result ?? [])];
}

export async function getCollections(opts?: { menuOnly?: boolean }): Promise<Collection[]> {
  const supabase = db();
  if (!supabase) return [];
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("collections")
    .select("*")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  if (opts?.menuOnly) query = query.eq("show_in_menu", true);
  const { data, error } = await query.order("display_order");
  return error ? [] : ((data ?? []) as Collection[]);
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const found = (await getCollections()).find((c) => c.slug === slug);
  return found ?? null;
}

const DAY = 24 * 60 * 60 * 1000;

/** The products in a collection, in display order. */
export async function getCollectionProducts(collection: Collection, limit = 48): Promise<Product[]> {
  const supabase = db();
  if (!supabase) return [];
  const live = (q: ReturnType<SupabaseClient["from"]>) =>
    q.select("*").is("deleted_at", null).eq("status", "published");

  if (collection.kind === "new") {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const { data } = await live(supabase.from("products")).gte("published_at", since).order("published_at", { ascending: false }).limit(limit);
    return (data ?? []) as Product[];
  }

  if (collection.kind === "bestseller") {
    const { data: ids } = await supabase.rpc("bestseller_product_ids", { p_limit: limit });
    const list = ((ids as { product_id: string }[] | null) ?? []).map((r) => r.product_id);
    return orderedProducts(supabase, list);
  }

  const { data: links } = await supabase
    .from("collection_products")
    .select("product_id, position")
    .eq("collection_id", collection.id)
    .order("position")
    .limit(limit);
  return orderedProducts(supabase, (links ?? []).map((l) => l.product_id as string));
}

async function orderedProducts(supabase: SupabaseClient, ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null)
    .eq("status", "published");
  const byId = new Map(((data ?? []) as Product[]).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
}

/** Products carrying one term (a team page). Newest first. */
export async function getTermProducts(termId: string, limit = 48): Promise<Product[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data: links } = await supabase.from("product_terms").select("product_id").eq("term_id", termId);
  const ids = (links ?? []).map((l) => l.product_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as Product[];
}

// ---------------------------------------------------------------------------
// Reviews and questions (public, approved rows only)
// ---------------------------------------------------------------------------

export interface RatingSummary {
  count: number;
  average: number | null;
  stars: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export interface PublicReview {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  photos: string[];
  staff_reply: string | null;
  created_at: string;
  verified: boolean;
}

export interface PublicQuestion {
  id: string;
  author_name: string;
  question: string;
  answer: string | null;
  created_at: string;
}

export async function getRatingSummary(productId: string): Promise<RatingSummary> {
  const empty: RatingSummary = { count: 0, average: null, stars: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } };
  const supabase = db();
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc("product_rating_summary", { p_product_id: productId });
  return error || !data ? empty : (data as RatingSummary);
}

export async function getApprovedReviews(productId: string, limit = 20): Promise<PublicReview[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("approved_reviews", { p_product_id: productId, p_limit: limit });
  return error ? [] : ((data ?? []) as PublicReview[]);
}

/** Questions staff approved. Unanswered ones stay hidden until answered. */
export async function getApprovedQuestions(productId: string): Promise<PublicQuestion[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("product_questions")
    .select("id, author_name, question, answer, created_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .not("answer", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  return error ? [] : ((data ?? []) as PublicQuestion[]);
}
