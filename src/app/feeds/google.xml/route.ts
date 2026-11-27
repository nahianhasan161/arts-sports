import { loadFeedItems } from "@/lib/feeds/items";
import { getStoreFacts } from "@/lib/seo/store-facts";

/**
 * GET /feeds/google.xml  (RSS 2.0 with the g: namespace)
 *
 * Product feed for Google Merchant Center: free listings in Google Shopping,
 * Shopping ads, and the product answers in Google search, AI Mode and Gemini.
 * Also accepted by Pinterest catalogs, TikTok catalogs and Bing Merchant
 * Center as is. Add it in Merchant Center -> Products -> Add products -> From
 * a file -> scheduled fetch, with this URL, daily.
 *
 * Shipping is in the feed (same fees as checkout), so no shipping settings
 * are needed in Merchant Center; returns still need setting there once.
 */
export const dynamic = "force-dynamic";

const esc = (v: string | number) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML does not allow at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const money = (n: number) => `${n.toFixed(2)} BDT`;
const GENDER: Record<string, string> = { men: "male", women: "female", kids: "unisex" };

export async function GET() {
  const [items, facts] = await Promise.all([loadFeedItems(), getStoreFacts()]);
  if (!items) return new Response("Feed not configured", { status: 503 });

  const tag = (name: string, value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" ? "" : `<g:${name}>${esc(value)}</g:${name}>`;

  const shipping = [
    `<g:shipping><g:country>BD</g:country><g:region>Dhaka</g:region><g:service>Inside Dhaka</g:service><g:price>${money(facts.deliveryDhaka)}</g:price><g:min_transit_time>${facts.transitDays.dhaka[0]}</g:min_transit_time><g:max_transit_time>${facts.transitDays.dhaka[1]}</g:max_transit_time></g:shipping>`,
    `<g:shipping><g:country>BD</g:country><g:service>Outside Dhaka</g:service><g:price>${money(facts.deliveryOutside)}</g:price><g:min_transit_time>${facts.transitDays.outside[0]}</g:min_transit_time><g:max_transit_time>${facts.transitDays.outside[1]}</g:max_transit_time></g:shipping>`,
  ].join("");

  const body = items
    .map((i) =>
      [
        "<item>",
        tag("id", i.id),
        tag("item_group_id", i.groupId),
        `<title>${esc(i.title)}</title>`,
        `<description>${esc(i.description)}</description>`,
        `<link>${esc(i.link)}</link>`,
        tag("image_link", i.image),
        ...i.additionalImages.map((u) => tag("additional_image_link", u)),
        tag("availability", i.availability.replace(" ", "_")),
        tag("price", money(i.price)),
        i.salePrice != null ? tag("sale_price", money(i.salePrice)) : "",
        tag("condition", "new"),
        tag("brand", i.brand),
        // No barcodes on own-made goods: tells Google not to expect one.
        tag("identifier_exists", i.brand === facts.name ? "no" : ""),
        tag("product_type", i.productType),
        tag("color", i.color),
        tag("size", i.size),
        tag("gender", GENDER[i.gender] ?? ""),
        i.gender === "kids" ? tag("age_group", "kids") : i.gender ? tag("age_group", "adult") : "",
        shipping,
        "</item>",
      ].join("")
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(facts.name)}</title>
<link>${esc(facts.url)}</link>
<description>${esc("Custom jerseys, sportswear and sports accessories. Delivery all over Bangladesh.")}</description>
${body}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
