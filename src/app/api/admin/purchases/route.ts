import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError, listShowrooms } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";
import { auditFor, listPayments, listPurchases, purchaseEdits, purchaseItems } from "@/lib/pos/purchases";
import { SUPPLIER_PAY_METHODS } from "@/lib/pos/purchase-types";

/**
 * Buying goods from a supplier (migration 20261117120000).
 *
 * GET  /api/admin/purchases?supplier_id=     recent purchases (one supplier, or all)
 * GET  /api/admin/purchases?id=              one purchase with its items and payments
 * POST { action: "create", supplier_id, showroom_id, reference, invoice_date, note,
 *        items: [{ variant_id, quantity, unit_cost }], discount, extra_cost,
 *        paid, method, pay_reference, from_drawer }
 *      { action: "pay", supplier_id, receipt_id?, amount, method, reference, note, from_drawer }
 *      { action: "edit", receipt_id, reason, reference, invoice_date, note, discount, extra_cost,
 *        items: [{ variant_id, quantity, unit_cost }] }      correct a saved purchase (quantity 0 removes a line)
 *      { action: "void_payment", payment_id, reason }       undo a payment (kept, struck out)
 * Every change is in the audit log with the staff member; corrections also in stock_receipt_edits.
 *
 * Totals are worked out in SQL (inventory_receive / supplier_purchase); the screen only shows them.
 */
export async function GET(request: Request) {
  try {
    const { user: actor } = await requirePermission("inventory.manage");
    const url = new URL(request.url);
    const db = getServiceSupabase(actor);
    const id = url.searchParams.get("id");
    if (id) {
      const [rows, items, payments, history] = await Promise.all([listPurchases(db, { id, limit: 1 }), purchaseItems(db, id), listPayments(db, { receiptId: id }), purchaseEdits(db, id)]);
      if (!rows.length) return bad("Purchase not found", 404);
      // Who entered it: the first audit entry for the purchase row.
      const created = (await auditFor(db, [["stock_receipts", [id]]], 50).catch(() => [])).find((e) => e.action === "insert");
      return NextResponse.json({ purchase: rows[0], items, payments, edits: history.edits, names: history.names, created_by: created?.who ?? rows[0].staff });
    }
    const supplierId = url.searchParams.get("supplier_id") || undefined;
    return NextResponse.json({ purchases: await listPurchases(db, { supplierId, limit: 100 }) });
  } catch (error) {
    return failed(error);
  }
}

const money = (v: unknown) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(user);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const method = SUPPLIER_PAY_METHODS.find((m) => m === b.method) ?? "cash";

    if (b.action === "create") {
      const supplierId = text(b.supplier_id, 80);
      if (!supplierId) return bad("Choose a supplier");
      const items = (Array.isArray(b.items) ? b.items.slice(0, 500) : []) as Record<string, unknown>[];
      const lines = items
        .map((i) => ({ variant_id: String(i.variant_id ?? ""), quantity: Math.floor(Number(i.quantity) || 0), unit_cost: i.unit_cost === "" || i.unit_cost === null || i.unit_cost === undefined ? "" : String(Number(i.unit_cost)) }))
        .filter((i) => i.variant_id && i.quantity > 0);
      if (!lines.length) return bad("Add at least one item with a quantity");
      if (lines.some((l) => l.unit_cost === "NaN")) return bad("A buying price is not valid");
      const discount = money(b.discount);
      const extra = money(b.extra_cost);
      const paid = money(b.paid);
      if (![discount, extra, paid].every((n) => Number.isFinite(n) && n >= 0)) return bad("An amount is not valid");
      const date = text(b.invoice_date, 10);
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("The invoice date is not valid");

      const showrooms = await listShowrooms(db);
      const showroomId = showrooms.find((s) => s.id === b.showroom_id)?.id ?? showrooms[0]?.id;
      const { data, error } = await db.rpc("supplier_purchase", {
        p: {
          actor: user.id,
          supplier_id: supplierId,
          showroom_id: showroomId,
          reference: text(b.reference, 80),
          note: text(b.note, 500),
          invoice_date: date,
          items: lines,
          discount,
          extra_cost: extra,
          paid,
          method,
          pay_reference: text(b.pay_reference, 80),
          from_drawer: b.from_drawer === true && method === "cash",
        },
      });
      if (error) return bad(explainPosError(error.message), 400);
      return NextResponse.json({ ok: true, id: data });
    }

    if (b.action === "pay") {
      const amount = money(b.amount);
      if (!Number.isFinite(amount) || amount <= 0) return bad("Enter the amount");
      const { data, error } = await db.rpc("supplier_pay", {
        p: {
          actor: user.id,
          supplier_id: text(b.supplier_id, 80),
          receipt_id: text(b.receipt_id, 80),
          amount,
          method,
          reference: text(b.reference, 80),
          note: text(b.note, 500),
          from_drawer: b.from_drawer === true && method === "cash",
        },
      });
      if (error) return bad(explainPosError(error.message), 400);
      return NextResponse.json({ ok: true, id: data });
    }

    if (b.action === "edit") {
      const reason = text(b.reason, 500);
      if (!reason) return bad("Write why you are changing it");
      const items = (Array.isArray(b.items) ? b.items.slice(0, 500) : []) as Record<string, unknown>[];
      const lines = items
        .map((i) => ({
          variant_id: String(i.variant_id ?? ""),
          quantity: Math.floor(Number(i.quantity) || 0),
          unit_cost: i.unit_cost === "" || i.unit_cost === null || i.unit_cost === undefined ? null : Number(i.unit_cost),
        }))
        .filter((i) => i.variant_id);
      if (lines.some((l) => l.quantity < 0 || (l.unit_cost !== null && !(Number.isFinite(l.unit_cost) && l.unit_cost >= 0)))) return bad("A quantity or buying price is not valid");
      const discount = money(b.discount);
      const extra = money(b.extra_cost);
      if (![discount, extra].every((v) => Number.isFinite(v) && v >= 0)) return bad("An amount is not valid");
      const date = text(b.invoice_date, 10);
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("The invoice date is not valid");
      const { error } = await db.rpc("supplier_purchase_edit", {
        p: { actor: user.id, receipt_id: text(b.receipt_id, 80), reason, reference: text(b.reference, 80), invoice_date: date, note: text(b.note, 500), discount, extra_cost: extra, items: lines },
      });
      if (error) return bad(explainPosError(error.message), 400);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "void_payment") {
      const reason = text(b.reason, 500);
      if (!reason) return bad("Write why you are undoing it");
      const { data, error } = await db.rpc("supplier_payment_void", { p: { actor: user.id, payment_id: text(b.payment_id, 80), reason } });
      if (error) return bad(explainPosError(error.message), 400);
      return NextResponse.json({ ok: true, cash_back_in_drawer: Boolean(data) });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}
