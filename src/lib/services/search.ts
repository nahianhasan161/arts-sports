import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";
import { cleanTerm, productTextFilter, searchTerms } from "@/lib/search";

/** More matches than this is not a search any more. */
const MAX_IDS = 400;

/**
 * Ids of published products that match a shopper's search, best first.
 *
 * Looks in the product's name and summary (English and Bangla), its category
 * and sub-category names, its teams/brands and its tags, with each word also
 * tried in the other language (see `searchTerms`). When the
 * `search_product_ids` SQL function is there (20261126110000) it also forgives
 * small typos ("jursey"); without it the same text match runs here.
 */
export async function searchProductIds(raw: string): Promise<string[]> {
  const db = getPublicSupabase();
  const terms = searchTerms(raw);
  if (!db || terms.length === 0) return [];

  const rpc = await db.rpc("search_product_ids", { q: cleanTerm(raw), terms, max_results: MAX_IDS });
  if (!rpc.error && Array.isArray(rpc.data)) return (rpc.data as { id: string }[]).map((r) => r.id);

  const [own, cats, teams, tagged] = await Promise.all([
    db.from("products").select("id").is("deleted_at", null).eq("status", "published").or(productTextFilter(terms)).limit(MAX_IDS),
    db.from("categories").select("name").or(terms.flatMap((t) => [`name.ilike.%${t}%`, `name_bn.ilike.%${t}%`]).join(",")).limit(50),
    db.from("catalog_terms").select("id").eq("is_active", true).or(terms.flatMap((t) => [`name_en.ilike.%${t}%`, `name_bn.ilike.%${t}%`]).join(",")).limit(50),
    db.from("products").select("id").is("deleted_at", null).eq("status", "published").overlaps("tags", terms).limit(MAX_IDS),
  ]);

  const ids = new Set<string>([...(own.data ?? []), ...(tagged.data ?? [])].map((r) => r.id as string));

  const names = [...new Set((cats.data ?? []).map((c) => c.name as string))];
  if (names.length > 0) {
    const quoted = `(${names.map((n) => `"${n.replace(/["\\]/g, "")}"`).join(",")})`;
    const { data } = await db.from("products").select("id").is("deleted_at", null).eq("status", "published")
      .or(`category.in.${quoted},sub_category.in.${quoted}`).limit(MAX_IDS);
    (data ?? []).forEach((r) => ids.add(r.id as string));
  }
  const termIds = (teams.data ?? []).map((t) => t.id as string);
  if (termIds.length > 0) {
    const { data } = await db.from("product_terms").select("product_id").in("term_id", termIds).limit(MAX_IDS);
    (data ?? []).forEach((r) => ids.add(r.product_id as string));
  }
  return [...ids].slice(0, MAX_IDS);
}
