import { NextResponse } from "next/server";
import { failed } from "@/lib/pos/http";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { PosProduct } from "@/lib/pos/types";
import { effectivePrices, explainPosError, listShowrooms, loadVariants, shelfStock } from "@/lib/pos/server";

/**
 * GET /api/admin/pos/products?q=<barcode, SKU or name>&showroom_id=
 *
 * A scanner types the barcode and presses Enter, so an exact barcode or SKU
 * match comes back as `scanned` and the POS adds it without another click.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("pos.use");
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (!q) return NextResponse.json({ products: [], scanned: null });
    const db = getServiceSupabase();

    const showrooms = await listShowrooms(db);
    const showroomId = showrooms.find((s) => s.id === url.searchParams.get("showroom_id"))?.id ?? showrooms[0]?.id;
    if (!showroomId) return NextResponse.json({ error: "No shop is set up. Add a showroom first." }, { status: 400 });

    const exact = await loadVariants(db, { code: q });
    let productIds = [...new Set(exact.map((v) => v.product_id))];
    const scanned = exact.length === 1 ? exact[0].variant_id : null;

    if (!productIds.length) {
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
    if (!productIds.length) return NextResponse.json({ products: [], scanned: null });

    const [variants, prices, plain] = await Promise.all([
      loadVariants(db, { productIds }),
      effectivePrices(db, productIds),
      db.from("products").select("id, title, images, stock").in("id", productIds),
    ]);
    const shelf = await shelfStock(db, showroomId, variants.map((v) => v.variant_id));

    const products: PosProduct[] = [];
    for (const p of plain.data ?? []) {
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
    return NextResponse.json({ products, scanned });
  } catch (error) {
    return failed(error);
  }
}
