import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Product } from "@/types";
import { getServerUrl } from "@/lib/config";
import { clip, plainText, SEO_LIMITS, type SeoContext, type SeoFields } from "./product-seo";

/**
 * Writes a product's search text with Claude, from the product's own facts
 * and its main photo. On only when ANTHROPIC_API_KEY is set; without it the
 * site keeps using the automatic text from product-seo.ts.
 *
 * One short call per product save (skipped when the facts did not change),
 * at low effort: this is copywriting from given facts, not reasoning.
 */

export function isAiSeoConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

const MODEL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    title_en: { type: "string", description: "English page title, at most 46 characters, no price, no shop name." },
    title_bn: { type: "string", description: "Bangla page title in Bangla script, at most 46 characters, no price." },
    description_en: { type: "string", description: "English meta description, 120-155 characters." },
    description_bn: { type: "string", description: "Bangla meta description in Bangla script, 100-150 characters." },
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "8-15 search phrases shoppers in Bangladesh type: English, Bangla script and Banglish.",
    },
    image_alt_en: { type: "string", description: "English alt text for the main photo, what is in it, at most 120 characters." },
    image_alt_bn: { type: "string", description: "Bangla alt text for the main photo, at most 120 characters." },
  },
  required: ["title_en", "title_bn", "description_en", "description_bn", "keywords", "image_alt_en", "image_alt_bn"],
  additionalProperties: false,
} as const;

const SYSTEM = `You write search-engine text for product pages of Arts Sports, an online sports shop in Bangladesh (custom team jerseys, jerseys, sportswear, sports gear; delivery all over Bangladesh, cash on delivery).

Rules:
- Use only the facts given and what is plainly visible in the photo. Never invent materials, technologies, team licences, player endorsements, discounts, ratings or delivery promises that are not in the facts.
- Do not put prices in titles or descriptions; prices change and the site adds them itself.
- Do not add the shop name to titles; the site appends it.
- Titles: lead with what the product is, in the words people search for (e.g. "Argentina Home Jersey 2026 Fan Edition"). At most 46 characters.
- Descriptions: one or two plain sentences that make a shopper want to click: what it is, who it is for, a concrete detail (fabric, fit, colours, sizes) from the facts, and "cash on delivery all over Bangladesh" when there is room.
- Bangla: natural Bangla as a Bangladeshi shop writes it, in Bangla script, not a word-for-word translation. Common English sport words (jersey, polo, trouser) may be written in Bangla script (জার্সি).
- Keywords: real phrases, mixing English ("football jersey price in bd"), Bangla ("ফুটবল জার্সি") and Banglish ("jersey dam koto"). No keyword stuffing, no competitor brand names unless the product is that brand.
- Alt text: describe the photo for someone who cannot see it.`;

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${getServerUrl().replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

function factsOf(product: Product, ctx: SeoContext): string {
  const lines = [
    `Name (English): ${product.title}`,
    product.title_bn && `Name (Bangla): ${product.title_bn}`,
    ctx.brand && `Brand: ${ctx.brand}`,
    (ctx.category || product.category) && `Category: ${ctx.category || product.category}${ctx.categoryBn ? ` (${ctx.categoryBn})` : ""}`,
    (ctx.subCategory || product.sub_category) && `Sub-category: ${ctx.subCategory || product.sub_category}`,
    product.colors?.length && `Colours: ${product.colors.map((c) => c.name).join(", ")}`,
    product.sizes?.length && `Sizes: ${product.sizes.map((s) => s.size).join(", ")}`,
    product.gender && `For: ${product.gender}`,
    product.specs && Object.keys(product.specs).length > 0 &&
      `Specs: ${Object.entries(product.specs).map(([k, v]) => `${k}: ${v}`).join("; ")}`,
    product.short_description && `Short description: ${plainText(product.short_description)}`,
    product.description && `Description: ${plainText(product.description).slice(0, 3000)}`,
    product.short_description_bn && `Short description (Bangla): ${plainText(product.short_description_bn)}`,
    product.description_bn && `Description (Bangla): ${plainText(product.description_bn).slice(0, 3000)}`,
    product.tags?.length && `Tags: ${product.tags.join(", ")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return client;
}

async function ask(product: Product, ctx: SeoContext, withImage: boolean): Promise<SeoFields | null> {
  const image = product.images?.find((u) => typeof u === "string" && u);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (withImage && image) content.push({ type: "image", source: { type: "url", url: absolute(image) } });
  content.push({ type: "text", text: `Product facts:\n${factsOf(product, ctx)}\n\nWrite the search text.` });

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: jsonSchemaOutputFormat(SCHEMA) },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  return (response.parsed_output as SeoFields | null) ?? null;
}

/** Search text for one product, or null when the writer is off or failed (the automatic text stays). */
export async function writeProductSeo(product: Product, ctx: SeoContext = {}): Promise<SeoFields | null> {
  if (!isAiSeoConfigured()) return null;
  let out: SeoFields | null = null;
  try {
    out = await ask(product, ctx, true);
  } catch (err) {
    // A photo Claude cannot fetch (local dev, private bucket) is a 400: try once with words only.
    if (err instanceof Anthropic.BadRequestError) {
      try {
        out = await ask(product, ctx, false);
      } catch (retryErr) {
        console.error("AI SEO writer failed:", retryErr instanceof Error ? retryErr.message : retryErr);
        return null;
      }
    } else {
      console.error("AI SEO writer failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
  if (!out) return null;
  const s = (v: unknown, max: number) => clip(typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "", max);
  return {
    title_en: s(out.title_en, SEO_LIMITS.title + 4),
    title_bn: s(out.title_bn, SEO_LIMITS.title + 4),
    description_en: s(out.description_en, SEO_LIMITS.description + 10),
    description_bn: s(out.description_bn, SEO_LIMITS.description + 10),
    keywords: (Array.isArray(out.keywords) ? out.keywords : [])
      .map((k) => s(k, 60))
      .filter(Boolean)
      .slice(0, 15),
    image_alt_en: s(out.image_alt_en, 125),
    image_alt_bn: s(out.image_alt_bn, 125),
  };
}
