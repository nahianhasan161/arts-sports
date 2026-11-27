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
  address: string | null;
  is_blacklisted: boolean;
  last_purchase_at: string | null;
}

/**
 * Most recent buyers when q is empty, otherwise customers whose name, phone or address matches.
 * Text is matched word by word ("mirpur 10" finds "House 5, Mirpur-10, Dhaka"). Max 8.
 */
async function suggest(raw: string): Promise<Suggestion[]> {
  const db = getServiceSupabase();
  const q = raw.trim().slice(0, 60);
  const cols = "id, phone, name, email, address, is_blacklisted";
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
    // Commas, brackets, dots and quotes would break the PostgREST filter string, so they split words.
    const safe = q.replace(/[%,()*."\\:]/g, " ").replace(/\s+/g, " ").trim();
    const digits = safe.replace(/\D/g, "");
    const words = safe.split(" ").filter(Boolean).slice(0, 5);
    if (!words.length) return [];
    const anyField = (w: string) => `or(name.ilike.%${w}%,phone.ilike.%${w}%,address.ilike.%${w}%)`;
    const filter = digits.length >= 3 && digits.length === safe.replace(/[\s+-]/g, "").length
      ? `phone.ilike.%${digits.replace(/^(\+?88)/, "")}%`
      : words.length === 1
        ? `name.ilike.%${words[0]}%,phone.ilike.%${words[0]}%,address.ilike.%${words[0]}%`
        : `and(${words.map(anyField).join(",")})`;
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

/**
 * POST /api/admin/pos/customer { phone, name?, address? } — save the customer from the register's
 * customer box, so a new number is in the list right away (not only after a sale).
 * Finds or creates by phone (`upsert_customer`: an existing name is kept, a missing one filled);
 * a typed address replaces the stored one, the same as a sale does.
 */
export async function POST(request: Request) {
  try {
    const { user: actor } = await requireAnyPermission("pos.use", "orders.manage");
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const phone = normalizeBdPhone(typeof b.phone === "string" ? b.phone : "");
    if (!phone) return bad("Enter a mobile number like 01XXXXXXXXX");
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
    const address = typeof b.address === "string" ? b.address.trim().slice(0, 500) : "";
    const db = getServiceSupabase(actor);
    const { data: id, error } = await db.rpc("upsert_customer", { p_phone: phone, p_name: name || null, p_email: null, p_user_id: null, p_channel: "shop" });
    if (error || !id) return bad(explainPosError(error?.message ?? "Could not save the customer"), 500);
    if (address) {
      const { error: addrError } = await db.from("customers").update({ address }).eq("id", id as string);
      if (addrError) return bad(explainPosError(addrError.message), 500);
    }
    const { data: customer } = await db.from("customers").select("*").eq("id", id as string).maybeSingle();
    const { data: stats } = await db.from("customer_stats").select("total_spent, online_orders, shop_sales, custom_orders, last_purchase_at").eq("customer_id", id as string).maybeSingle();
    return NextResponse.json({ customer: customer ? { ...customer, stats: stats ?? null } : null });
  } catch (error) {
    return failed(error);
  }
}
