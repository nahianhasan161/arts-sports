import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { POS_METHODS, explainPosError, staffNames } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * GET  /api/admin/pos/sales?q=<receipt no or phone>&from=&to=&status=&staff=   recent shop sales
 *      (a cashier sees their own; pos.manage sees everyone's)
 * POST /api/admin/pos/sales                            ring up a sale
 */
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requirePermission("pos.use");
    const db = getServiceSupabase(user);
    const sp = new URL(request.url).searchParams;
    const q = (sp.get("q") ?? "").trim().slice(0, 40);
    const isoOrNull = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
    const from = isoOrNull(sp.get("from"));
    const to = isoOrNull(sp.get("to"));
    const status = sp.get("status") ?? "";
    const staff = sp.get("staff") ?? "";
    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "pos.manage" });

    const limit = from || status || staff ? 300 : 60;
    let query = db
      .from("pos_sales")
      .select("id, receipt_no, customer_name, customer_phone, subtotal, discount_total, coupon_discount, total, refunded_total, status, sold_by, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);
    if (["completed", "partially_refunded", "refunded"].includes(status)) query = query.eq("status", status);
    if (q) {
      const phone = normalizeBdPhone(q);
      const safe = q.replace(/[%,()]/g, "");
      // A scanned receipt QR is a link ending in the sale id.
      const id = safe.match(/[0-9a-f]{8}-[0-9a-f-]{27}$/i)?.[0];
      query = id ? query.eq("id", id) : phone ? query.eq("customer_phone", phone) : query.ilike("receipt_no", `%${safe}%`);
    } else if (canManage !== true) {
      query = query.eq("sold_by", user.id);
    } else if (/^[0-9a-f-]{36}$/i.test(staff)) {
      query = query.eq("sold_by", staff);
    }
    const { data, error } = await query;
    if (error) return bad(explainPosError(error.message), 500);
    const rows = data ?? [];
    const ids = rows.map((s) => s.id);
    // Per bill: how it was paid (charges by method) and how many pieces it had.
    const [names, pays, items] = await Promise.all([
      staffNames(db, rows.map((s) => s.sold_by)),
      ids.length ? db.from("pos_payments").select("sale_id, type, method, amount").in("sale_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("pos_sale_items").select("sale_id, quantity").in("sale_id", ids) : Promise.resolve({ data: [] }),
    ]);
    const paid = new Map<string, Record<string, number>>();
    for (const p of (pays.data ?? []) as { sale_id: string; type: string; method: string; amount: number }[]) {
      if (p.type !== "charge") continue;
      const m = paid.get(p.sale_id) ?? {};
      m[p.method] = (m[p.method] ?? 0) + Number(p.amount || 0);
      paid.set(p.sale_id, m);
    }
    const pieces = new Map<string, number>();
    for (const i of (items.data ?? []) as { sale_id: string; quantity: number }[]) pieces.set(i.sale_id, (pieces.get(i.sale_id) ?? 0) + Number(i.quantity || 0));
    return NextResponse.json({
      sales: rows.map((s) => ({
        ...s,
        staff: s.sold_by ? names.get(s.sold_by) ?? "Staff" : "",
        paid: paid.get(s.id) ?? {},
        item_count: pieces.get(s.id) ?? 0,
      })),
      has_more: rows.length >= limit,
      can_manage: canManage === true,
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requirePermission("pos.use");
    const db = getServiceSupabase(user);
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
    if (!session) return bad("Open the register first (count the cash drawer)");

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

    // Home-delivery address: kept on the sale and on the customer. The columns come with
    // 20261119120000; before that migration these updates fail quietly and the sale stands.
    const address = typeof b.customer_address === "string" ? b.customer_address.trim().slice(0, 500) : "";
    const saleId = (data as { sale_id?: string } | null)?.sale_id;
    if (address && saleId) {
      await db.from("pos_sales").update({ customer_address: address }).eq("id", saleId);
      const phone = normalizeBdPhone(typeof b.customer_phone === "string" ? b.customer_phone : "");
      if (phone) await db.from("customers").update({ address }).eq("phone", phone);
    }
    return NextResponse.json(data);
  } catch (error) {
    return failed(error);
  }
}
