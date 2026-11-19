import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { explainPosError } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

interface Suggestion {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  is_blacklisted: boolean;
  last_purchase_at: string | null;
}

/** Most recent buyers when q is empty, otherwise customers whose name or phone matches. Max 8. */
async function suggest(raw: string): Promise<Suggestion[]> {
  const db = getServiceSupabase();
  const q = raw.trim().slice(0, 60);
  const cols = "id, phone, name, email, is_blacklisted";
  let rows: Omit<Suggestion, "last_purchase_at">[] = [];
  if (!q) {
    const { data: recent } = await db.from("customer_stats").select("customer_id").not("last_purchase_at", "is", null).order("last_purchase_at", { ascending: false }).limit(8);
    const ids = (recent ?? []).map((r) => r.customer_id as string);
    if (ids.length) {
      const { data } = await db.from("customers").select(cols).in("id", ids);
      const byId = new Map((data ?? []).map((c) => [c.id, c]));
      rows = ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
    } else {
      const { data } = await db.from("customers").select(cols).order("created_at", { ascending: false }).limit(8);
      rows = data ?? [];
    }
  } else {
    const safe = q.replace(/[%,()*]/g, "");
    const digits = safe.replace(/\D/g, "");
    const filter = digits.length >= 3 && digits.length === safe.replace(/[\s+-]/g, "").length
      ? `phone.ilike.%${digits.replace(/^(\+?88)/, "")}%`
      : `name.ilike.%${safe}%,phone.ilike.%${safe}%`;
    if (!safe) return [];
    const { data } = await db.from("customers").select(cols).or(filter).order("created_at", { ascending: false }).limit(8);
    rows = data ?? [];
  }
  if (!rows.length) return [];
  const { data: stats } = await db.from("customer_stats").select("customer_id, last_purchase_at").in("customer_id", rows.map((r) => r.id));
  const last = new Map((stats ?? []).map((s) => [s.customer_id, s.last_purchase_at as string | null]));
  return rows.map((r) => ({ ...r, last_purchase_at: last.get(r.id) ?? null }));
}

/** GET /api/admin/pos/customer?q=text — suggestions (recent buyers when empty). */
/** GET /api/admin/pos/customer?phone=01XXXXXXXXX — who this is, if they have bought before. */
export async function GET(request: Request) {
  try {
    const { user: actor } = await requireAnyPermission("pos.use", "customers.view", "orders.manage");
    const params = new URL(request.url).searchParams;
    if (params.has("q")) return NextResponse.json({ customers: await suggest(params.get("q") ?? "") });
    const phone = normalizeBdPhone(params.get("phone"));
    if (!phone) return NextResponse.json({ customer: null });
    const db = getServiceSupabase(actor);
    const { data: customer, error } = await db
      .from("customers")
      .select("*") // includes `address` once 20261119120000 is applied
      .eq("phone", phone)
      .maybeSingle();
    if (error) return bad(explainPosError(error.message), 500);
    if (!customer) return NextResponse.json({ customer: null });
    const { data: stats } = await db.from("customer_stats").select("total_spent, online_orders, shop_sales, custom_orders, last_purchase_at").eq("customer_id", customer.id).maybeSingle();
    return NextResponse.json({ customer: { ...customer, stats: stats ?? null } });
  } catch (error) {
    return failed(error);
  }
}
