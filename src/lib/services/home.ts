import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getCategories, getProducts } from "@/lib/services/products";

/** Reads for the home page. Cookie-free, so it stays cacheable. */

export interface HomeReview {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  product: { slug: string; title: string; title_bn: string | null } | null;
}

/** Approved reviews of 4 stars and up. Demo data is never shown as a customer's words. */
export async function getHomeReviews(limit = 3): Promise<HomeReview[]> {
  const db = getPublicSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("product_reviews")
    .select("id, author_name, rating, body, products(slug, title, title_bn)")
    .eq("status", "approved")
    .gte("rating", 4)
    .not("id", "like", "demo-%")
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? [] : ((data ?? []).map((r) => ({ ...r, product: (Array.isArray(r.products) ? r.products[0] : r.products) ?? null })) as unknown as HomeReview[]);
}

/** Link to a shop category by name, or to the whole shop while that category has nothing to sell. */
export async function categoryHref(name: string): Promise<string> {
  const matches = (await getCategories()).filter((c) => [c.name, c.slug].some((x) => x?.toLowerCase().startsWith(name)));
  for (const c of matches) {
    if ((await getProducts({ category: c.name, limit: 1 })).length > 0) return `/shop?category=${encodeURIComponent(c.slug || c.id)}`;
  }
  return "/shop";
}
