import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * GET    /api/admin/collections
 * POST   /api/admin/collections   create or update one (with product_ids for manual ones)
 * DELETE /api/admin/collections?id=...
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const KINDS = ["manual", "new", "bestseller"];

export async function GET() {
  try {
    await requirePermission("products.manage");
    const db = getServiceSupabase();
    const [{ data: cols, error }, { data: links }] = await Promise.all([
      db.from("collections").select("*").order("display_order"),
      db.from("collection_products").select("collection_id, product_id, position").order("position"),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const by = new Map<string, string[]>();
    for (const l of links ?? []) by.set(l.collection_id, [...(by.get(l.collection_id) ?? []), l.product_id]);
    return NextResponse.json({ collections: (cols ?? []).map((c) => ({ ...c, product_ids: by.get(c.id) ?? [] })) });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("products.manage");
    const b = (await request.json()) as Record<string, unknown>;
    const slug = String(b.slug ?? "").trim().toLowerCase();
    const title = String(b.title_en ?? "").trim();
    const kind = String(b.kind ?? "manual");
    if (!SLUG.test(slug)) return NextResponse.json({ error: "Slug: lowercase letters, numbers and dashes only" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });

    const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
    const starts = iso(b.starts_at);
    const ends = iso(b.ends_at);
    if (starts && ends && ends <= starts) return NextResponse.json({ error: "End time must be after the start" }, { status: 400 });
    if (b.show_countdown && !ends) return NextResponse.json({ error: "A countdown needs an end time" }, { status: 400 });

    const row = {
      slug,
      title_en: title,
      title_bn: String(b.title_bn ?? "").trim() || null,
      description_en: String(b.description_en ?? "").trim() || null,
      description_bn: String(b.description_bn ?? "").trim() || null,
      banner_url: String(b.banner_url ?? "").trim() || null,
      kind,
      starts_at: starts,
      ends_at: ends,
      show_countdown: Boolean(b.show_countdown),
      show_in_menu: Boolean(b.show_in_menu),
      display_order: Number(b.display_order) || 0,
      is_active: b.is_active !== false,
    };
    const db = getServiceSupabase();
    const { data, error } = b.id
      ? await db.from("collections").update(row).eq("id", String(b.id)).select("id").single()
      : await db.from("collections").insert(row).select("id").single();
    if (error) {
      return NextResponse.json({ error: error.code === "23505" ? "That slug is already used" : error.message }, { status: error.code === "23505" ? 409 : 500 });
    }

    if (kind === "manual" && Array.isArray(b.product_ids)) {
      const ids = (b.product_ids as unknown[]).map(String);
      await db.from("collection_products").delete().eq("collection_id", data.id);
      if (ids.length > 0) {
        const { error: linkError } = await db
          .from("collection_products")
          .insert(ids.map((product_id, position) => ({ collection_id: data.id, product_id, position })));
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
    const { error } = await getServiceSupabase().from("collections").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
