import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared by the POS, stock and customer API routes (Phase 4).
 * Everything here runs with the service client, after the route has
 * checked the staff permission.
 */

export const POS_METHODS = ["cash", "card", "bkash", "nagad", "other"] as const;
export type PosMethod = (typeof POS_METHODS)[number];

const MESSAGES: Record<string, string> = {
  empty_sale: "Add at least one item",
  session_not_open: "Open the cash drawer first (Day tab)",
  invalid_phone: "That mobile number is not valid (01XXXXXXXXX)",
  invalid_quantity: "A quantity is not valid",
  invalid_cost: "A buying price is not valid",
  invalid_payment_method: "Choose how it was paid",
  overpaid_without_cash: "Card or mobile payments cannot be more than the bill",
  coupon_not_found: "No coupon with that code",
  coupon_inactive: "That coupon is turned off",
  coupon_not_started: "That coupon has not started yet",
  coupon_expired: "That coupon has expired",
  coupon_login_required: "That coupon is only for signed-in customers on the website",
  coupon_wrong_group: "That coupon is for a customer group on the website",
  coupon_used_up: "That coupon has been used up",
  coupon_user_limit_reached: "That coupon has been used up",
  sale_not_found: "Sale not found",
  invalid_return_quantity: "More is being returned than was bought",
  no_items: "Choose at least one item",
  showroom_not_found: "No shop is set up. Add a showroom first.",
  invalid_reason: "Choose a reason",
  invalid_transfer: "Choose two different places and a quantity",
  invalid_amount: "Enter the amount",
};

/** Turns a database error into a line a cashier can act on. */
export function explainPosError(message: string): string {
  if (/does not exist|schema cache|Could not find/i.test(message) && /pos_|supplier|stock_apply|stock_receipt|inventory_(receive|adjust|transfer)|customer_stats|low_stock|cost_price|marketing_opt_out/.test(message)) {
    return "The shop system is not set up yet: the Phase 4 migration (20261114100000_pos_stock_crm.sql) has not been applied.";
  }
  const [code, detail] = message.split(":");
  if (code === "insufficient_stock") return `Not enough stock: ${detail ?? ""}. Count it in Stock, then sell.`.replace(": .", ".");
  if (code === "payment_short") return `Payment is ৳${detail} short`;
  if (code === "discount_over_limit") return `The discount is over your ${detail}% limit. Ask a manager.`;
  if (code === "variant_required") return `Choose a size/colour for ${detail}`;
  if (code === "variant_not_found" || code === "product_not_found") return `Product not found: ${detail ?? ""}`;
  return MESSAGES[code.trim()] ?? message;
}

export interface Showroom {
  id: string;
  name: string;
}

export async function listShowrooms(db: SupabaseClient): Promise<Showroom[]> {
  const { data, error } = await db.from("showrooms").select("id, name").eq("is_active", true).order("fulfillment_priority");
  if (error) throw new Error(explainPosError(error.message));
  return (data ?? []) as Showroom[];
}

export interface VariantRow {
  variant_id: string;
  product_id: string;
  title: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  image: string | null;
  /** Total the editor and the site show. */
  stock: number;
  cost_price: number | null;
  low_stock_threshold: number | null;
  is_active: boolean;
}

interface RawVariant {
  id: string;
  product_id: string;
  color_id: string | null;
  size_id: string | null;
  sku: string | null;
  barcode: string | null;
  stock: number;
  cost_price: number | null;
  low_stock_threshold: number | null;
  is_active: boolean;
}

const VARIANT_COLUMNS = "id, product_id, color_id, size_id, sku, barcode, stock, cost_price, low_stock_threshold, is_active";

/** Variants with their product title and a "Red / M" label. */
export async function loadVariants(
  db: SupabaseClient,
  by: { productIds: string[] } | { variantIds: string[] } | { code: string }
): Promise<VariantRow[]> {
  let query = db.from("product_variants").select(VARIANT_COLUMNS).limit(2000);
  if ("productIds" in by) {
    if (!by.productIds.length) return [];
    query = query.in("product_id", by.productIds);
  } else if ("variantIds" in by) {
    if (!by.variantIds.length) return [];
    query = query.in("id", by.variantIds);
  } else {
    const safe = by.code.replace(/[,()"\\]/g, "");
    if (!safe) return [];
    query = query.or(`barcode.eq."${safe}",sku.eq."${safe}"`);
  }
  const { data, error } = await query;
  if (error) throw new Error(explainPosError(error.message));
  const variants = (data ?? []) as RawVariant[];
  if (!variants.length) return [];

  const productIds = [...new Set(variants.map((v) => v.product_id))];
  const [products, colors, sizes] = await Promise.all([
    db.from("products").select("id, title, images").in("id", productIds),
    db.from("colors").select("id, name"),
    db.from("sizes").select("id, name"),
  ]);
  const product = new Map((products.data ?? []).map((p) => [p.id as string, p as { title: string; images: unknown }]));
  const color = new Map((colors.data ?? []).map((c) => [c.id as string, c.name as string]));
  const size = new Map((sizes.data ?? []).map((s) => [s.id as string, s.name as string]));

  return variants.map((v) => {
    const p = product.get(v.product_id);
    const images = Array.isArray(p?.images) ? (p?.images as unknown[]) : [];
    return {
      variant_id: v.id,
      product_id: v.product_id,
      title: p?.title ?? "Product",
      label: [v.color_id ? color.get(v.color_id) : null, v.size_id ? size.get(v.size_id) : null].filter(Boolean).join(" / "),
      sku: v.sku,
      barcode: v.barcode,
      image: typeof images[0] === "string" ? (images[0] as string) : null,
      stock: Number(v.stock) || 0,
      cost_price: v.cost_price === null ? null : Number(v.cost_price),
      low_stock_threshold: v.low_stock_threshold,
      is_active: v.is_active,
    };
  });
}

/** What each variant has on the shelf at one place, less what online orders hold. */
export async function shelfStock(db: SupabaseClient, showroomId: string, variantIds: string[]): Promise<Map<string, { quantity: number; reserved: number }>> {
  const out = new Map<string, { quantity: number; reserved: number }>();
  if (!variantIds.length) return out;
  const { data, error } = await db.from("product_stock").select("variant_id, quantity, reserved_quantity").eq("showroom_id", showroomId).in("variant_id", variantIds);
  if (error) throw new Error(explainPosError(error.message));
  for (const r of data ?? []) out.set(r.variant_id, { quantity: Number(r.quantity) || 0, reserved: Number(r.reserved_quantity) || 0 });
  return out;
}

export async function effectivePrices(db: SupabaseClient, productIds: string[]): Promise<Map<string, { final: number; base: number }>> {
  const out = new Map<string, { final: number; base: number }>();
  if (!productIds.length) return out;
  const { data, error } = await db.rpc("get_effective_prices", { p_product_ids: productIds });
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { product_id: string; final_price: number; base_price: number }[]) {
    out.set(r.product_id, { final: Number(r.final_price), base: Number(r.base_price) });
  }
  return out;
}

export async function numericSetting(db: SupabaseClient, key: string, fallback: number): Promise<number> {
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && data?.value !== undefined && data?.value !== null && data.value !== "" ? n : fallback;
}

export async function staffNames(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data } = await db.from("profiles").select("id, full_name, email").in("id", unique);
  for (const p of data ?? []) out.set(p.id, p.full_name || p.email || "Staff");
  return out;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // The BOM makes Excel read Bangla names correctly.
  return "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
