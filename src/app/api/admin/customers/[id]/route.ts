import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * GET   /api/admin/customers/<id>   the customer with everything they bought, site, shop and custom
 * PATCH /api/admin/customers/<id>   { name, email, notes, tags, marketing_consent, marketing_opt_out }
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("customers.view");
    const { id } = await params;
    const db = getServiceSupabase();
    const { data: customer, error } = await db.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) return bad(explainPosError(error.message), 500);
    if (!customer) return bad("Customer not found", 404);

    const [stats, orders, sales, custom] = await Promise.all([
      db.from("customer_stats").select("*").eq("customer_id", id).maybeSingle(),
      db.from("orders").select("id, total_amount, status, created_at, order_items(title, quantity)").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
      db.from("pos_sales").select("id, receipt_no, total, refunded_total, status, created_at, pos_sale_items(title, variant_label, quantity)").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
      db.from("custom_orders").select("id, order_number, quantity, sport, final_price, estimated_price, status, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    ]);

    type Line = { title: string; variant_label?: string | null; quantity: number };
    const summary = (lines: Line[] | null | undefined) => (lines ?? []).map((l) => `${l.quantity}× ${l.title}${l.variant_label ? ` (${l.variant_label})` : ""}`).join(", ");
    const history = [
      ...(orders.data ?? []).map((o) => ({ kind: "online" as const, id: o.id, ref: `#${String(o.id).slice(0, 8)}`, amount: Number(o.total_amount), status: o.status, at: o.created_at, items: summary(o.order_items as Line[]) })),
      ...(sales.data ?? []).map((s) => ({ kind: "shop" as const, id: s.id, ref: s.receipt_no, amount: Number(s.total) - Number(s.refunded_total), status: s.status, at: s.created_at, items: summary(s.pos_sale_items as Line[]) })),
      ...(custom.data ?? []).map((c) => ({ kind: "custom" as const, id: c.id, ref: c.order_number, amount: Number(c.final_price ?? c.estimated_price), status: c.status, at: c.created_at, items: `${c.quantity}× ${c.sport} jersey` })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return NextResponse.json({ customer, stats: stats.data ?? null, history });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("customers.manage");
    const { id } = await params;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof b.name === "string") patch.name = b.name.trim().slice(0, 120) || null;
    if (typeof b.email === "string") {
      const email = b.email.trim().slice(0, 200);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email address does not look right");
      patch.email = email || null;
    }
    if (typeof b.notes === "string") patch.notes = b.notes.slice(0, 4000) || null;
    if (Array.isArray(b.tags)) {
      patch.tags = [...new Set(b.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
    }
    if (typeof b.marketing_consent === "boolean") {
      patch.marketing_consent = b.marketing_consent;
      if (b.marketing_consent) patch.marketing_consent_at = new Date().toISOString();
    }
    if (typeof b.marketing_opt_out === "boolean") patch.marketing_opt_out = b.marketing_opt_out;
    if (!Object.keys(patch).length) return bad("Nothing to change");

    const { error } = await getServiceSupabase().from("customers").update(patch).eq("id", id);
    if (error) return bad(explainPosError(error.message), 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
