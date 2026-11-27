import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { colorKey, entryKey, imageFileKey, readColorMedia, readDefaultVariant, videoEntry, type ColorMedia, type DefaultVariant } from "@/lib/products/color-images";
import { readVideos } from "@/lib/media/video";

/**
 * PUT /api/admin/products/[productId]/color-images
 *   { color_images?: { "<colour>": ["<image url>" | "video:<key>", ...] }, default_variant?: { color?, size? } }
 *
 * Each field is written only when it is sent.
 * Replaces the product's colour → pictures/videos map (`products.color_images`). Only the
 * product's own colours and its own pictures are kept; anything else is
 * dropped, so a stale picker cannot point a colour at another product's photo.
 */
type Params = { params: Promise<{ productId: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { user: actor } = await requirePermission("products.manage");
    const { productId } = await params;
    const body = (await request.json().catch(() => ({}))) as { color_images?: unknown; default_variant?: unknown };
    const wanted = readColorMedia(body.color_images);
    const db = getServiceSupabase(actor);

    const { data: row, error } = await db.from("products").select("images, colors, sizes, videos").eq("id", productId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const images = Array.isArray(row.images) ? (row.images as unknown[]).filter((x): x is string => typeof x === "string") : [];
    // Comparable key → the entry to store (own url for pictures, video entry for videos).
    const own = new Map<string, string>([
      ...images.map((url) => [imageFileKey(url), url] as [string, string]),
      ...readVideos(row.videos).map((v) => [videoEntry(v), videoEntry(v)] as [string, string]),
    ]);
    const colors = new Set(
      (Array.isArray(row.colors) ? (row.colors as { name?: unknown }[]) : [])
        .map((c) => (typeof c?.name === "string" ? colorKey(c.name) : ""))
        .filter(Boolean),
    );

    const clean: ColorMedia = {};
    for (const [color, list] of Object.entries(wanted)) {
      if (!colors.has(color)) continue;
      const kept = list.map((entry) => own.get(entryKey(entry))).filter((x): x is string => !!x);
      if (kept.length) clean[color] = [...new Set(kept)];
    }

    const sizes = new Set(
      (Array.isArray(row.sizes) ? (row.sizes as { size?: unknown }[]) : [])
        .map((x) => (typeof x?.size === "string" ? x.size.trim().toLowerCase() : ""))
        .filter(Boolean),
    );
    const want = readDefaultVariant(body.default_variant);
    const first: DefaultVariant = {};
    if (want.color && colors.has(want.color)) first.color = want.color;
    if (want.size && sizes.has(want.size)) first.size = want.size;

    const update: Record<string, unknown> = {};
    if ("color_images" in body) update.color_images = clean;
    if ("default_variant" in body) update.default_variant = first;
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });
    const { error: saveError } = await db.from("products").update(update).eq("id", productId);
    if (saveError) {
      const missing = /color_images|default_variant/.test(saveError.message);
      return NextResponse.json(
        { error: missing ? "Colour photos need the database update 20261127100000 first" : saveError.message },
        { status: missing ? 409 : 500 },
      );
    }
    return NextResponse.json({ ok: true, color_images: clean, default_variant: first });
  } catch (error) {
    return handleAdminError(error);
  }
}
