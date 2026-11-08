import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { DHAKA_CITY_THANAS } from "@/lib/bd-geo";

/**
 * GET /api/admin/settings   PUT /api/admin/settings { key: value, ... }
 *
 * Shop settings staff can change: delivery charges, free delivery, the
 * advance rule, risk bands, courier rules and the inside-Dhaka thana list.
 * Only these keys; anything else in app_settings is left alone.
 */
type Rule = { kind: "number"; min: number; max: number } | { kind: "courier" } | { kind: "thanas" };

const RULES: Record<string, Rule> = {
  delivery_fee_dhaka: { kind: "number", min: 0, max: 1000 },
  delivery_fee_outside: { kind: "number", min: 0, max: 2000 },
  free_delivery_over: { kind: "number", min: 0, max: 1_000_000 },
  cod_min_advance: { kind: "number", min: 0, max: 5000 },
  cod_high_value: { kind: "number", min: 0, max: 1_000_000 },
  risk_low_max: { kind: "number", min: 0, max: 100 },
  risk_high_min: { kind: "number", min: 0, max: 100 },
  courier_dhaka: { kind: "courier" },
  courier_outside: { kind: "courier" },
  dhaka_inside_thanas: { kind: "thanas" },
};

export async function GET() {
  try {
    const { supabase } = await requirePermission("settings.manage");
    const { data, error } = await supabase.from("app_settings").select("key, value").in("key", Object.keys(RULES));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      settings: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])),
      default_dhaka_thanas: DHAKA_CITY_THANAS,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase } = await requirePermission("settings.manage");
    const body = (await request.json()) as Record<string, unknown>;
    const rows: { key: string; value: string; updated_at: string }[] = [];

    for (const [key, raw] of Object.entries(body)) {
      const rule = RULES[key];
      if (!rule) continue;
      let value: string;
      if (rule.kind === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < rule.min || n > rule.max) {
          return NextResponse.json({ error: `${key} must be between ${rule.min} and ${rule.max}` }, { status: 400 });
        }
        value = String(n);
      } else if (rule.kind === "courier") {
        if (raw !== "steadfast" && raw !== "pathao") {
          return NextResponse.json({ error: `${key} must be steadfast or pathao` }, { status: 400 });
        }
        value = raw;
      } else {
        const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
        value = list.length ? JSON.stringify(list.map((x) => x.trim())) : "";
      }
      rows.push({ key, value, updated_at: new Date().toISOString() });
    }

    const low = Number(body.risk_low_max ?? NaN);
    const high = Number(body.risk_high_min ?? NaN);
    if (Number.isFinite(low) && Number.isFinite(high) && low >= high) {
      return NextResponse.json({ error: "The low-risk limit must be below the high-risk limit" }, { status: 400 });
    }
    if (rows.length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: rows.length });
  } catch (error) {
    return handleAdminError(error);
  }
}
