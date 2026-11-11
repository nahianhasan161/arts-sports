import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { TERM_TYPES } from "@/lib/services/catalog";

/**
 * GET    /api/admin/catalog-terms            all terms with their product ids
 * POST   /api/admin/catalog-terms            create or update one term (and its products)
 * DELETE /api/admin/catalog-terms?id=...
 * Terms are teams, leagues, players, seasons, brands and editions.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function GET() {
  try {
    await requirePermission("products.manage");
    const db = getServiceSupabase();
    const [{ data: terms, error }, { data: links }] = await Promise.all([
      db.from("catalog_terms").select("*").order("type").order("display_order").order("name_en"),
      db.from("product_terms").select("term_id, product_id"),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const byTerm = new Map<string, string[]>();
    for (const l of links ?? []) byTerm.set(l.term_id, [...(byTerm.get(l.term_id) ?? []), l.product_id]);
    return NextResponse.json({ terms: (terms ?? []).map((t) => ({ ...t, product_ids: byTerm.get(t.id) ?? [] })) });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("products.manage");
    const b = (await request.json()) as Record<string, unknown>;
    const type = String(b.type ?? "");
    const slug = String(b.slug ?? "").trim().toLowerCase();
    const name = String(b.name_en ?? "").trim();
    if (!(TERM_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    if (!SLUG.test(slug)) return NextResponse.json({ error: "Slug: lowercase letters, numbers and dashes only" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const row = {
      type,
      slug,
      name_en: name,
      name_bn: String(b.name_bn ?? "").trim() || null,
      description_en: String(b.description_en ?? "").trim() || null,
      description_bn: String(b.description_bn ?? "").trim() || null,
      image_url: String(b.image_url ?? "").trim() || null,
      details: typeof b.details === "object" && b.details ? b.details : {},
      is_featured: Boolean(b.is_featured),
      display_order: Number(b.display_order) || 0,
      is_active: b.is_active !== false,
    };
    const db = getServiceSupabase();
    const { data, error } = b.id
      ? await db.from("catalog_terms").update(row).eq("id", String(b.id)).select("id").single()
      : await db.from("catalog_terms").insert(row).select("id").single();
    if (error) {
      return NextResponse.json({ error: error.code === "23505" ? "That slug is already used for this type" : error.message }, { status: error.code === "23505" ? 409 : 500 });
    }

    if (Array.isArray(b.product_ids)) {
      const ids = (b.product_ids as unknown[]).map(String);
      await db.from("product_terms").delete().eq("term_id", data.id);
      if (ids.length > 0) {
        const { error: linkError } = await db.from("product_terms").insert(ids.map((product_id) => ({ product_id, term_id: data.id })));
        if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
      }
    }
    return NextResponse.json({ id: data.id });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermission("products.manage");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await getServiceSupabase().from("catalog_terms").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
