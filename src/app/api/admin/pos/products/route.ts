import { NextResponse } from "next/server";
import { failed } from "@/lib/pos/http";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PosProduct } from "@/lib/pos/types";
import { effectivePrices, explainPosError, listShowrooms, loadVariants, shelfStock } from "@/lib/pos/server";

/**
 * GET /api/admin/pos/products?q=<barcode, SKU or name>&showroom_id=
 * GET /api/admin/pos/products?category_id=&showroom_id=&categories=1
 * GET /api/admin/pos/products?categories_only=1&cat_offset=&cat_limit=   next page of categories
 *   (browsing also takes limit= and offset= for the grid's lazy loading; the answer has has_more)
 * GET /api/admin/pos/products?ids=<id,id,...>&showroom_id=   these products (copying a past sale)
 *
 * Without `q` it lists products for the register's grid (one category, or
 * the first ones by name); `categories=1` adds the top-level categories.
 *
 * A scanner types the barcode and presses Enter, so an exact barcode or SKU
 * match comes back as `scanned` and the POS adds it without another click.
 */
export async function GET(request: Request) {
  try {
    // The register and the supplier-purchase screen share this grid.
    const { user: actor } = await requirePermission("pos.use").catch(() => requirePermission("inventory.manage"));
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const db = getServiceSupabase(actor);
    const categoryId = (url.searchParams.get("category_id") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);

    const idList = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((i) => i.replace(/[^A-Za-z0-9_-]/g, ""))
      .filter(Boolean)
      .slice(0, 100);

    const int = (k: string, d: number, max: number) => Math.min(max, Math.max(0, Number(url.searchParams.get(k) ?? d) || 0));
    const limit = Math.max(1, int("limit", 60, 100));
    const offset = int("offset", 0, 100000);
    const catLimit = Math.max(1, int("cat_limit", 20, 60));
    const catOffset = int("cat_offset", 0, 10000);
    const wantCategories = url.searchParams.get("categories") === "1" || url.searchParams.get("categories_only") === "1";

    // Independent reads run together: the shop list, the category strip and
    // the barcode/SKU lookup. Each used to wait for the one before it.
    const [showrooms, categoryRows] = await Promise.all([
      listShowrooms(db),
      wantCategories
        ? // "*" so the strip keeps working before the image_url migration is applied.
          // One extra row says whether the strip has another page.
          db.from("categories").select("*").is("parent_id", null).order("name").order("id").range(catOffset, catOffset + catLimit)
        : null,
    ]);
    const categoriesHasMore = categoryRows ? (categoryRows.data ?? []).length > catLimit : false;
    const categories = categoryRows ? (categoryRows.data ?? []).slice(0, catLimit).map((c) => ({ id: c.id as string, name: c.name as string, image: ((c as { image_url?: string | null }).image_url ?? null) })) : undefined;
    const showroomId = showrooms.find((s) => s.id === url.searchParams.get("showroom_id"))?.id ?? showrooms[0]?.id;
    if (!showroomId) return NextResponse.json({ error: "No shop is set up. Add a showroom first." }, { status: 400 });
    if (url.searchParams.get("categories_only") === "1") return NextResponse.json({ categories: categories ?? [], categoriesHasMore });

    // Fast path: one SQL call does the pick, prices, variants and shelf stock
    // (migration 20261117100000). Falls back to the reads below if it is missing.
    const grid = await db.rpc("pos_register_grid", {
      p_showroom_id: showroomId,
      p_category_id: categoryId || null,
      p_q: q || null,
      p_ids: idList.length ? idList : null,
      p_limit: limit,
      p_offset: offset,
    });
    if (!grid.error && grid.data) {
      const g = grid.data as { products: PosProduct[]; scanned: string | null; has_more?: boolean };
      return NextResponse.json({ products: g.products ?? [], scanned: g.scanned ?? null, has_more: Boolean(g.has_more), categories, categoriesHasMore });
    }

    const exact = q ? await loadVariants(db, { code: q }) : [];
    let productIds = [...new Set(exact.map((v) => v.product_id))];
    const scanned = exact.length === 1 ? exact[0].variant_id : null;

    const ids = idList;
    let hasMore = false;
    if (ids.length) {
      productIds = [...new Set(ids)];
    } else if (!q) {
      // The grid: one category (or a sub-category of it), else the first products by name.
      let browse = db.from("products").select("id").is("deleted_at", null).order("title").order("id").range(offset, offset + limit);
      if (categoryId) browse = browse.or(`category_id.eq.${categoryId},sub_category_id.eq.${categoryId}`);
      const { data, error } = await browse;
      if (error) return NextResponse.json({ error: explainPosError(error.message) }, { status: 500 });
      hasMore = (data ?? []).length > limit;
      productIds = (data ?? []).slice(0, limit).map((p) => p.id);
    } else if (!productIds.length) {
      const safe = q.replace(/[%,()]/g, " ").trim();
      const { data, error } = await db
        .from("products")
        .select("id")
        .is("deleted_at", null)
        .or(`title.ilike.%${safe}%,sku.ilike.%${safe}%`)
        .order("title")
        .limit(12);
      if (error) {
        // products.sku is not on every install; fall back to the title alone.
        const retry = await db.from("products").select("id").is("deleted_at", null).ilike("title", `%${safe}%`).order("title").limit(12);
        if (retry.error) return NextResponse.json({ error: explainPosError(retry.error.message) }, { status: 500 });
        productIds = (retry.data ?? []).map((p) => p.id);
      } else {
        productIds = (data ?? []).map((p) => p.id);
      }
    }
    if (!productIds.length) return NextResponse.json({ products: [], scanned: null, has_more: false, categories, categoriesHasMore });

    // One products read, shared with loadVariants (it used to fetch them again).
    const plainQuery = db.from("products").select("id, title, images, stock").in("id", productIds);
    const plainRows = Promise.resolve(plainQuery).then((r) => (r.data ?? []) as { id: string; title: string; images: unknown; stock: number }[]);
    const [variants, prices, plain] = await Promise.all([
      loadVariants(db, { productIds }, plainRows),
      effectivePrices(db, productIds),
      plainRows,
    ]);
    const shelf = await shelfStock(db, showroomId, variants.map((v) => v.variant_id));

    const products: PosProduct[] = [];
    for (const p of plain) {
      const own = variants.filter((v) => v.product_id === p.id && v.is_active);
      const images = Array.isArray(p.images) ? p.images : [];
      const price = prices.get(p.id);
      if (!price) continue;
      products.push({
        product_id: p.id,
        title: p.title,
        image: typeof images[0] === "string" ? images[0] : null,
        price: price.final,
        base_price: price.base,
        variants: own.length
          ? own.map((v) => {
              const s = shelf.get(v.variant_id);
              return { variant_id: v.variant_id, label: v.label, sku: v.sku, barcode: v.barcode, available: s ? Math.max(0, s.quantity - s.reserved) : 0 };
            })
          : [{ variant_id: null, label: "", sku: null, barcode: null, available: Number(p.stock) || 0 }],
      });
    }
    products.sort((a, b) => a.title.localeCompare(b.title));
    return NextResponse.json({ products, scanned, has_more: hasMore, categories, categoriesHasMore });
  } catch (error) {
    return failed(error);
  }
}
