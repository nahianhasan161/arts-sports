import "server-only";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { getServerUrl } from "@/lib/config";
import { plainText } from "@/lib/seo/product-seo";

/**
 * Every buyable item of the catalogue, one per switched-on variation (or one
 * per product without variations), for the product feeds:
 *   /api/feeds/meta     Meta Commerce Manager (CSV)
 *   /feeds/google.xml   Google Merchant Center: Shopping, free listings, Gemini / AI Mode
 * Item ids are variant ids, grouped by product id (item_group_id), so the
 * pixels' product-id content_ids match.
 */
export interface FeedItem {
  id: string;
  groupId: string;
  title: string;
  description: string;
  availability: "in stock" | "out of stock";
  /** Regular price. */
  price: number;
  /** Price after the product's discount, when lower. */
  salePrice: number | null;
  link: string;
  image: string;
  additionalImages: string[];
  brand: string;
  productType: string;
  color: string;
  size: string;
  quantity: number;
  gender: string;
}

export async function loadFeedItems(): Promise<FeedItem[] | null> {
  if (!isServiceSupabaseConfigured()) return null;
  const db = getServiceSupabase();
  const site = getServerUrl().replace(/\/+$/, "");
  const abs = (url: string) => (/^https?:\/\//.test(url) ? url : `${site}${url.startsWith("/") ? "" : "/"}${url}`);

  const [{ data: products }, { data: variants }, { data: stock }, { data: colors }, { data: sizes }, { data: brandRows }, { data: genders }] =
    await Promise.all([
      db
        .from("products_with_effective_pricing")
        .select("id, slug, title, description, category_name, sub_category_name, effective_base_price, effective_price, specs, status")
        .eq("status", "published"),
      db.from("product_variants").select("id, product_id, color_id, size_id, sku, regular_price_override, is_active").eq("is_active", true),
      db.from("product_stock").select("variant_id, quantity, reserved_quantity"),
      db.from("colors").select("id, name"),
      db.from("sizes").select("id, name, display_name"),
      db.from("product_terms").select("product_id, catalog_terms!inner(type, name_en)").eq("catalog_terms.type", "brand"),
      db.from("products").select("id, gender, short_description, images").is("deleted_at", null),
    ]);

  // From products itself: the pricing view's columns were fixed when it was made.
  const live = new Set((genders ?? []).map((g) => g.id as string));
  const genderOf = new Map((genders ?? []).map((g) => [g.id as string, (g.gender as string | null) ?? ""]));
  const summaryOf = new Map((genders ?? []).map((g) => [g.id as string, (g.short_description as string | null) ?? ""]));
  // Picture URLs as the shop shows them: the view returns bare storage paths
  // (which made every feed image link a 404).
  const imagesOf = new Map((genders ?? []).map((g) => [g.id as string, g.images as unknown]));
  const brandOf = new Map<string, string>();
  for (const r of brandRows ?? []) {
    const t = (r as unknown as { catalog_terms: { name_en: string } }).catalog_terms;
    if (t?.name_en) brandOf.set(r.product_id as string, t.name_en);
  }
  const colorName = new Map((colors ?? []).map((c) => [c.id, c.name]));
  const sizeName = new Map((sizes ?? []).map((s) => [s.id, s.display_name || s.name]));
  const available = new Map<string, number>();
  for (const s of stock ?? []) {
    available.set(s.variant_id, (available.get(s.variant_id) ?? 0) + Math.max(0, s.quantity - (s.reserved_quantity ?? 0)));
  }
  const byProduct = new Map<string, NonNullable<typeof variants>>();
  for (const v of variants ?? []) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(v);
    byProduct.set(v.product_id, list);
  }

  const items: FeedItem[] = [];
  for (const p of products ?? []) {
    if (!live.has(p.id)) continue;
    const own = imagesOf.get(p.id);
    const images = (Array.isArray(own) ? own : []).filter((x: unknown): x is string => typeof x === "string" && x !== "");
    if (images.length === 0) continue; // Meta and Google reject items without an image.
    const base = Number(p.effective_base_price ?? 0);
    const final = Number(p.effective_price ?? base);
    const specBrand = (p.specs as Record<string, unknown> | null)?.brand;
    const brand = brandOf.get(p.id) || (typeof specBrand === "string" && specBrand ? specBrand : "Arts Sports");
    const description = (plainText(p.description) || plainText(summaryOf.get(p.id)) || p.title).slice(0, 4900);
    const list = byProduct.get(p.id) ?? [];
    for (const v of list.length ? list : [null]) {
      const color = v?.color_id ? (colorName.get(v.color_id) ?? "") : "";
      const size = v?.size_id ? (sizeName.get(v.size_id) ?? "") : "";
      const qty = v ? (available.get(v.id) ?? 0) : 0;
      const regular = v?.regular_price_override != null ? Number(v.regular_price_override) : base;
      // Keep the product's discount ratio for a variation with its own price.
      const sale = base > 0 && final < base ? Math.round(regular * (final / base)) : null;
      const params = new URLSearchParams();
      if (color) params.set("color", color);
      if (size) params.set("size", size);
      items.push({
        id: v?.id ?? p.id,
        groupId: p.id,
        title: [p.title, color, size].filter(Boolean).join(" - ").slice(0, 150),
        description,
        availability: qty > 0 ? "in stock" : "out of stock",
        price: regular,
        salePrice: sale,
        link: `${site}/products/${encodeURIComponent(p.slug)}${params.size ? `?${params}` : ""}`,
        image: abs(images[0]),
        additionalImages: images.slice(1, 10).map(abs),
        brand,
        productType: [p.category_name, p.sub_category_name].filter(Boolean).join(" > "),
        color,
        size,
        quantity: qty,
        gender: genderOf.get(p.id) ?? "",
      });
    }
  }
  return items;
}
