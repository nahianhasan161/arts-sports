import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogCategory, CatalogProduct, PosCatalog, PosStock } from "./types";
import { effectivePrices, explainPosError } from "./server";
import { loadDesignCategories } from "@/lib/custom-jersey/designs-server";
import type { DesignRow } from "@/lib/custom-jersey/designs";

/**
 * The register's whole catalogue (products, prices, variants, categories) for
 * the copy kept on the device. Stock is left out on purpose: it changes with
 * every sale and comes from `loadShelf` instead.
 *
 * `version` is a hash of the content, so a till asks "still X?" and gets the
 * full list back only when something changed. Hashing the built result (not
 * updated_at columns) also catches deletes and promotions that start or end
 * on their own clock.
 */

const PAGE = 1000; // PostgREST's default max rows per request

type Res<T> = { data: T[] | null; error: { message: string } | null };

/** Every row of a query, one page at a time. */
async function all<T>(page: (from: number, to: number) => PromiseLike<Res<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(explainPosError(error.message));
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

interface ProductRow {
  id: string;
  title: string;
  images: unknown;
  category_id: string | null;
  sub_category_id: string | null;
  sku?: string | null;
}

interface VariantRow {
  id: string;
  product_id: string;
  color_id: string | null;
  size_id: string | null;
  sku: string | null;
  barcode: string | null;
}

async function productRows(db: SupabaseClient): Promise<ProductRow[]> {
  const read = (cols: string) =>
    all<ProductRow>((from, to) => db.from("products").select(cols).is("deleted_at", null).order("id").range(from, to) as unknown as PromiseLike<Res<ProductRow>>);
  if (hasSku) {
    try {
      return await read("id, title, images, category_id, sub_category_id, sku");
    } catch {
      // products.sku is not on every install; stop asking for it in this worker.
      hasSku = false;
    }
  }
  return read("id, title, images, category_id, sub_category_id");
}
let hasSku = true;

async function hash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Published designs in gallery order. Empty (not an error) before the gallery migrations. */
async function designRows(db: SupabaseClient): Promise<DesignRow[]> {
  const read = (cols: string) =>
    all<DesignRow>((from, to) =>
      db.from("custom_gallery").select(cols).eq("is_published", true).order("display_order").order("created_at", { ascending: false }).order("id").range(from, to) as unknown as PromiseLike<Res<DesignRow>>
    );
  try {
    return await read("id, image_url, images, title, caption, category");
  } catch {
    return read("id, image_url, title, caption, category").catch(() => []);
  }
}

export async function buildCatalog(db: SupabaseClient): Promise<PosCatalog> {
  const [products, variants, colors, sizes, categoryRows, designs, designCategories] = await Promise.all([
    productRows(db),
    all<VariantRow>((from, to) =>
      db.from("product_variants").select("id, product_id, color_id, size_id, sku, barcode").eq("is_active", true).order("id").range(from, to) as unknown as PromiseLike<Res<VariantRow>>
    ),
    all<{ id: string; name: string }>((from, to) => db.from("colors").select("id, name").order("id").range(from, to) as unknown as PromiseLike<Res<{ id: string; name: string }>>),
    all<{ id: string; name: string }>((from, to) => db.from("sizes").select("id, name").order("id").range(from, to) as unknown as PromiseLike<Res<{ id: string; name: string }>>),
    // "*" so this keeps working before the categories.image_url migration.
    db.from("categories").select("*").is("parent_id", null).order("name").order("id"),
    designRows(db),
    loadDesignCategories(db),
  ]);
  if (categoryRows.error) throw new Error(explainPosError(categoryRows.error.message));

  // Prices from the same function as checkout and pos_create_sale, in chunks
  // so neither the request nor the answer hits a row limit.
  const ids = products.map((p) => p.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
  const priceMaps = await Promise.all(chunks.map((c) => effectivePrices(db, c)));
  const price = new Map(priceMaps.flatMap((m) => [...m]));

  const color = new Map(colors.map((c) => [c.id, c.name]));
  const size = new Map(sizes.map((s) => [s.id, s.name]));
  const byProduct = new Map<string, (VariantRow & { c: string | null; s: string | null })[]>();
  for (const v of variants) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push({ ...v, c: v.color_id ? (color.get(v.color_id) ?? null) : null, s: v.size_id ? (size.get(v.size_id) ?? null) : null });
    byProduct.set(v.product_id, list);
  }
  // Same order as pos_register_grid: size, then colour, blanks first.
  const cmp = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1);

  const out: CatalogProduct[] = [];
  for (const p of products) {
    const pr = price.get(p.id);
    if (!pr) continue;
    const images = Array.isArray(p.images) ? p.images : [];
    const own = (byProduct.get(p.id) ?? []).sort((a, b) => cmp(a.s, b.s) || cmp(a.c, b.c) || cmp(a.id, b.id));
    out.push({
      product_id: p.id,
      title: p.title,
      image: typeof images[0] === "string" ? images[0] : null,
      price: pr.final,
      base_price: pr.base,
      category_id: p.category_id ?? null,
      sub_category_id: p.sub_category_id ?? null,
      sku: p.sku ?? null,
      variants: own.map((v) => ({ variant_id: v.id, label: [v.c, v.s].filter(Boolean).join(" / "), sku: v.sku, barcode: v.barcode })),
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title) || (a.product_id < b.product_id ? -1 : 1));

  const categories: CatalogCategory[] = (categoryRows.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    image: ((c as { image_url?: string | null }).image_url ?? null) || null,
  }));

  const body = { products: out, categories, designs, designCategories };
  return { version: await hash(JSON.stringify(body)), ...body };
}

/** One shop's shelf: every variant's free quantity, plus stock of products without variants. */
export async function loadShelf(db: SupabaseClient, showroomId: string): Promise<PosStock> {
  type Row = { variant_id: string; quantity: number; reserved_quantity: number };
  const [rows, plain] = await Promise.all([
    all<Row>((from, to) =>
      db.from("product_stock").select("variant_id, quantity, reserved_quantity").eq("showroom_id", showroomId).order("variant_id").range(from, to) as unknown as PromiseLike<Res<Row>>
    ),
    all<{ id: string; stock: number }>((from, to) =>
      db.from("products").select("id, stock").is("deleted_at", null).order("id").range(from, to) as unknown as PromiseLike<Res<{ id: string; stock: number }>>
    ),
  ]);
  const variants: Record<string, number> = {};
  for (const r of rows) variants[r.variant_id] = Math.max(0, (Number(r.quantity) || 0) - (Number(r.reserved_quantity) || 0));
  const plainOut: Record<string, number> = {};
  for (const p of plain) plainOut[p.id] = Math.max(0, Number(p.stock) || 0);
  return { showroom_id: showroomId, variants, plain: plainOut, at: new Date().toISOString() };
}
