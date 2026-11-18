import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { publicUrlFor } from "@/lib/media/storage";
import { isStaffImagePath } from "@/lib/custom-jersey/files";
import { normalizePricing } from "@/lib/custom-jersey/pricing";
import { explainDbError, loadConfig } from "@/lib/custom-jersey/server";
import { PATTERNS, SPORTS } from "@/lib/custom-jersey/types";

/**
 * Custom jersey setup: fabrics, the price table, design templates.
 * (Gallery designs and their categories: /api/admin/custom-jersey/designs.)
 *
 * GET    everything, including switched-off rows
 * PUT    { pricing }                                   replace the price table
 * POST   { entity: "fabric" | "template", ...fields }   create, or update when id is given
 * DELETE ?entity=...&id=...
 */

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export async function GET() {
  try {
    await requirePermission("custom_orders.manage");
    return NextResponse.json(await loadConfig(true));
  } catch (error) {
    if (error instanceof Error && /migration/.test(error.message)) return bad(error.message, 503);
    return handleAdminError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user: actor } = await requirePermission("custom_orders.manage");
    const b = (await request.json()) as { pricing?: unknown };
    if (!b.pricing || typeof b.pricing !== "object") return bad("pricing is required");
    const pricing = normalizePricing(b.pricing);
    if (pricing.tiers[0].min !== 1) return bad("The first quantity step must start at 1");
    if (pricing.rush.min_days > pricing.rush.normal_days) return bad("The fastest time cannot be longer than the normal time");
    const { error } = await getServiceSupabase(actor)
      .from("app_settings")
      .upsert({ key: "custom_jersey_pricing", value: JSON.stringify(pricing), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ pricing });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user: actor } = await requirePermission("custom_orders.manage");
    const b = (await request.json()) as Record<string, unknown>;
    const db = getServiceSupabase(actor);
    const id = text(b.id, 64) || null;
    let table: string;
    let row: Record<string, unknown>;

    if (b.entity === "fabric") {
      const name = text(b.name_en, 80);
      const price = Number(b.price_per_piece);
      if (!name) return bad("Name is required");
      if (!Number.isFinite(price) || price < 0) return bad("Price per piece is required");
      table = "custom_fabrics";
      row = {
        name_en: name,
        name_bn: text(b.name_bn, 80) || null,
        description_en: text(b.description_en, 400) || null,
        description_bn: text(b.description_bn, 400) || null,
        price_per_piece: price,
        display_order: Math.floor(Number(b.display_order)) || 0,
        is_active: b.is_active !== false,
      };
      if (isStaffImagePath(b.image_path)) row.image_url = publicUrlFor(b.image_path);
      else if (b.image_url === null) row.image_url = null;
      if (!id) row.slug = slugify(text(b.slug, 80) || name) || crypto.randomUUID().slice(0, 8);
    } else if (b.entity === "template") {
      const name = text(b.name_en, 80);
      const sport = SPORTS.find((s) => s === b.sport);
      const pattern = PATTERNS.find((p) => p === b.pattern);
      const colors = (Array.isArray(b.default_colors) ? b.default_colors : []).filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c));
      if (!name || !sport || !pattern) return bad("Name, sport and pattern are required");
      if (colors.length !== 3) return bad("Three colours are required");
      table = "jersey_templates";
      row = {
        name_en: name,
        name_bn: text(b.name_bn, 80) || null,
        sport,
        pattern,
        default_colors: colors,
        display_order: Math.floor(Number(b.display_order)) || 0,
        is_active: b.is_active !== false,
      };
      if (!id) row.slug = slugify(`${sport}-${name}`) || crypto.randomUUID().slice(0, 8);
    } else {
      return bad("Unknown entity");
    }

    const { error } = id ? await db.from(table).update(row).eq("id", id) : await db.from(table).insert(row);
    if (error) return bad(error.code === "23505" ? "Another one already has that name" : explainDbError(error.message), error.code === "23505" ? 409 : 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user: actor } = await requirePermission("custom_orders.manage");
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const entity = url.searchParams.get("entity");
    const table = entity === "fabric" ? "custom_fabrics" : entity === "template" ? "jersey_templates" : null;
    if (!id || !table) return bad("entity and id are required");
    // Orders keep the fabric's name, so removing a fabric does not change old orders.
    // Its stock entries would be deleted with it (and the supplier due they make), so a fabric with stock stays.
    const db = getServiceSupabase(actor);
    if (entity === "fabric") {
      const { count } = await db.from("fabric_moves").select("id", { count: "exact", head: true }).eq("fabric_id", id);
      if (count) return bad("This fabric has stock entries (Fabric stock page), so it can't be deleted. Switch it off instead.", 409);
    }
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
