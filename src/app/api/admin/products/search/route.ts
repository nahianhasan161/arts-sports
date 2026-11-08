import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, isDynamicServerUsage } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";

/**
 * GET /api/admin/products/search
 *
 * Product lookup for the manual order form.
 *
 * The storefront has no product search endpoint -- it renders `/shop` as a
 * server component and reads `getProducts()` directly -- so there was nothing
 * for an admin-side picker to call. This is deliberately a thin admin-only read
 * rather than a new public search surface: it exists to fill a dropdown, and
 * anything more would duplicate `/shop`'s filtering in two places.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const url = new URL(request.url);
    const term = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 8)));

    if (!term) {
      // Most-recently-published, so an empty query still shows a usable list
      // rather than nothing.
      const { data, error } = await supabase
        .from("products")
        .select("id, title, price, status")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ products: data ?? [] });
    }

    /*
     * Escaped for use inside an `or` filter.
     *
     * A term containing a comma or parenthesis breaks the PostgREST grammar and
     * the query errors out; stripping them keeps a paste of a product name
     * harmless rather than a 400 the admin has to interpret.
     */
    const escaped = term.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();

    const { data, error } = await supabase
      .from("products")
      .select("id, title, price, status")
      .or(`title.ilike.%${escaped}%,short_description.ilike.%${escaped}%`)
      .is("deleted_at", null)
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data ?? [] });
  } catch (error) {
    if (isDynamicServerUsage(error)) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    console.error("Unexpected product search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
