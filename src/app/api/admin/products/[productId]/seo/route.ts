import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildProductSeo, seoInputHash, type SeoContext, type SeoFields, type StoredSeo } from "@/lib/seo/product-seo";
import { isAiSeoConfigured, writeProductSeo } from "@/lib/seo/ai-writer";
import { pingIndexNow } from "@/lib/seo/indexnow";
import type { Product } from "@/types";

/**
 * Search text of one product (products.seo).
 *
 * GET                                  -> { seo, preview, aiEnabled }
 * POST { action: "suggest" }           -> { suggestion }  AI text, not saved (the SEO tab's "Write with AI")
 * POST { action: "saved", seo?, reset? }
 *   Called by the product form after every save. `seo` = text staff typed
 *   (stored as manual, the AI leaves it alone); `reset` = back to automatic.
 *   Otherwise, unless the text is manual, the AI rewrites it after the
 *   response when the product's facts changed. A published product is also
 *   announced to IndexNow.
 */
type Params = { params: Promise<{ productId: string }> };

const MISSING_COLUMN = "Search text needs migration 20261126110000_seo_and_tracking.sql. Ask to have it applied.";

async function loadInput(db: SupabaseClient, productId: string): Promise<{ product: Product; ctx: SeoContext } | null> {
  const { data: product, error } = await db.from("products").select("*").eq("id", productId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) return null;
  const p = product as Product;
  const [{ data: terms }, { data: cat }] = await Promise.all([
    db.from("product_terms").select("catalog_terms!inner(type, name_en)").eq("product_id", productId),
    p.category_id
      ? db.from("categories").select("name, name_bn").eq("id", p.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const brand = (terms ?? [])
    .map((r) => (r as unknown as { catalog_terms: { type: string; name_en: string } }).catalog_terms)
    .find((t) => t?.type === "brand")?.name_en;
  const category = cat as { name?: string; name_bn?: string | null } | null;
  return {
    product: p,
    ctx: {
      brand: brand ?? null,
      category: category?.name ?? p.category ?? null,
      categoryBn: category?.name_bn ?? null,
      subCategory: p.sub_category ?? null,
    },
  };
}

const FIELDS: (keyof SeoFields)[] = ["title_en", "title_bn", "description_en", "description_bn", "keywords", "image_alt_en", "image_alt_bn"];

/** Only known fields, trimmed; keywords as a list. */
function cleanFields(input: unknown): Partial<SeoFields> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Partial<SeoFields> = {};
  for (const k of FIELDS) {
    const v = raw[k];
    if (k === "keywords") {
      const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
      const words = list.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
      if (words.length) out.keywords = words;
    } else if (typeof v === "string" && v.trim()) {
      out[k] = v.trim().slice(0, 400);
    }
  }
  return out;
}

async function store(db: SupabaseClient, productId: string, seo: StoredSeo) {
  const { error } = await db.from("products").update({ seo }).eq("id", productId);
  if (error) throw new Error(/column .*seo/i.test(error.message) ? MISSING_COLUMN : error.message);
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { user } = await requirePermission("products.manage");
    const { productId } = await params;
    const input = await loadInput(getServiceSupabase(user), productId);
    if (!input) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json({
      seo: input.product.seo ?? {},
      preview: buildProductSeo(input.product, input.ctx),
      aiEnabled: isAiSeoConfigured(),
      columnMissing: input.product.seo === undefined,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { user } = await requirePermission("products.manage");
    const { productId } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; seo?: unknown; reset?: boolean };
    const db = getServiceSupabase(user);
    const input = await loadInput(db, productId);
    if (!input) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const { product, ctx } = input;

    if (body.action === "suggest") {
      if (!isAiSeoConfigured()) {
        return NextResponse.json({ error: "The AI writer is off. Set ANTHROPIC_API_KEY to turn it on." }, { status: 503 });
      }
      const suggestion = await writeProductSeo(product, ctx);
      if (!suggestion) return NextResponse.json({ error: "The AI writer could not write this one. Try again, or type the text." }, { status: 502 });
      return NextResponse.json({ suggestion });
    }

    if (body.action !== "saved") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    if (product.seo === undefined) {
      // Migration not applied: the automatic text still works, nothing to store.
      if (body.seo) return NextResponse.json({ error: MISSING_COLUMN }, { status: 409 });
      return NextResponse.json({ ok: true, ai: false });
    }

    const current = (product.seo ?? {}) as StoredSeo;
    let aiQueued = false;

    if (body.seo && typeof body.seo === "object") {
      const fields = cleanFields(body.seo);
      await store(db, productId, { ...fields, source: "manual", generated_at: new Date().toISOString() });
    } else {
      const reset = body.reset === true;
      if (reset) await store(db, productId, {});
      const manual = !reset && current.source === "manual";
      const hash = seoInputHash(product, ctx);
      if (!manual && isAiSeoConfigured() && (reset || current.input_hash !== hash)) {
        aiQueued = true;
        // The form closes now; the text is written in the background.
        after(async () => {
          const written = await writeProductSeo(product, ctx);
          if (!written) return;
          // Staff may have typed their own text meanwhile: never overwrite it.
          const { data: latest } = await db.from("products").select("seo").eq("id", productId).maybeSingle();
          if ((latest?.seo as StoredSeo | null)?.source === "manual") return;
          await store(db, productId, { ...written, source: "ai", input_hash: hash, generated_at: new Date().toISOString() }).catch(
            (err) => console.error("AI SEO text not saved:", err instanceof Error ? err.message : err)
          );
        });
      }
    }

    if (product.status === "published" && !product.deleted_at && product.slug) {
      after(() => pingIndexNow([`/products/${encodeURIComponent(product.slug)}`]));
    }
    return NextResponse.json({ ok: true, ai: aiQueued });
  } catch (error) {
    return handleAdminError(error);
  }
}
