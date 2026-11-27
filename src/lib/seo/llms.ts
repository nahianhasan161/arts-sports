import "server-only";
import { getCategories, getProducts } from "@/lib/services/products";
import { getCollections } from "@/lib/services/catalog";
import { getPublicFabrics, onePiecePrice, startPrice } from "@/lib/custom-jersey/designs-public";
import { loadPublicPricing } from "@/lib/custom-jersey/server";
import { STORE_PHONE_SHOWN } from "@/lib/nav";
import { getStoreFacts } from "./store-facts";
import { clip, plainText, taka } from "./product-seo";

/**
 * /llms.txt and /llms-full.txt (llmstxt.org): the shop in plain Markdown for
 * AI assistants and AI search (ChatGPT, Claude, Perplexity, Gemini, Copilot).
 * Facts only, from the same data the site shows; rebuilt hourly.
 */

async function base() {
  const [facts, categories, pricing, fabrics, collections] = await Promise.all([
    getStoreFacts(),
    getCategories(),
    loadPublicPricing(),
    getPublicFabrics(),
    getCollections().catch(() => []),
  ]);
  return { facts, categories, pricing, fabrics, collections, from: startPrice(fabrics, pricing) };
}

type Base = Awaited<ReturnType<typeof base>>;

function header(b: Base): string {
  const { facts, pricing } = b;
  const days = pricing.rush.normal_days;
  const lines = [
    `# Arts Sports (আর্টস স্পোর্টস)`,
    "",
    `> Online sports shop in Bangladesh. Custom team jerseys with your names, numbers and logo from just 1 piece${b.from ? ` (from ${taka(b.from)} per piece)` : ""}, plus ready-made jerseys, sportswear and sports accessories for football, cricket, badminton and more. Delivery to all 64 districts, cash on delivery. Website in Bangla (default) and English: ${facts.url}`,
    "",
    "## Key facts",
    "",
    `- Custom jerseys: any design, team or club kit, from 1 piece. Names and numbers can be added per player; logos printed, DTF, silicon or embroidered. Usually ready in ${days} days${pricing.rush.min_days < days ? `; faster (from ${pricing.rush.min_days} days) for a rush fee` : ""}.`,
    pricing.tiers.some((t) => t.discount_percent > 0)
      ? `- Quantity discount on custom jerseys: ${pricing.tiers.filter((t) => t.discount_percent > 0).map((t) => `${t.min}+ pieces ${t.discount_percent}% off`).join(", ")}.`
      : null,
    `- Order a custom jersey: ${facts.url}/custom-jersey (pick a design from the gallery or upload your own, choose fabric and sizes, add the player list). A part is paid in advance (${pricing.advance_percent}%), the rest on delivery.`,
    `- Delivery: ${taka(facts.deliveryDhaka)} inside Dhaka (${facts.transitDays.dhaka[0]}-${facts.transitDays.dhaka[1]} days), ${taka(facts.deliveryOutside)} outside Dhaka (${facts.transitDays.outside[0]}-${facts.transitDays.outside[1]} days).`,
    `- Payment: cash on delivery or online payment.`,
    `- Returns: ${facts.returnDays}-day return window on ready-made products (${facts.url}/returns).`,
    `- Contact: phone ${STORE_PHONE_SHOWN} (${facts.phone}), email ${facts.email}.`,
    ...(facts.social.length ? [`- Social: ${facts.social.join(", ")}`] : []),
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

function sections(b: Base): string {
  const { facts, categories, collections } = b;
  const cat = categories
    .map((c) => {
      const slug = c.slug || c.id;
      const subs = (c.children ?? []).map((s) => s.name).join(", ");
      return `- [${c.name}${c.name_bn ? ` (${c.name_bn})` : ""}](${facts.url}/shop?category=${encodeURIComponent(slug)})${subs ? `: ${subs}` : ""}`;
    })
    .join("\n");
  return [
    "## Shop",
    "",
    `- [All products](${facts.url}/shop)`,
    `- [Offers](${facts.url}/shop?deals=true)`,
    cat,
    ...collections.map((c) => `- [${c.title_en || c.slug}](${facts.url}/collection/${encodeURIComponent(c.slug)})`),
    "",
    "## Custom jersey",
    "",
    `- [Design your own team jersey](${facts.url}/custom-jersey): price estimate, fabrics, sizes, names and numbers list`,
    `- [Jersey design gallery](${facts.url}/custom-jersey/gallery): ready designs to order as they are or change`,
    "",
    "## Policies",
    "",
    `- [Delivery](${facts.url}/shipping-policy)`,
    `- [Returns](${facts.url}/returns)`,
    `- [Refunds](${facts.url}/refund-policy)`,
    `- [Terms](${facts.url}/terms)`,
    `- [Privacy](${facts.url}/privacy-policy)`,
  ].join("\n");
}

export async function llmsTxt(): Promise<string> {
  const b = await base();
  return [
    header(b),
    "",
    sections(b),
    "",
    "## Optional",
    "",
    `- [Full catalogue with prices and sizes](${b.facts.url}/llms-full.txt)`,
    `- [Product feed, Google Merchant format](${b.facts.url}/feeds/google.xml)`,
    `- [Sitemap](${b.facts.url}/sitemap.xml)`,
    "",
  ].join("\n");
}

export async function llmsFullTxt(): Promise<string> {
  const b = await base();
  const products = await getProducts({ limit: 2000, sortBy: "newest" });
  const { facts, fabrics, pricing } = b;

  const fabricLines = fabrics.map((f) => {
    const price = onePiecePrice(f, pricing);
    const about = plainText(f.description_en) || plainText(f.description_bn);
    return `- **${f.name_en}${f.name_bn ? ` (${f.name_bn})` : ""}**${price ? `: from ${taka(price)} per jersey` : ""}${about ? `. ${clip(about, 240)}` : ""}`;
  });

  const productLines = products.map((p) => {
    const inStock = p.sizes?.length ? p.sizes.filter((s) => (s.stock ?? 0) > 0).map((s) => s.size.toUpperCase()) : [];
    const available = (p.stock ?? 0) > 0 || inStock.length > 0;
    const sale = p.original_price > p.price ? ` (regular ${taka(p.original_price)})` : "";
    const about = plainText(p.short_description) || plainText(p.description);
    return [
      `### ${p.title}${p.title_bn && p.title_bn !== p.title ? ` / ${p.title_bn}` : ""}`,
      `- Link: ${facts.url}/products/${encodeURIComponent(p.slug)}`,
      `- Price: ${taka(p.price)}${sale}`,
      `- Category: ${[p.category, p.sub_category].filter(Boolean).join(" > ") || "-"}`,
      p.colors?.length ? `- Colours: ${p.colors.map((c) => c.name).join(", ")}` : "",
      inStock.length ? `- Sizes in stock: ${inStock.join(", ")}` : "",
      `- Availability: ${available ? "in stock" : "sold out"}`,
      about ? `- About: ${clip(about, 400)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    header(b),
    "",
    sections(b),
    "",
    ...(fabricLines.length ? ["## Custom jersey fabrics", "", ...fabricLines, ""] : []),
    "## Frequently asked",
    "",
    "**Can I order just one custom jersey?** Yes, custom jerseys start at 1 piece, with a name and number if wanted.",
    "",
    `**How long does a custom jersey take?** Usually ${pricing.rush.normal_days} days to make, then delivery.`,
    "",
    "**Do you deliver outside Dhaka?** Yes, to all 64 districts of Bangladesh, with cash on delivery.",
    "",
    "**Can I send my own design or logo?** Yes, upload it on the custom jersey page.",
    "",
    `## Products (${products.length})`,
    "",
    productLines.join("\n\n"),
    "",
  ].join("\n");
}
