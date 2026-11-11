import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * GET /api/admin/proof-settings, PUT { key: value, ... }
 * Thresholds and on/off for scarcity and social proof (app_settings proof_*).
 */
const NUMERIC = ["proof_low_stock_max", "proof_recent_sales_min", "proof_viewers_min", "proof_bestseller_min"];
const SWITCH = ["proof_enabled", "proof_recent_popup"];

export async function GET() {
  try {
    await requirePermission("products.manage");
    const { data, error } = await getServiceSupabase().from("app_settings").select("key, value").like("key", "proof\\_%");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermission("products.manage");
    const body = (await request.json()) as Record<string, unknown>;
    const rows: { key: string; value: string; updated_at: string }[] = [];
    for (const [key, raw] of Object.entries(body)) {
      const value = String(raw).trim();
      if (NUMERIC.includes(key)) {
        if (!/^\d{1,4}$/.test(value)) return NextResponse.json({ error: `${key} must be a whole number` }, { status: 400 });
      } else if (SWITCH.includes(key)) {
        if (value !== "on" && value !== "off") return NextResponse.json({ error: `${key} must be on or off` }, { status: 400 });
      } else {
        return NextResponse.json({ error: `Unknown setting ${key}` }, { status: 400 });
      }
      rows.push({ key, value, updated_at: new Date().toISOString() });
    }
    if (rows.length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    const { error } = await getServiceSupabase().from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
