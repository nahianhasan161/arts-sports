import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";

/** GET /api/admin/product-list — id, title, slug of every live product, for pickers. */
export async function GET() {
  try {
    await requirePermission("products.manage");
    const { data, error } = await getServiceSupabase()
      .from("products")
      .select("id, title, slug, status")
      .is("deleted_at", null)
      .order("title")
      .limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data ?? [] });
  } catch (error) {
    return handleAdminError(error);
  }
}
