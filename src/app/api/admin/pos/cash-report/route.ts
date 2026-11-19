import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError, listShowrooms, staffNames } from "@/lib/pos/server";
import type { CashLine, CashReport, ReportMethod } from "@/lib/pos/cash-report";

const LIMIT = 5000;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** univapayment = paid online through the gateway; cash on delivery is folded into "other". */
function reportMethod(m: string | null | undefined): ReportMethod {
  switch (m) {
    case "cash":
    case "bkash":
    case "nagad":
    case "card":
    case "bank":
      return m;
    case "univapayment":
      return "online";
    default:
      return "other";
  }
}

const isoOrNull = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/**
 * GET /api/admin/pos/cash-report?from=&to=&showroom=&staff=
 * Every money line in the window, by payment method:
 *   shop sales (+) and refunds (−), custom-jersey payments (+),
 *   drawer cash in (+) / out (−), supplier payments not taken from a drawer (−),
 * plus the closed drawer days. Without pos.manage, only your own lines.
 * from/to are ISO times (to is exclusive). Totals and the chart are worked out on the screen.
 */
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requirePermission("pos.use");
    const db = getServiceSupabase(user);
    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "pos.manage" });
    const manage = canManage === true;

    const q = new URL(request.url).searchParams;
    const from = isoOrNull(q.get("from"));
    const to = isoOrNull(q.get("to"));
    const showroom = q.get("showroom") || null;
    const staff = manage ? q.get("staff") || null : user.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const range = <T extends { gte: any; lt: any }>(query: T, col = "created_at"): T => {
      let out = query;
      if (from) out = out.gte(col, from);
      if (to) out = out.lt(col, to);
      return out;
    };

    let payQ = db
      .from("pos_payments")
      .select("id, type, method, amount, reference, recorded_by, created_at, session_id, sale:pos_sales(id, receipt_no, showroom_id, customer_name)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (staff) payQ = payQ.eq("recorded_by", staff);

    let customQ = db
      .from("custom_order_payments")
      .select("id, method, amount, kind, trx_id, recorded_by, created_at, paid_at, session_id, order:custom_orders(id, order_number, customer_name)")
      .eq("status", "successful")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (staff) customQ = customQ.eq("recorded_by", staff);

    let moveQ = db
      .from("pos_cash_moves")
      .select("id, amount, reason, created_by, created_at, session:pos_sessions(showroom_id)")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (staff) moveQ = moveQ.eq("created_by", staff);

    // Supplier payments from a drawer already show as a cash-out move.
    let supQ = db
      .from("supplier_payments")
      .select("id, method, amount, reference, note, paid_by, created_at, supplier:suppliers(id, name)")
      .is("cash_move_id", null)
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (staff) supQ = supQ.eq("paid_by", staff);

    let dayQ = db.from("pos_sessions").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(500);
    if (staff) dayQ = dayQ.eq("opened_by", staff);
    if (showroom) dayQ = dayQ.eq("showroom_id", showroom);

    const [showrooms, pay, custom, moves, sup, days] = await Promise.all([
      listShowrooms(db),
      range(payQ),
      range(customQ),
      range(moveQ),
      showroom ? Promise.resolve({ data: [], error: null }) : range(supQ),
      range(dayQ, "closed_at"),
    ]);
    const failed = [pay, custom, moves, sup, days].find((r) => r.error);
    if (failed?.error) return bad(explainPosError(failed.error.message), 500);

    // Custom payments only know their drawer; look up its shop.
    const customRows = custom.data ?? [];
    const sessionIds = [...new Set(customRows.map((c) => c.session_id).filter((s): s is string => Boolean(s)))];
    const sessionShop = new Map<string, string>();
    if (sessionIds.length) {
      const { data } = await db.from("pos_sessions").select("id, showroom_id").in("id", sessionIds);
      for (const s of data ?? []) sessionShop.set(s.id, s.showroom_id);
    }

    const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
    const lines: CashLine[] = [];

    for (const p of pay.data ?? []) {
      const sale = one(p.sale as unknown as { id: string; receipt_no: string; showroom_id: string; customer_name: string | null } | null);
      const refund = p.type === "refund";
      lines.push({
        id: `p-${p.id}`,
        at: p.created_at,
        kind: refund ? "refund" : "sale",
        method: reportMethod(p.method),
        amount: refund ? -Number(p.amount) : Number(p.amount),
        ref: sale?.receipt_no ?? null,
        ref_id: sale?.id ?? null,
        label: [sale?.customer_name, p.reference].filter(Boolean).join(" · ") || null,
        staff_id: p.recorded_by,
        showroom_id: sale?.showroom_id ?? null,
      });
    }

    for (const c of customRows) {
      const order = one(c.order as unknown as { id: string; order_number: string; customer_name: string } | null);
      lines.push({
        id: `c-${c.id}`,
        at: c.paid_at ?? c.created_at,
        kind: "custom",
        method: reportMethod(c.method),
        amount: Number(c.amount),
        ref: order?.order_number ?? null,
        ref_id: order?.id ?? null,
        label: [order?.customer_name, c.trx_id].filter(Boolean).join(" · ") || null,
        staff_id: c.recorded_by,
        showroom_id: c.session_id ? (sessionShop.get(c.session_id) ?? null) : null,
      });
    }

    for (const m of moves.data ?? []) {
      const session = one(m.session as unknown as { showroom_id: string } | null);
      const amount = Number(m.amount);
      lines.push({
        id: `m-${m.id}`,
        at: m.created_at,
        kind: amount > 0 ? "cash_in" : "cash_out",
        method: "cash",
        amount,
        ref: null,
        ref_id: null,
        label: m.reason,
        staff_id: m.created_by,
        showroom_id: session?.showroom_id ?? null,
      });
    }

    for (const s of (sup.data ?? []) as { id: string; method: string; amount: number; reference: string | null; note: string | null; paid_by: string | null; created_at: string; supplier: unknown }[]) {
      const supplier = one(s.supplier as unknown as { id: string; name: string } | null);
      lines.push({
        id: `s-${s.id}`,
        at: s.created_at,
        kind: "supplier",
        method: reportMethod(s.method),
        amount: -Number(s.amount),
        ref: supplier?.name ?? null,
        ref_id: supplier?.id ?? null,
        label: [s.reference, s.note].filter(Boolean).join(" · ") || null,
        staff_id: s.paid_by,
        showroom_id: null,
      });
    }

    // A shop filter keeps only lines that belong to that shop (sales, its drawers, custom payments taken there).
    const kept = (showroom ? lines.filter((l) => l.showroom_id === showroom) : lines).sort((a, b) => (a.at < b.at ? 1 : -1));
    const dayRows = days.data ?? [];

    const names = await staffNames(db, [...kept.map((l) => l.staff_id), ...dayRows.map((d) => d.opened_by)]);
    let staffList: { id: string; name: string }[] = [];
    if (manage) {
      const { data } = await db.from("pos_sessions").select("opened_by").order("opened_at", { ascending: false }).limit(1000);
      const ids = [...new Set([...(data ?? []).map((d) => d.opened_by as string), ...names.keys()])];
      const all = await staffNames(db, ids);
      staffList = [...all].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }

    const body: CashReport = {
      showrooms,
      staff: staffList,
      can_manage: manage,
      truncated: [pay, custom, moves, sup].some((r) => (r.data?.length ?? 0) >= LIMIT),
      lines: kept.map((l) => ({ ...l, staff: l.staff_id ? (names.get(l.staff_id) ?? "Staff") : null })),
      days: dayRows.map((d) => ({
        id: d.id,
        showroom_id: d.showroom_id,
        staff: names.get(d.opened_by) ?? "Staff",
        opened_at: d.opened_at,
        closed_at: d.closed_at,
        opening_float: Number(d.opening_float),
        expected_cash: Number(d.expected_cash),
        counted_cash: Number(d.counted_cash),
        difference: Number(d.difference),
        note: d.note,
      })),
    };
    return NextResponse.json(body);
  } catch (error) {
    return handleAdminError(error);
  }
}
