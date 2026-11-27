import type { Product } from "@/types";

/**
 * Search text for a product: page title, meta description, keywords and the
 * text on its pictures.
 *
 * Every product has it from the moment it is saved: when `products.seo` is
 * empty, it is built here from the product's own name, category, brand, price,
 * colours and sizes. The AI writer (lib/seo/ai-writer.ts) fills `products.seo`
 * after a save with better wording, and staff can type their own in the
 * product form's SEO tab (`source: "manual"`, which the AI never overwrites).
 *
 * Shared by the product page (server), the feeds and the admin preview, so
 * it imports nothing server-only.
 */

export interface SeoFields {
  title_en: string;
  title_bn: string;
  description_en: string;
  description_bn: string;
  keywords: string[];
  image_alt_en: string;
  image_alt_bn: string;
}

/** What `products.seo` holds. Every field is optional: a missing one falls back to the automatic text. */
export interface StoredSeo extends Partial<SeoFields> {
  source?: "ai" | "manual";
  /** Hash of the product facts the AI text was written from (skip rewriting when nothing changed). */
  input_hash?: string;
  generated_at?: string;
}

export interface SeoContext {
  brand?: string | null;
  category?: string | null;
  categoryBn?: string | null;
  subCategory?: string | null;
}

export interface ProductSeo {
  /** Page title without the " | Arts Sports" the layout adds. */
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  keywords: string[];
  imageAlt: string;
  imageAltBn: string;
  source: "auto" | "ai" | "manual";
}

/** Limits Google shows before cutting. The layout adds " | Arts Sports" (14) to the title. */
export const SEO_LIMITS = { title: 46, description: 158 } as const;

export function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?।])/g, "$1")
    .trim();
}

/** Cut at a word end, with an ellipsis when something was cut. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

function sizeRange(product: Product): string {
  const names = (product.sizes ?? []).map((s) => s.size).filter(Boolean);
  if (names.length === 0) return "";
  return names.length === 1 ? names[0].toUpperCase() : `${names[0].toUpperCase()}–${names[names.length - 1].toUpperCase()}`;
}

function nonEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** The automatic text, from the product alone. */
export function autoSeo(product: Product, ctx: SeoContext = {}): SeoFields {
  const name = product.title.trim();
  const nameBn = nonEmpty(product.title_bn) || name;
  const brand = nonEmpty(ctx.brand);
  const category = nonEmpty(ctx.category) || nonEmpty(product.category);
  const categoryBn = nonEmpty(ctx.categoryBn);
  const sub = nonEmpty(ctx.subCategory) || nonEmpty(product.sub_category);
  const colours = (product.colors ?? []).map((c) => c.name).filter(Boolean);
  const sizes = sizeRange(product);
  const price = product.price > 0 ? taka(product.price) : "";

  const own = plainText(product.short_description) || plainText(product.description);
  const facts = [
    brand && `By ${brand}.`,
    colours.length > 0 && `Colours: ${colours.slice(0, 4).join(", ")}.`,
    sizes && `Sizes ${sizes}.`,
    price && `Price ${price}.`,
  ]
    .filter(Boolean)
    .join(" ");
  const description_en = clip(
    own
      ? `${own} ${price ? `Price ${price}. ` : ""}Delivery all over Bangladesh, cash on delivery.`
      : `${name}${sub || category ? ` – ${sub || category}` : ""} from Arts Sports. ${facts} Delivery all over Bangladesh, cash on delivery.`,
    SEO_LIMITS.description
  );

  const ownBn = plainText(product.short_description_bn) || plainText(product.description_bn);
  const description_bn = clip(
    ownBn
      ? `${ownBn} ${price ? `দাম ${price}। ` : ""}সারা বাংলাদেশে ডেলিভারি, ক্যাশ অন ডেলিভারি।`
      : `${nameBn}${categoryBn ? ` – ${categoryBn}` : ""}, আর্টস স্পোর্টস থেকে। ${price ? `দাম ${price}। ` : ""}সারা বাংলাদেশে ডেলিভারি, ক্যাশ অন ডেলিভারি।`,
    SEO_LIMITS.description
  );

  const keywords = dedupe([
    name,
    nameBn !== name ? nameBn : "",
    `${name} price in bd`,
    brand && brand !== "Arts Sports" && `${brand} ${sub || category}`,
    sub,
    category,
    categoryBn,
    category && `${category} price in Bangladesh`,
    ...colours.slice(0, 3).map((c) => `${c} ${category || sub || name}`),
    "Arts Sports",
  ]).slice(0, 15);

  return {
    title_en: name,
    title_bn: nameBn,
    description_en,
    description_bn,
    keywords,
    image_alt_en: [name, colours[0]].filter(Boolean).join(" – "),
    image_alt_bn: nameBn,
  };
}

function dedupe(list: (string | false | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** "Name – Price in BD ৳1,250" when it fits, else the name alone (cut). */
function withPrice(title: string, price: number): string {
  const suffix = price > 0 ? ` – Price in BD ${taka(price)}` : "";
  if (suffix && title.length + suffix.length <= SEO_LIMITS.title) return `${title}${suffix}`;
  return clip(title, SEO_LIMITS.title);
}

/** What the page uses: stored text where there is some, the automatic text for the rest. */
export function buildProductSeo(product: Product, ctx: SeoContext = {}): ProductSeo {
  const auto = autoSeo(product, ctx);
  const stored = (product.seo ?? {}) as StoredSeo;
  const pick = (k: Exclude<keyof SeoFields, "keywords">) => nonEmpty(stored[k]) || auto[k];
  const keywords = Array.isArray(stored.keywords) && stored.keywords.length > 0 ? dedupe(stored.keywords).slice(0, 20) : auto.keywords;
  const hasStored = Boolean(stored.source && (stored.title_en || stored.description_en));

  return {
    title: withPrice(pick("title_en"), product.price),
    titleBn: pick("title_bn"),
    description: clip(pick("description_en"), SEO_LIMITS.description + 10),
    descriptionBn: clip(pick("description_bn"), SEO_LIMITS.description + 10),
    keywords,
    imageAlt: pick("image_alt_en"),
    imageAltBn: pick("image_alt_bn"),
    source: hasStored ? (stored.source ?? "auto") : "auto",
  };
}

/** A short hash of the facts the AI writes from, so a save that changed none of them is not rewritten. */
export function seoInputHash(product: Product, ctx: SeoContext = {}): string {
  const facts = JSON.stringify([
    product.title,
    product.title_bn,
    product.short_description,
    product.short_description_bn,
    plainText(product.description).slice(0, 1500),
    plainText(product.description_bn).slice(0, 1500),
    ctx.brand,
    ctx.category ?? product.category,
    ctx.subCategory ?? product.sub_category,
    (product.colors ?? []).map((c) => c.name),
    (product.sizes ?? []).map((s) => s.size),
    product.images?.[0],
    product.specs,
  ]);
  // FNV-1a, 32 bit: enough to tell "changed" from "same".
  let h = 0x811c9dc5;
  for (let i = 0; i < facts.length; i++) {
    h ^= facts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
