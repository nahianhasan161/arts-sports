import { parseSpecPaste } from "./spec-paste";
import type { ProductGender, ProductStatus } from "@/types";

/**
 * Product import from a sheet (Google Sheets link, copied cells, CSV or .xlsx).
 *
 * The first row is the header. Known headers (English or Bangla) fill the
 * product fields; every other column becomes a spec named after its header,
 * so a sheet with "Frame Material", "Weight", "Grip Size" columns needs no
 * setup. Rows are turned into the same payload the product form sends, and
 * saved one by one through the same API, so every rule of the form applies.
 */

export const MAX_IMPORT_ROWS = 300;

export type Field =
  | "title"
  | "slug"
  | "category"
  | "sub_category"
  | "brand"
  | "price"
  | "sale_price"
  | "discount"
  | "stock"
  | "colors"
  | "sizes"
  | "sku"
  | "status"
  | "featured"
  | "gender"
  | "description"
  | "images"
  | "specs"
  | "ignore";

const HEADERS: [Field, RegExp][] = [
  ["ignore", /^(#|sl\.?|no\.?|serial|ক্রম|ক্রমিক)$/],
  ["title", /^(title|name|product|product name|product title|পণ্য|পণ্যের নাম|প্রোডাক্ট|প্রোডাক্টের নাম|নাম)$/],
  ["slug", /^(slug|url slug|link)$/],
  ["sub_category", /^(sub[\s_-]?category|sub[\s_-]?cat|সাব[\s-]?ক্যাটাগরি|সাব[\s-]?ক্যাটেগরি|উপ[\s-]?বিভাগ)$/],
  ["category", /^(category|cat|ক্যাটাগরি|ক্যাটেগরি|বিভাগ)$/],
  ["brand", /^(brand|ব্র্যান্ড|ব্রান্ড)$/],
  ["sale_price", /^(sale price|offer price|new price|discount price|discounted price|selling price|অফার দাম|অফার মূল্য|বিক্রয় মূল্য|ছাড়ের দাম)$/],
  ["price", /^(price|regular price|mrp|old price|দাম|মূল্য|রেগুলার দাম)$/],
  ["discount", /^(discount|discount %|discount percent|off|ছাড়|ডিসকাউন্ট)$/],
  ["stock", /^(stock|qty|quantity|স্টক|পরিমাণ)$/],
  ["colors", /^(colou?rs?|রং|কালার)$/],
  ["sizes", /^(sizes?|সাইজ|মাপ)$/],
  ["sku", /^(sku|code|product code|কোড)$/],
  ["status", /^(status|publish|published|স্ট্যাটাস)$/],
  ["featured", /^(featured|ফিচার্ড)$/],
  ["gender", /^(gender|for|audience|কার জন্য)$/],
  ["description", /^(description|details|about|বিবরণ|বর্ণনা)$/],
  ["images", /^(images?|photos?|pictures?|image (url|link)s?|photo (url|link)s?|ছবি|ছবির লিংক)(\s*\d+)?$/],
  ["specs", /^(specs|specifications?|স্পেসিফিকেশন)$/],
];

export interface Column {
  index: number;
  header: string;
  field: Field | "spec";
  /** Spec name, for spec columns. */
  spec?: string;
}

const norm = (s: string) => s.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function mapColumns(header: string[]): Column[] {
  const seen = new Set<Field>();
  return header.map((h, index) => {
    const label = h.replace(/\s+/g, " ").trim();
    const n = norm(label);
    if (!n) return { index, header: label, field: "ignore" };
    const prefixed = label.match(/^spec(?:ification)?\s*[:\-–]\s*(.+)$/i);
    if (prefixed) return { index, header: label, field: "spec", spec: prefixed[1].trim() };
    for (const [field, re] of HEADERS) {
      if (!re.test(n)) continue;
      // Image columns may repeat (Image 1, Image 2); other fields use the first.
      if (field !== "images" && field !== "ignore" && seen.has(field)) break;
      seen.add(field);
      return { index, header: label, field };
    }
    return { index, header: label, field: "spec", spec: label.replace(/\*/g, "").trim() };
  });
}

/** What the import needs to know about the shop. */
export interface Lookups {
  categories: { id: string; parent_id: string | null; name: string; name_bn?: string | null; slug: string }[];
  brands: { id: string; name_en: string; name_bn?: string | null; slug?: string }[];
  colors: { id: string; name: string }[];
  sizes: { id: string; name: string; display_name: string }[];
}

export interface ImportRow {
  /** Sheet row number (1 = header). */
  line: number;
  title: string;
  categoryLabel: string;
  payload: Record<string, unknown> | null;
  brandId: string | null;
  images: string[];
  specCount: number;
  errors: string[];
  warnings: string[];
}

const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

export function parseMoney(raw: string): number | null {
  const s = toAscii(raw).replace(/[,৳\s]|tk|taka|bdt|টাকা/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const yes = (s: string) => /^(y|yes|true|1|on|হ্যাঁ|হা)$/i.test(s.trim());

function parseStatus(raw: string, fallback: ProductStatus): ProductStatus {
  const s = raw.trim().toLowerCase();
  if (!s) return fallback;
  if (/^(published|publish|live|active|on|yes|show|প্রকাশ|প্রকাশিত|চালু)$/.test(s)) return "published";
  if (/^(archived|archive|hidden|off)$/.test(s)) return "archived";
  return "draft";
}

function parseGender(raw: string): ProductGender | null {
  const s = raw.trim().toLowerCase();
  if (/^(men|man|male|boys?|ছেলে|পুরুষ)/.test(s)) return "men";
  if (/^(women|woman|female|ladies|girls?|মেয়ে|মহিলা)/.test(s)) return "women";
  if (/^(kids?|child|children|baby|বাচ্চা|শিশু)/.test(s)) return "kids";
  return null;
}

/** A list cell: "Red, Blue" / "Red | Blue" / one per line. */
const splitList = (raw: string) =>
  raw
    .split(/[,|\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Image cells: links separated by commas, spaces or new lines. */
export const splitLinks = (raw: string) => raw.split(/[\s,|]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const same = (a: string | null | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

function htmlFromText(text: string): string {
  if (/<\/?(p|ul|ol|li|br|strong|em|h[1-6])\b/i.test(text)) return text; // already HTML
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
}

export interface BuildOptions {
  /** Status for rows with no Status cell. */
  defaultStatus: ProductStatus;
}

export function buildRows(cells: string[][], lookups: Lookups, options: BuildOptions): { columns: Column[]; rows: ImportRow[] } {
  const [header = [], ...body] = cells;
  const columns = mapColumns(header);
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((r, i) => buildRow(r, i + 2, columns, lookups, options));
  return { columns, rows: rows.filter((r): r is ImportRow => r !== null) };
}

function findCategory(label: string, lookups: Lookups, parentId: string | null | undefined) {
  return lookups.categories.find(
    (c) =>
      (parentId === undefined || c.parent_id === parentId) &&
      (same(c.name, label) || same(c.name_bn, label) || same(c.slug, label) || same(c.slug, slugify(label))),
  );
}

function buildRow(cells: string[], line: number, columns: Column[], lookups: Lookups, options: BuildOptions): ImportRow | null {
  const get = (f: Field) => {
    const col = columns.find((c) => c.field === f);
    return col ? (cells[col.index] ?? "").trim() : "";
  };
  if (cells.every((c) => !c?.trim())) return null;

  const errors: string[] = [];
  const warnings: string[] = [];
  const title = get("title").replace(/\s+/g, " ");
  if (!title) errors.push("No product name");

  // ---- category: "Badminton", "Racket" (a sub-category) or "Badminton > Racket"
  let categoryId: string | null = null;
  let subId: string | null = null;
  let catLabel = get("category");
  let subLabel = get("sub_category");
  const path = catLabel.split(/\s*(?:>|›|»|\/)\s*/).filter(Boolean);
  if (path.length >= 2 && !subLabel) {
    catLabel = path[0];
    subLabel = path[path.length - 1];
  }
  if (!catLabel) {
    errors.push("No category");
  } else {
    const top = findCategory(catLabel, lookups, null);
    const any = top ?? findCategory(catLabel, lookups, undefined);
    if (!any) errors.push(`Category "${catLabel}" not found. Add it first (Catalog → Categories, or + New in the product form).`);
    else if (any.parent_id && !subLabel) {
      categoryId = any.parent_id;
      subId = any.id;
    } else categoryId = any.parent_id ? any.parent_id : any.id;
  }
  if (categoryId && subLabel && !subId) {
    const sub = findCategory(subLabel, lookups, categoryId);
    if (sub) subId = sub.id;
    else warnings.push(`Sub-category "${subLabel}" not found under this category; saved without it.`);
  }
  const catName = lookups.categories.find((c) => c.id === categoryId)?.name ?? catLabel;
  const subName = lookups.categories.find((c) => c.id === subId)?.name;

  // ---- price and discount
  const price = parseMoney(get("price"));
  const sale = parseMoney(get("sale_price"));
  const discountRaw = get("discount");
  let regular = price;
  let discount: Record<string, unknown> = { discount_mode: "none", discount_type: "percentage", discount_value: 0, comparison_price: 0 };
  if (regular === null && sale !== null && !Number.isNaN(sale)) regular = sale; // only one price given
  else if (regular !== null && sale !== null && !Number.isNaN(sale) && sale > 0 && sale < regular) {
    discount = { discount_mode: "comparison", discount_type: "percentage", discount_value: 0, comparison_price: sale };
  } else if (sale !== null && regular !== null && sale > regular) {
    warnings.push("Sale price is higher than the price; ignored.");
  }
  if (discountRaw && discount.discount_mode === "none") {
    const flat = /৳|tk|taka|টাকা/i.test(discountRaw);
    const n = parseMoney(discountRaw.replace("%", ""));
    if (n === null || Number.isNaN(n) || n < 0) warnings.push(`Discount "${discountRaw}" is not a number; ignored.`);
    else if (n > 0) discount = { discount_mode: "custom", discount_type: flat ? "flat" : "percentage", discount_value: n, comparison_price: 0 };
  }
  if (regular === null) errors.push("No price");
  else if (Number.isNaN(regular) || regular <= 0) errors.push(`Price "${get("price") || get("sale_price")}" is not a number above 0`);

  // ---- specs: the Specs column, "Spec: X" columns, and every unknown column
  const specs: Record<string, string> = {};
  const addSpec = (k: string, v: string) => {
    const key = k.trim().slice(0, 80);
    if (!key || !v.trim()) return;
    const existing = Object.keys(specs).find((x) => x.toLowerCase() === key.toLowerCase());
    specs[existing ?? key] = v.trim().slice(0, 500);
  };
  const specsCell = get("specs");
  if (specsCell) for (const p of parseSpecPaste(specsCell)) addSpec(p.key, p.value);
  // In sheet order; the Brand column is kept as a spec too.
  for (const col of columns) {
    if (col.field === "spec" && col.spec) addSpec(col.spec, cells[col.index] ?? "");
    else if (col.field === "brand") addSpec("Brand", cells[col.index] ?? "");
  }

  // ---- brand: also the product's brand when Catalog → Brands has that name
  const brandLabel = get("brand");
  let brandId: string | null = null;
  if (brandLabel) {
    const b = lookups.brands.find((x) => same(x.name_en, brandLabel) || same(x.name_bn, brandLabel) || same(x.slug, slugify(brandLabel)));
    if (b) brandId = b.id;
    else warnings.push(`Brand "${brandLabel}" is not in Catalog → Brands; kept as a spec only.`);
  }

  // ---- colours / sizes: options when every name is known, otherwise a spec
  const pickOptions = (label: string, raw: string, list: { id: string; names: string[] }[]) => {
    const names = splitList(raw);
    if (names.length === 0) return [] as string[];
    const ids: string[] = [];
    const missing: string[] = [];
    for (const n of names) {
      const hit = list.find((x) => x.names.some((y) => same(y, n)));
      if (hit) {
        if (!ids.includes(hit.id)) ids.push(hit.id);
      } else missing.push(n);
    }
    if (missing.length > 0) {
      addSpec(label, names.join(", "));
      warnings.push(`${label} ${missing.map((m) => `"${m}"`).join(", ")} not in the ${label.toLowerCase()} list; saved as a spec, no variations made.`);
      return [];
    }
    return ids;
  };
  const colorIds = pickOptions("Colour", get("colors"), lookups.colors.map((c) => ({ id: c.id, names: [c.name] })));
  const sizeIds = pickOptions("Size", get("sizes"), lookups.sizes.map((s) => ({ id: s.id, names: [s.display_name, s.name] })));

  const stockRaw = get("stock");
  const stock = stockRaw ? Math.max(0, Math.floor(Number(toAscii(stockRaw).replace(/[,\s]/g, "")) || 0)) : 0;
  const sku = get("sku");
  const variants: Record<string, unknown>[] = [];
  const pairs: [string | null, string | null][] =
    colorIds.length && sizeIds.length
      ? colorIds.flatMap((c) => sizeIds.map((s) => [c, s] as [string, string]))
      : colorIds.length
        ? colorIds.map((c) => [c, null])
        : sizeIds.map((s) => [null, s]);
  for (const [c, s] of pairs) {
    variants.push({ color_id: c, size_id: s, stock, price_override: null, sku: pairs.length === 1 && sku ? sku : null, is_active: true });
  }
  if (stockRaw && pairs.length === 0) warnings.push("Stock needs a colour or size to be stored (same as the product form); set it in Stock after the import.");
  if (sku && pairs.length !== 1) addSpec("SKU", sku);

  const images = columns.filter((c) => c.field === "images").flatMap((c) => splitLinks(cells[c.index] ?? ""));
  const slugCell = get("slug");

  const payload =
    errors.length > 0
      ? null
      : {
          title: title.slice(0, 200),
          // An explicit slug is refused when taken (so a re-import skips rows
          // already imported); a blank one is made unique by the server.
          slug: slugCell ? slugify(slugCell) : slugify(title),
          category_id: categoryId,
          sub_category_id: subId,
          description: htmlFromText(get("description")),
          regular_price: regular,
          ...discount,
          is_featured: yes(get("featured")),
          status: parseStatus(get("status"), options.defaultStatus),
          gender: parseGender(get("gender")),
          specs,
          color_ids: colorIds,
          size_ids: sizeIds,
          promotion_ids: [],
          variants,
        };

  if (payload && !slugify(title) && !slugCell) {
    // Bangla-only names have no Latin letters for a slug.
    payload.slug = `product-${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    line,
    title: title || `(row ${line})`,
    categoryLabel: [catName, subName].filter(Boolean).join(" › "),
    payload,
    brandId,
    images,
    specCount: Object.keys(specs).length,
    errors,
    warnings,
  };
}

/** Header row for the template file. */
export const TEMPLATE_HEADERS = [
  "Name",
  "Category",
  "Sub category",
  "Price",
  "Sale price",
  "Stock",
  "Colours",
  "Sizes",
  "Status",
  "Description",
  "Images",
  "Brand",
  "Model",
  "Product Type",
  "Frame Material",
  "Shaft Material",
  "Weight",
  "Grip Size",
  "Balance Point",
  "Flexibility",
  "Maximum String Tension",
  "Playing Level",
  "Country of Origin",
];

export function templateCsv(): string {
  const example = [
    "VE Titan 10",
    "Badminton",
    "Racket",
    "3500",
    "3200",
    "",
    "",
    "",
    "draft",
    "Light racket for fast play.",
    "https://example.com/photo-1.jpg, https://example.com/photo-2.jpg",
    "VE",
    "Titan 10",
    "Badminton Racket",
    "Graphite",
    "Graphite",
    "85 g",
    "G4",
    "Head Heavy",
    "Medium",
    "30 lbs",
    "Intermediate",
    "China",
  ];
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [TEMPLATE_HEADERS, example].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
