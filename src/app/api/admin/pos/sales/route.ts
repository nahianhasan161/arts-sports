import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { POS_METHODS, explainPosError, staffNames } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * GET  /api/admin/pos/sales?q=<receipt no or phone>   recent shop sales
 *      (a cashier sees their own; pos.manage sees everyone's)
 * POST /api/admin/pos/sales                            ring up a sale
 */
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requirePermission("pos.use");
    const db = getServiceSupabase();
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);
    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "pos.manage" });

    let query = db
      .from("pos_sales")
      .select("id, receipt_no, customer_name, customer_phone, total, refunded_total, status, sold_by, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (q) {
      const phone = normalizeBdPhone(q);
      const safe = q.replace(/[%,()]/g, "");
      // A scanned receipt QR is a link ending in the sale id.
      const id = safe.match(/[0-9a-f]{8}-[0-9a-f-]{27}$/i)?.[0];
      query = id ? query.eq("id", id) : phone ? query.eq("customer_phone", phone) : query.ilike("receipt_no", `%${safe}%`);
    } else if (canManage !== true) {
      query = query.eq("sold_by", user.id);
    }
    const { data, error } = await query;
    if (error) return bad(explainPosError(error.message), 500);
    const names = await staffNames(db, (data ?? []).map((s) => s.sold_by));
    return NextResponse.json({ sales: (data ?? []).map((s) => ({ ...s, staff: s.sold_by ? names.get(s.sold_by) ?? "Staff" : "" })) });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requirePermission("pos.use");
    const db = getServiceSupabase();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const items = (Array.isArray(b.items) ? b.items.slice(0, 200) : []).map((raw) => {
      const i = raw as Record<string, unknown>;
      return {
        product_id: String(i.product_id ?? ""),
        variant_id: i.variant_id ? String(i.variant_id) : null,
        quantity: Math.floor(Number(i.quantity)),
        discount: Math.max(0, Number(i.discount) || 0),
      };
    });
    if (!items.length) return bad("Add at least one item");
    if (items.some((i) => !i.product_id || !Number.isFinite(i.quantity) || i.quantity < 1)) return bad("A quantity is not valid");

    // { preview: true, coupon_code, items }: what the coupon is worth on this bill.
    if (b.preview === true) {
      const { data: quote, error: quoteError } = await db.rpc("validate_coupon", {
        p_code: typeof b.coupon_code === "string" ? b.coupon_code.trim() : "",
        p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      if (quoteError) return bad(explainPosError(quoteError.message), 400);
      const q = (quote ?? {}) as { valid?: boolean; reason?: string; discount_amount?: number; code?: string };
      if (q.valid === false) return bad(explainPosError(q.reason ?? "coupon_not_found"));
      return NextResponse.json({ code: q.code, discount_amount: Number(q.discount_amount ?? 0) });
    }

    const { data: session } = await db.from("pos_sessions").select("id").eq("opened_by", user.id).eq("status", "open").maybeSingle();
    if (!session) return bad("Open the cash drawer first (Day tab)");

    const payments = (Array.isArray(b.payments) ? b.payments.slice(0, 6) : [])
      .map((raw) => {
        const p = raw as Record<string, unknown>;
        return { method: String(p.method ?? ""), amount: Number(p.amount) || 0, reference: typeof p.reference === "string" ? p.reference.trim().slice(0, 60) : "" };
      })
      .filter((p) => p.amount > 0);
    if (payments.some((p) => !(POS_METHODS as readonly string[]).includes(p.method))) return bad("Choose how it was paid");

    const { data: anyDiscount } = await supabase.rpc("has_permission", { p_code: "pos.manage" });

    const { data, error } = await db.rpc("pos_create_sale", {
      p: {
        actor: user.id,
        session_id: session.id,
        customer_phone: typeof b.customer_phone === "string" ? b.customer_phone.trim().slice(0, 30) : "",
        customer_name: typeof b.customer_name === "string" ? b.customer_name.trim().slice(0, 120) : "",
        marketing_consent: b.marketing_consent === true,
        note: typeof b.note === "string" ? b.note.slice(0, 500) : "",
        coupon_code: typeof b.coupon_code === "string" ? b.coupon_code.trim().slice(0, 40) : "",
        bill_discount: Math.max(0, Number(b.bill_discount) || 0),
        any_discount: anyDiscount === true,
        items,
        payments,
      },
    });
    if (error) return bad(explainPosError(error.message), 400);

    if (typeof b.held_id === "string" && b.held_id) await db.from("pos_held_bills").delete().eq("id", b.held_id);
    return NextResponse.json(data);
  } catch (error) {
    return failed(error);
  }
}
