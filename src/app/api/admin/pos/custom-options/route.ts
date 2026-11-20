import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { loadPricing } from "@/lib/custom-jersey/server";
import { normalizeOptions, normalizePricing } from "@/lib/custom-jersey/pricing";
import { OPTION_GROUPS, type OptionGroup } from "@/lib/custom-jersey/types";
import { bad, failed } from "@/lib/pos/http";

/**
 * The POS custom jersey panel's own lists: sleeve, collar, extras, logo, sizes.
 * Kept inside the price table (app_settings.custom_jersey_pricing.options).
 *
 * GET                       { options, tiers, min_per_piece, can_edit }   (pos.use)
 * PUT { group, items }      replace one list                              (custom_orders.manage)
 * PUT { group: "quantity", tiers, min_per_piece }
 *                           quantity discount steps (on the whole order) and the lowest price per piece
 *
 * Orders already taken keep the names and prices they were made with
 * (estimate_breakdown.choices), so editing or deleting an option changes only new orders.
 */
export async function GET() {
  try {
    const { supabase } = await requirePermission("pos.use");
    const [pricing, can] = await Promise.all([loadPricing(), supabase.rpc("has_permission", { p_code: "custom_orders.manage" })]);
    return NextResponse.json({ options: pricing.options, tiers: pricing.tiers, min_per_piece: pricing.min_per_piece, can_edit: can.data === true });
  } catch (error) {
    return failed(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("custom_orders.manage");
    const b = (await request.json().catch(() => ({}))) as { group?: string; items?: unknown; tiers?: unknown; min_per_piece?: unknown };
    if (b.group === "quantity") {
      const current = await loadPricing();
      if (!Array.isArray(b.tiers)) return bad("tiers is required");
      const pricing = normalizePricing({ ...current, tiers: [{ min: 1, discount_percent: 0 }, ...b.tiers.filter((t) => Number((t as { min?: unknown })?.min) > 1)], min_per_piece: b.min_per_piece });
      const { error } = await getServiceSupabase(user)
        .from("app_settings")
        .upsert({ key: "custom_jersey_pricing", value: JSON.stringify(pricing), updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ options: pricing.options, tiers: pricing.tiers, min_per_piece: pricing.min_per_piece });
    }
    const group = OPTION_GROUPS.find((g) => g === b.group) as OptionGroup | undefined;
    if (!group) return bad("Unknown list");
    if (!Array.isArray(b.items)) return bad("items is required");

    const current = await loadPricing();
    const cleaned = normalizeOptions({ ...current.options, [group]: b.items }, current.extras);
    if (group === "sizes" && cleaned.sizes.length === 0) return bad("Keep at least one size");
    const pricing = normalizePricing({ ...current, options: cleaned });
    const { error } = await getServiceSupabase(user)
      .from("app_settings")
      .upsert({ key: "custom_jersey_pricing", value: JSON.stringify(pricing), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ options: pricing.options });
  } catch (error) {
    return failed(error);
  }
}
