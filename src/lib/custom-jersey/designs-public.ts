import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";
import { listDesigns, loadDesignCategories } from "./designs-server";
import { estimate, normalizeFabricTiers } from "./pricing";
import type { Fabric, PricingConfig } from "./types";
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

/** The active fabrics, as the order form shows them. */
export async function getPublicFabrics(): Promise<Fabric[]> {
  const db = getPublicSupabase();
  if (!db) return [];
  const { data, error } = await db.from("custom_fabrics").select("*").eq("is_active", true).order("display_order");
  if (error) return [];
  return (data ?? []).map((row) => ({ ...row, price_per_piece: Number(row.price_per_piece), price_tiers: normalizeFabricTiers(row.price_tiers) })) as Fabric[];
}

/** What one jersey in this fabric costs, before extras. Quantity prices are left out on purpose. */
export function onePiecePrice(fabric: Pick<Fabric, "price_per_piece" | "price_tiers">, pricing: PricingConfig): number {
  return estimate(
    { fabricPrice: fabric.price_per_piece, fabricTiers: fabric.price_tiers, quantity: 1, sleeve: "short", collar: "round", withShorts: false, withNames: false, withNumbers: false },
    pricing
  ).total;
}

/** Lowest price of one plain jersey over the fabrics, for "from ৳X". Null when unknown. */
export function startPrice(fabrics: Fabric[], pricing: PricingConfig): number | null {
  const prices = fabrics.map((f) => onePiecePrice(f, pricing)).filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : null;
}
