import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared by the two dashboards (website and shop). Days are Bangladesh days. */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Start of the Bangladesh day `daysAgo` days back, as a UTC instant. */
export function dhakaDayStart(daysAgo = 0): Date {
  const local = new Date(Date.now() + DHAKA_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - DHAKA_OFFSET_MS - daysAgo * 86_400_000);
}

/** "2026-11-14" for the Bangladesh day an instant falls in. */
export function dhakaDayKey(iso: string | Date): string {
  return new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The last 7 Bangladesh days, oldest first, each starting at 0. */
export function emptyWeek(): { day: string; website: number; shop: number }[] {
  return Array.from({ length: 7 }, (_, i) => ({ day: dhakaDayKey(dhakaDayStart(6 - i)), website: 0, shop: 0 }));
}

/** A row count that answers 0 instead of failing when a table is not there yet. */
export async function countRows(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count, error } = await query;
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

/** Active variants at or under their low-stock line. */
export async function lowStockCount(db: SupabaseClient): Promise<number> {
  const [variants, setting] = await Promise.all([
    db.from("product_variants").select("stock, low_stock_threshold").eq("is_active", true).limit(5000),
    db.from("app_settings").select("value").eq("key", "low_stock_threshold").maybeSingle(),
  ]);
  if (variants.error) return 0;
  const fallback = Number(setting.data?.value ?? 3) || 3;
  return (variants.data ?? []).filter((v) => Number(v.stock) <= (v.low_stock_threshold ?? fallback)).length;
}

/** Shop sales since an instant: net of refunds. */
export async function shopSalesSince(db: SupabaseClient, since: Date) {
  const { data, error } = await db.from("pos_sales").select("showroom_id, total, refunded_total, created_at").gte("created_at", since.toISOString()).limit(10000);
  if (error) return [];
  return (data ?? []).map((s) => ({ showroom_id: s.showroom_id as string, net: Number(s.total) - Number(s.refunded_total), created_at: s.created_at as string }));
}
