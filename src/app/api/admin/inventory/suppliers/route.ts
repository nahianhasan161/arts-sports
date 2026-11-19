import { supplierCategories } from "@/lib/pos/purchase-types";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError, loadVariants } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";
import { auditFor, listPayments, listPurchases } from "@/lib/pos/purchases";

/**
 * GET  /api/admin/inventory/suppliers            suppliers, what each has for us, and what we owe each
 * GET  /api/admin/inventory/suppliers?id=        one supplier: details, balance, purchases, payments,
 *                                                and the change history (who changed what, from the audit log)
 * POST { action: "save", id?, categories?: SupplierCategory[], name, contact_person, phone, alt_phone, email, address,
 *        payment_info, notes, lead_days, opening_due, is_active }   (fields left out are kept)
 *      { action: "delete", id }   a supplier with purchases or payments is turned off instead
 *      { action: "stock", supplier_id, rows: [{ code, quantity, unit_cost }] }
 *        code is the variant's barcode or SKU; this is what the Excel/CSV upload sends.
 */
export async function GET(request: Request) {
  try {
    const { user: actor } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(actor);
    const id = new URL(request.url).searchParams.get("id");

    if (id) {
      const [supplier, balance] = await Promise.all([
        db.from("suppliers").select("*").eq("id", id).maybeSingle(),
        db.from("supplier_balances").select("*").eq("supplier_id", id).maybeSingle(),
      ]);
      if (supplier.error) return bad(explainPosError(supplier.error.message), 500);
      if (!supplier.data) return bad("Supplier not found", 404);
      if (balance.error) return bad(explainPosError(balance.error.message), 500);
      const [purchases, payments, stock] = await Promise.all([
        listPurchases(db, { supplierId: id, limit: 300 }),
        listPayments(db, { supplierId: id }),
        db.from("supplier_stock").select("variant_id, quantity, unit_cost").eq("supplier_id", id).gt("quantity", 0).limit(1000),
      ]);
      const [variants, history] = await Promise.all([
        loadVariants(db, { variantIds: (stock.data ?? []).map((s) => s.variant_id) }),
        auditFor(db, [
          ["suppliers", [id]],
          ["stock_receipts", purchases.map((p) => p.id)],
          ["supplier_payments", payments.map((p) => p.id)],
        ]).catch(() => []),
      ]);
      const byId = new Map(variants.map((v) => [v.variant_id, v]));
      return NextResponse.json({
        supplier: supplier.data,
        balance: balance.data,
        purchases,
        payments,
        history,
        stock: (stock.data ?? []).map((s) => ({ ...s, title: byId.get(s.variant_id)?.title ?? "", label: byId.get(s.variant_id)?.label ?? "", code: byId.get(s.variant_id)?.barcode ?? byId.get(s.variant_id)?.sku ?? "" })),
      });
    }

    const [suppliers, stock, balances] = await Promise.all([
      db.from("suppliers").select("*").order("name"),
      db.from("supplier_stock").select("variant_id, supplier_id, quantity, unit_cost, updated_at").gt("quantity", 0).limit(3000),
      // Missing until migration 20261117120000 is applied; the rest still works.
      db.from("supplier_balances").select("*"),
    ]);
    if (suppliers.error) return bad(explainPosError(suppliers.error.message), 500);
    const variants = await loadVariants(db, { variantIds: [...new Set((stock.data ?? []).map((s) => s.variant_id))] });
    const byId = new Map(variants.map((v) => [v.variant_id, v]));
    return NextResponse.json({
      suppliers: suppliers.data ?? [],
      balances: balances.error ? [] : balances.data ?? [],
      balances_error: balances.error ? explainPosError(balances.error.message) : null,
      stock: (stock.data ?? []).map((s) => ({ ...s, title: byId.get(s.variant_id)?.title ?? "", label: byId.get(s.variant_id)?.label ?? "", code: byId.get(s.variant_id)?.barcode ?? byId.get(s.variant_id)?.sku ?? "" })),
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user: actor } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(actor);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

    if (b.action === "save") {
      const name = text(b.name, 120);
      if (!name) return bad("Give the supplier a name");
      const lead = Math.floor(Number(b.lead_days ?? 3));
      const row: Record<string, unknown> = { name, phone: text(b.phone, 30) || null, address: text(b.address, 300) || null, notes: text(b.notes, 1000) || null, lead_days: Number.isFinite(lead) && lead >= 0 ? lead : 3, is_active: b.is_active !== false };
      // The newer fields (migration 20261117120000) are only written when sent,
      // so the short form in the Stock page does not wipe them.
      const extra: [string, number][] = [["contact_person", 120], ["alt_phone", 30], ["email", 160], ["payment_info", 500]];
      for (const [key, max] of extra) if (key in b) row[key] = text(b[key], max) || null;
      // Categories (20261119120000): only written when sent, so older forms and a DB without the column keep working.
      if (Array.isArray(b.categories)) row.categories = supplierCategories(b.categories);
      if ("opening_due" in b) {
        const due = b.opening_due === "" || b.opening_due === null ? 0 : Number(b.opening_due);
        if (!Number.isFinite(due)) return bad("The old due is not a number");
        row.opening_due = Math.round(due * 100) / 100;
      }
      let res = b.id ? await db.from("suppliers").update(row).eq("id", String(b.id)).select("id").single() : await db.from("suppliers").insert(row).select("id").single();
      if (res.error && "categories" in row && /categories/.test(res.error.message) && /does not exist|schema cache|Could not find/i.test(res.error.message)) {
        delete row.categories;
        res = b.id ? await db.from("suppliers").update(row).eq("id", String(b.id)).select("id").single() : await db.from("suppliers").insert(row).select("id").single();
      }
      if (res.error) return bad(explainPosError(res.error.message), 500);
      return NextResponse.json({ ok: true, id: res.data.id });
    }

    if (b.action === "delete") {
      const id = String(b.id ?? "");
      // Purchases and payments are money history: keep them, turn the supplier off.
      const [receipts, payments] = await Promise.all([
        db.from("stock_receipts").select("id", { count: "exact", head: true }).eq("supplier_id", id),
        db.from("supplier_payments").select("id", { count: "exact", head: true }).eq("supplier_id", id),
      ]);
      if ((receipts.count ?? 0) > 0 || (!payments.error && (payments.count ?? 0) > 0)) {
        const { error } = await db.from("suppliers").update({ is_active: false }).eq("id", id);
        if (error) return bad(explainPosError(error.message), 500);
        return NextResponse.json({ ok: true, deactivated: true });
      }
      const { error } = await db.from("suppliers").delete().eq("id", id);
      if (error) return bad(explainPosError(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "stock") {
      const supplierId = String(b.supplier_id ?? "");
      const { data: supplier } = await db.from("suppliers").select("id").eq("id", supplierId).maybeSingle();
      if (!supplier) return bad("Choose a supplier");
      const rows = (Array.isArray(b.rows) ? b.rows.slice(0, 2000) : []) as Record<string, unknown>[];
      let saved = 0;
      const unknown: string[] = [];
      for (const r of rows) {
        const quantity = Math.floor(Number(r.quantity));
        if (!Number.isFinite(quantity) || quantity < 0) continue;
        let variantId = text(r.variant_id, 80);
        if (!variantId) {
          const code = text(r.code, 60);
          if (!code) continue;
          const found = await loadVariants(db, { code });
          if (found.length !== 1) {
            unknown.push(code);
            continue;
          }
          variantId = found[0].variant_id;
        }
        const cost = r.unit_cost === "" || r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost);
        const { error } = await db
          .from("supplier_stock")
          .upsert({ variant_id: variantId, supplier_id: supplierId, quantity, unit_cost: cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null, updated_at: new Date().toISOString() }, { onConflict: "variant_id,supplier_id" });
        if (error) return bad(explainPosError(error.message), 500);
        saved++;
      }
      return NextResponse.json({ ok: true, saved, unknown: unknown.slice(0, 50) });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}
