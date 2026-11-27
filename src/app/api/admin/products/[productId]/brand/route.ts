import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * PUT /api/admin/products/[productId]/brand   { term_id: string | null }
 *
 * A product has one brand: this removes its current brand link (a
 * `catalog_terms` row of type "brand" in `product_terms`) and adds the new
 * one. null leaves it without a brand. Brands themselves are made on the
 * catalog page.
 */
type Params = { params: Promise<{ productId: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { user: actor } = await requirePermission("products.manage");
    const { productId } = await params;
    const body = (await request.json().catch(() => ({}))) as { term_id?: unknown };
    const termId = typeof body.term_id === "string" && body.term_id ? body.term_id : null;
    const db = getServiceSupabase(actor);

    const { data: brands, error } = await db.from("catalog_terms").select("id").eq("type", "brand");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = (brands ?? []).map((b) => b.id as string);
    if (termId && !ids.includes(termId)) return NextResponse.json({ error: "That brand does not exist" }, { status: 400 });

    if (ids.length > 0) {
      const { error: delError } = await db.from("product_terms").delete().eq("product_id", productId).in("term_id", ids);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    }
    if (termId) {
      const { error: addError } = await db.from("product_terms").insert({ product_id: productId, term_id: termId });
      if (addError) return NextResponse.json({ error: addError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
