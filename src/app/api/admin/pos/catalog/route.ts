import { NextResponse } from "next/server";
import { failed } from "@/lib/pos/http";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { buildCatalog } from "@/lib/pos/catalog";

/**
 * GET /api/admin/pos/catalog?have=<version>
 *
 * The register's whole catalogue for the copy kept on the device (no stock;
 * that is /api/admin/pos/stock). When `have` is still the current version the
 * answer is just `{ version, same: true }`, so the regular check is tiny.
 * Prices shown from this copy are only for display: pos_create_sale decides.
 */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("pos.use").catch(() => requirePermission("inventory.manage"));
    const have = new URL(request.url).searchParams.get("have") ?? "";
    const catalog = await buildCatalog(getServiceSupabase(user));
    const headers = { "Cache-Control": "no-store" };
    if (have && have === catalog.version) return NextResponse.json({ version: catalog.version, same: true }, { headers });
    return NextResponse.json(catalog, { headers });
  } catch (error) {
    return failed(error);
  }
}
