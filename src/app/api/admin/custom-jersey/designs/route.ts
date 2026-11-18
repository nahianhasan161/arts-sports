import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { publicUrlFor } from "@/lib/media/storage";
import { isStaffImagePath } from "@/lib/custom-jersey/files";
import { explainDbError } from "@/lib/custom-jersey/server";
import { DESIGN_SLUG, MAX_DESIGN_IMAGES, OTHER_CATEGORY, designSlug } from "@/lib/custom-jersey/designs";
import { listDesigns, loadDesignCategories } from "@/lib/custom-jersey/designs-server";

/**
 * Design catalogue for custom jerseys: categories and the designs in them.
 *
 * GET    ?category=&q=&offset=        all categories (with counts) + one page of designs, hidden ones included
 * POST   { entity: "category", slug?, isNew?, name_en, name_bn, image_path | image_url:null, display_order, is_active }
 * POST   { entity: "design", id?, images?: (upload path | URL already on this design)[], image_path?, title, caption, category, is_published, display_order }
 * POST   { entity: "move", ids: string[], category }   move several designs to another category
 * DELETE ?entity=category&slug=   (its designs move to "other")  |  ?entity=design&id=
 */

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const MISSING = /custom_design_categories|column .*category/;

export async function GET(request: Request) {
  try {
    const { user: actor } = await requirePermission("custom_orders.manage");
    const url = new URL(request.url);
    const db = getServiceSupabase(actor);
    const [categories, page, all] = await Promise.all([
      loadDesignCategories(db, true),
      listDesigns(db, { category: url.searchParams.get("category"), q: url.searchParams.get("q"), offset: Number(url.searchParams.get("offset")) || 0, limit: 60, all: true }),
      db.from("custom_gallery").select("category").limit(10000),
    ]);
    if (page.error) return bad(MISSING.test(page.error) ? "Run migration 20261118120000 first (design categories)." : page.error, MISSING.test(page.error) ? 503 : 500);
    const counts = new Map<string, number>();
    for (const r of (all.data ?? []) as { category: string | null }[]) {
      const k = r.category ?? OTHER_CATEGORY;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return NextResponse.json({
      categories: categories.map((c) => ({ ...c, count: counts.get(c.slug) ?? 0 })),
      total: all.data?.length ?? 0,
      designs: page.designs,
      has_more: page.has_more,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user: actor } = await requirePermission("custom_orders.manage");
    const b = (await request.json()) as Record<string, unknown>;
    const db = getServiceSupabase(actor);

    if (b.entity === "category") {
      const name = text(b.name_en, 60);
      if (!name) return bad("Name (English) is required");
      const row: Record<string, unknown> = {
        name_en: name,
        name_bn: text(b.name_bn, 60) || null,
        display_order: Math.floor(Number(b.display_order)) || 0,
        is_active: b.is_active !== false,
      };
      if (isStaffImagePath(b.image_path)) row.image_url = publicUrlFor(b.image_path);
      else if (b.image_url === null) row.image_url = null;
      if (b.isNew) {
        const slug = designSlug(text(b.slug, 40) || name) || crypto.randomUUID().slice(0, 8);
        if (!DESIGN_SLUG.test(slug)) return bad("Use English letters or numbers in the name");
        const { error } = await db.from("custom_design_categories").insert({ ...row, slug });
        if (error) return bad(error.code === "23505" ? "A category with that name already exists" : explainDbError(error.message), error.code === "23505" ? 409 : 500);
        return NextResponse.json({ ok: true, slug });
      }
      const slug = text(b.slug, 40);
      if (!DESIGN_SLUG.test(slug)) return bad("Unknown category");
      if (slug === OTHER_CATEGORY) row.is_active = true;
      const { error } = await db.from("custom_design_categories").update(row).eq("slug", slug);
      if (error) return bad(explainDbError(error.message), 500);
      return NextResponse.json({ ok: true, slug });
    }

    if (b.entity === "design") {
      const id = text(b.id, 64) || null;
      const category = text(b.category, 40);
      const row: Record<string, unknown> = {
        title: text(b.title, 120) || null,
        caption: text(b.caption, 200) || null,
        category: DESIGN_SLUG.test(category) ? category : OTHER_CATEGORY,
        is_published: b.is_published !== false,
        display_order: Math.floor(Number(b.display_order)) || 0,
      };
      if (Array.isArray(b.images)) {
        // Ordered list, cover first. Existing URLs must already belong to this design.
        let kept = new Set<string>();
        if (id) {
          const cur = await db.from("custom_gallery").select("image_url, images").eq("id", id).single();
          if (cur.error) return bad(explainDbError(cur.error.message), 500);
          kept = new Set([cur.data.image_url, ...((cur.data.images as string[] | null) ?? [])]);
        }
        const images: string[] = [];
        for (const v of b.images) {
          const url = isStaffImagePath(v) ? publicUrlFor(v) : typeof v === "string" && kept.has(v) ? v : null;
          if (url && !images.includes(url)) images.push(url);
        }
        if (!images.length) return bad("A design needs at least one picture");
        row.images = images.slice(0, MAX_DESIGN_IMAGES);
        row.image_url = images[0];
      } else if (isStaffImagePath(b.image_path)) {
        row.image_url = publicUrlFor(b.image_path);
        row.images = [row.image_url];
      } else if (!id) return bad("Upload the picture first");
      const res = id
        ? await db.from("custom_gallery").update(row).eq("id", id).select("id").single()
        : await db.from("custom_gallery").insert(row).select("id").single();
      if (res.error) return bad(res.error.code === "23503" ? "That category no longer exists" : explainDbError(res.error.message), 500);
      return NextResponse.json({ ok: true, id: res.data.id });
    }

    if (b.entity === "move") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string").slice(0, 200);
      const category = text(b.category, 40);
      if (!ids.length || !DESIGN_SLUG.test(category)) return bad("Pick designs and a category");
      const { error } = await db.from("custom_gallery").update({ category }).in("id", ids);
      if (error) return bad(explainDbError(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown entity");
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user: actor } = await requirePermission("custom_orders.manage");
    const url = new URL(request.url);
    const db = getServiceSupabase(actor);
    if (url.searchParams.get("entity") === "category") {
      const slug = url.searchParams.get("slug") ?? "";
      if (!DESIGN_SLUG.test(slug)) return bad("Unknown category");
      if (slug === OTHER_CATEGORY) return bad("\"Other\" is kept; designs without a category go there");
      const moved = await db.from("custom_gallery").update({ category: OTHER_CATEGORY }).eq("category", slug);
      if (moved.error) return bad(moved.error.message, 500);
      const { error } = await db.from("custom_design_categories").delete().eq("slug", slug);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true });
    }
    const id = url.searchParams.get("id");
    if (!id) return bad("id is required");
    // Orders keep a copy of the picture's URL, so old orders still show it.
    const { error } = await db.from("custom_gallery").delete().eq("id", id);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
