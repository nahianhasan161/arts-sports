import { loadFeedItems } from "@/lib/feeds/items";

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
 * The rows come from lib/feeds/items.ts (shared with the Google feed).
 */
export const dynamic = "force-dynamic";

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
  "gender",
  "quantity_to_sell_on_facebook",
] as const;

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (n: number) => `${n.toFixed(2)} BDT`;
const GENDER: Record<string, string> = { men: "male", women: "female", kids: "unisex" };

export async function GET() {
  const items = await loadFeedItems();
  if (!items) return new Response("Feed not configured", { status: 503 });

  const rows = items.map((i) => ({
    id: i.id,
    item_group_id: i.groupId,
    title: i.title,
    description: i.description,
    availability: i.availability,
    condition: "new",
    price: money(i.price),
    sale_price: i.salePrice != null ? money(i.salePrice) : "",
    link: i.link,
    image_link: i.image,
    additional_image_link: i.additionalImages.join(","),
    brand: i.brand,
    product_type: i.productType,
    color: i.color,
    size: i.size,
    gender: GENDER[i.gender] ?? "",
    quantity_to_sell_on_facebook: i.quantity,
  }));

  const csv = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
