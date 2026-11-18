import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { parseReceiptSettings, RECEIPT_SETTINGS_KEY } from "@/lib/pos/receipt-settings";

/**
 * GET /api/admin/pos/receipt-settings   (pos.use: the receipt pages read it)
 * PUT /api/admin/pos/receipt-settings   (settings.manage) body = ReceiptSettings
 *
 * Shop details, logo and terms printed on shop receipts.
 */
export async function GET() {
  try {
    const { user } = await requirePermission("pos.use");
    const { data, error } = await getServiceSupabase(user).from("app_settings").select("value").eq("key", RECEIPT_SETTINGS_KEY).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: parseReceiptSettings(data?.value ?? null) });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("settings.manage");
    const settings = parseReceiptSettings(await request.json().catch(() => null));
    const { error } = await getServiceSupabase(user)
      .from("app_settings")
      .upsert({ key: RECEIPT_SETTINGS_KEY, value: JSON.stringify(settings), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings });
  } catch (error) {
    return handleAdminError(error);
  }
}
