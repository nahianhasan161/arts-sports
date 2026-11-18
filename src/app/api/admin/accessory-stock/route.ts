import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { bad, failed } from "@/lib/pos/http";
import { SUPPLIER_PAY_METHODS } from "@/lib/pos/purchase-types";
import { WASTAGE_REASONS } from "@/lib/custom-jersey/fabric-stock";
import { ACCESSORY_KINDS } from "@/lib/custom-jersey/production";

/**
 * Accessory stock: silicon logo / name / number, labels, tags... counted in pieces
 * (migration 20261118150000).
 *
 * GET  ?accessory_id=   accessories with their stock, suppliers, recent entries
 * POST { action: "item", id?, name_en, name_bn?, kind, per_jersey?, low_stock_pcs?, is_active? }   add / edit an item
 *      { action: "purchase", accessory_id, supplier_id?, qty, cost_per_pc, extra_cost?, note?, paid?, method?, pay_reference?, from_drawer? }
 *      { action: "used", accessory_id, qty, order_number?, note? }
 *      { action: "wastage", accessory_id, reason, qty, note? }
 *      { action: "adjust", accessory_id, qty (+/-), note }
 *      { action: "void", id, reason }
 */

const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const MIGRATION = "Accessory stock is not set up yet: the migration 20261118150000_production_costing.sql has not been applied.";
const explain = (m: string) => (/accessor(y|ies)_|custom_accessories/.test(m) && /does not exist|schema cache|Could not find/i.test(m) ? MIGRATION : m);

const SQL_ERRORS: Record<string, string> = {
  accessory_not_found: "Accessory not found",
  invalid_qty: "Enter how many pieces",
  invalid_amount: "Check the price and the amounts",
  supplier_required: "Choose the supplier you are paying",
  supplier_not_found: "Supplier not found",
  session_not_open: "Open your cash drawer first, or untick “from the drawer”",
  drawer_cash_only: "Only cash can come out of the drawer",
};

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(user);
    const itemId = new URL(request.url).searchParams.get("accessory_id");
    let movesQ = db
      .from("accessory_moves")
      .select("id, accessory_id, kind, reason, qty, cost_per_pc, total_cost, supplier_id, batch_id, custom_order_id, note, created_by, created_at, voided_at, void_reason")
      .order("created_at", { ascending: false })
      .limit(200);
    if (itemId) movesQ = movesQ.eq("accessory_id", itemId);
    const [items, stock, suppliers, moves] = await Promise.all([
      db.from("custom_accessories").select("id, name_en, name_bn, kind, per_jersey, low_stock_pcs, is_active, display_order").order("display_order").order("name_en"),
      db.from("accessory_stock").select("*"),
      db.from("suppliers").select("id, name, phone").eq("is_active", true).order("name"),
      movesQ,
    ]);
    const err = items.error ?? stock.error ?? suppliers.error ?? moves.error;
    if (err) return bad(explain(err.message), 503);

    const rows = moves.data ?? [];
    const orderIds = [...new Set(rows.map((m) => m.custom_order_id).filter(Boolean))] as string[];
    const batchIds = [...new Set(rows.map((m) => m.batch_id).filter(Boolean))] as string[];
    const staffIds = [...new Set(rows.map((m) => m.created_by).filter(Boolean))] as string[];
    const [orders, batches, staff] = await Promise.all([
      orderIds.length ? db.from("custom_orders").select("id, order_number").in("id", orderIds) : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
      batchIds.length ? db.from("production_batches").select("id, batch_number").in("id", batchIds) : Promise.resolve({ data: [] as { id: string; batch_number: string }[] }),
      staffIds.length ? db.from("profiles").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ]);
    const orderNo = new Map((orders.data ?? []).map((o) => [o.id, o.order_number]));
    const batchNo = new Map((batches.data ?? []).map((b) => [b.id, b.batch_number]));
    const staffName = new Map((staff.data ?? []).map((s) => [s.id, s.full_name]));
    const byItem = new Map((stock.data ?? []).map((s) => [s.accessory_id, s]));

    return NextResponse.json({
      accessories: (items.data ?? []).map((a) => ({ ...a, stock: byItem.get(a.id) ?? null })),
      suppliers: suppliers.data ?? [],
      moves: rows.map((m) => ({
        ...m,
        order_number: m.custom_order_id ? orderNo.get(m.custom_order_id) ?? null : null,
        batch_number: m.batch_id ? batchNo.get(m.batch_id) ?? null : null,
        staff: m.created_by ? staffName.get(m.created_by) ?? null : null,
      })),
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(user);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const itemId = text(b.accessory_id, 64);
    const note = text(b.note, 300) || null;

    if (b.action === "void") {
      const id = text(b.id, 64);
      const reason = text(b.reason, 300);
      if (!id) return bad("Entry not found");
      if (!reason) return bad("Write why you are undoing it");
      const { data, error } = await db
        .from("accessory_moves")
        .update({ voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason })
        .eq("id", id)
        .is("voided_at", null)
        .select("id");
      if (error) return bad(explain(error.message), 500);
      if (!data?.length) return bad("That entry was already undone");
      return NextResponse.json({ ok: true });
    }

    if (b.action === "item") {
      const name = text(b.name_en, 120);
      if (!name) return bad("Write the accessory name");
      const perJersey = Math.floor(num(b.per_jersey));
      const low = Math.floor(num(b.low_stock_pcs));
      const row = {
        name_en: name,
        name_bn: text(b.name_bn, 120) || null,
        kind: ACCESSORY_KINDS.find((k) => k === b.kind) ?? "other",
        per_jersey: Number.isFinite(perJersey) && perJersey >= 0 ? perJersey : null,
        low_stock_pcs: Number.isFinite(low) && low >= 0 ? low : null,
        is_active: b.is_active !== false,
      };
      const id = text(b.id, 64);
      const { data, error } = id
        ? await db.from("custom_accessories").update(row).eq("id", id).select("id").maybeSingle()
        : await db.from("custom_accessories").insert(row).select("id").single();
      if (error) return bad(explain(error.message), 500);
      if (!data) return bad("Accessory not found", 404);
      return NextResponse.json({ id: data.id });
    }

    if (!itemId) return bad("Choose an accessory");

    if (b.action === "purchase") {
      const qty = Math.floor(num(b.qty));
      const rate = num(b.cost_per_pc);
      if (!(qty > 0)) return bad("Enter how many pieces");
      if (!(rate >= 0)) return bad("Enter the price per piece");
      const { data, error } = await db.rpc("accessory_purchase", {
        p: {
          actor: user.id,
          accessory_id: itemId,
          supplier_id: text(b.supplier_id, 64) || null,
          qty,
          cost_per_pc: rate,
          extra_cost: Number.isFinite(num(b.extra_cost)) ? num(b.extra_cost) : 0,
          note,
          paid: Number.isFinite(num(b.paid)) ? num(b.paid) : 0,
          method: SUPPLIER_PAY_METHODS.find((m) => m === b.method) ?? "cash",
          pay_reference: text(b.pay_reference, 120) || null,
          from_drawer: b.from_drawer === true,
        },
      });
      if (error) return bad(SQL_ERRORS[error.message.trim()] ?? explain(error.message), 400);
      return NextResponse.json({ id: data });
    }

    const { data: item, error: iErr } = await db.from("custom_accessories").select("id").eq("id", itemId).maybeSingle();
    if (iErr) return bad(explain(iErr.message), 500);
    if (!item) return bad("Accessory not found", 404);
    const qty = Math.trunc(num(b.qty));

    if (b.action === "used" || b.action === "wastage") {
      if (!(qty > 0)) return bad("Enter how many pieces");
      // Keep the average cost on the row, like a batch does, so reports stay stable.
      const { data: st } = await db.from("accessory_stock").select("avg_cost").eq("accessory_id", itemId).maybeSingle();
      const avg = st?.avg_cost === null || st?.avg_cost === undefined ? null : Number(st.avg_cost);
      const row: Record<string, unknown> = {
        accessory_id: itemId,
        kind: b.action,
        qty: -qty,
        cost_per_pc: avg,
        total_cost: avg === null ? null : Math.round(qty * avg * 100) / 100,
        note,
        created_by: user.id,
      };
      if (b.action === "wastage") {
        const reason = WASTAGE_REASONS.find((r) => r === b.reason);
        if (!reason) return bad("Choose why it was wasted");
        row.reason = reason;
      } else {
        const orderNumber = text(b.order_number, 40).toUpperCase();
        if (orderNumber) {
          const { data: order } = await db.from("custom_orders").select("id").eq("order_number", orderNumber).maybeSingle();
          if (!order) return bad(`Custom order ${orderNumber} not found`);
          row.custom_order_id = order.id;
        }
      }
      const { error } = await db.from("accessory_moves").insert(row);
      if (error) return bad(explain(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "adjust") {
      if (!Number.isFinite(qty) || qty === 0) return bad("Enter the pieces to add (+) or take off (−)");
      if (!note) return bad("Write why you are correcting the count");
      const { error } = await db.from("accessory_moves").insert({ accessory_id: itemId, kind: "adjust", qty, note, created_by: user.id });
      if (error) return bad(explain(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}
