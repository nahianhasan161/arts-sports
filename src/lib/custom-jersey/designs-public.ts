import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";
import { listDesigns, loadDesignCategories } from "./designs-server";
import type { DesignCategoryRow, DesignRow } from "./designs";

/**
 * Storefront reads for the design catalogue. They use the cookie-free public
 * client (RLS as anon: published designs, active categories and fabrics), so
 * the pages that call them stay ISR-cacheable.
 */

export async function getPublicCatalogue(opts: { category?: string | null; limit?: number } = {}): Promise<{
  designs: DesignRow[];
  categories: DesignCategoryRow[];
  hasMore: boolean;
}> {
  const db = getPublicSupabase();
  if (!db) return { designs: [], categories: [], hasMore: false };
  const [categories, page] = await Promise.all([
    loadDesignCategories(db),
    listDesigns(db, { category: opts.category, limit: opts.limit ?? 12 }),
  ]);
  return { designs: page.designs, categories, hasMore: page.has_more };
}

/** Lowest price per piece over the active fabrics (tiers included), for "from ৳X". Null when unknown. */
export async function getCustomStartPrice(): Promise<number | null> {
  const db = getPublicSupabase();
  if (!db) return null;
  const { data, error } = await db.from("custom_fabrics").select("*").eq("is_active", true);
  if (error || !data?.length) return null;
  const prices: number[] = [];
  for (const row of data as { price_per_piece?: number | null; price_tiers?: { price?: number }[] | null }[]) {
    if (Number(row.price_per_piece) > 0) prices.push(Number(row.price_per_piece));
    for (const tier of Array.isArray(row.price_tiers) ? row.price_tiers : []) if (Number(tier?.price) > 0) prices.push(Number(tier.price));
  }
  return prices.length ? Math.min(...prices) : null;
}
