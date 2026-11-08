import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { getServerUrl } from "@/lib/config";

/**
 * GET /api/feeds/meta  (CSV)
 *
 * Product feed for Meta Commerce Manager (catalog ads, dynamic retargeting,
 * product tags). Every active variant is its own item, grouped by product
 * with item_group_id. Add it in Commerce Manager -> Data sources -> Data
 * feed -> scheduled, with this URL, refreshed hourly or daily.
 *
 * Item ids are the variant ids, and the pixel's content_ids are product ids;
 * Meta matches both because item_group_id is the product id.
 */
export const dynamic = "force-dynamic";

type Row = Record<string, string | number | null | undefined>;

const COLUMNS = [
  "id",
  "item_group_id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "additional_image_link",
  "brand",
  "product_type",
  "color",
  "size",
  "quantity_to_sell_on_facebook",
] as const;

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function plain(html: string | null | undefined, max = 4900): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const money = (n: number) => `${n.toFixed(2)} BDT`;

export async function GET() {
  if (!isServiceSupabaseConfigured()) return new Response("Feed not configured", { status: 503 });
  const db = getServiceSupabase();
  const site = getServerUrl().replace(/\/+$/, "");
  const abs = (url: string) => (/^https?:\/\//.test(url) ? url : `${site}${url.startsWith("/") ? "" : "/"}${url}`);

  const [{ data: products }, { data: variants }, { data: stock }, { data: colors }, { data: sizes }] = await Promise.all([
    db
      .from("products_with_effective_pricing")
      .select("id, slug, title, description, category_name, sub_category_name, images, effective_base_price, effective_price, specs, status")
      .eq("status", "published"),
    db.from("product_variants").select("id, product_id, color_id, size_id, sku, regular_price_override, is_active").eq("is_active", true),
    db.from("product_stock").select("variant_id, quantity, reserved_quantity"),
    db.from("colors").select("id, name"),
    db.from("sizes").select("id, name, display_name"),
  ]);

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

  const rows: Row[] = [];
  for (const p of products ?? []) {
    const images = (Array.isArray(p.images) ? p.images : []).filter((x: unknown): x is string => typeof x === "string");
    if (images.length === 0) continue; // Meta rejects items without an image.
    const base = Number(p.effective_base_price ?? 0);
    const final = Number(p.effective_price ?? base);
    const brand = (p.specs as Record<string, unknown> | null)?.brand;
    const common = {
      item_group_id: p.id,
      description: plain(p.description) || p.title,
      condition: "new",
      image_link: abs(images[0]),
      additional_image_link: images.slice(1, 10).map(abs).join(","),
      brand: typeof brand === "string" && brand ? brand : "Arts Sports",
      product_type: [p.category_name, p.sub_category_name].filter(Boolean).join(" > "),
    };
    const list = byProduct.get(p.id) ?? [];
    for (const v of list.length ? list : [null]) {
      const color = v?.color_id ? colorName.get(v.color_id) : undefined;
      const size = v?.size_id ? sizeName.get(v.size_id) : undefined;
      const qty = v ? (available.get(v.id) ?? 0) : 0;
      const regular = v?.regular_price_override != null ? Number(v.regular_price_override) : base;
      // Keep the product's discount ratio for a variant with its own price.
      const sale = base > 0 && final < base ? Math.round(regular * (final / base)) : null;
      const params = new URLSearchParams();
      if (color) params.set("color", color);
      if (size) params.set("size", size);
      rows.push({
        ...common,
        id: v?.id ?? p.id,
        title: [p.title, color, size].filter(Boolean).join(" - ").slice(0, 200),
        availability: qty > 0 ? "in stock" : "out of stock",
        price: money(regular),
        sale_price: sale != null ? money(sale) : "",
        link: `${site}/products/${encodeURIComponent(p.slug)}${params.size ? `?${params}` : ""}`,
        color: color ?? "",
        size: size ?? "",
        quantity_to_sell_on_facebook: qty,
      });
    }
  }

  const csv = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
