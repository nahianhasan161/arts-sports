import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError, loadVariants } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * GET  /api/admin/inventory/suppliers            suppliers, and what each has for us
 * POST { action: "save", id?, name, phone, address, notes, lead_days, is_active }
 *      { action: "delete", id }
 *      { action: "stock", supplier_id, rows: [{ code, quantity, unit_cost }] }
 *        code is the variant's barcode or SKU; this is what the Excel/CSV upload sends.
 */
export async function GET() {
  try {
    await requirePermission("inventory.manage");
    const db = getServiceSupabase();
    const [suppliers, stock] = await Promise.all([
      db.from("suppliers").select("*").order("name"),
      db.from("supplier_stock").select("variant_id, supplier_id, quantity, unit_cost, updated_at").gt("quantity", 0).limit(3000),
    ]);
    if (suppliers.error) return bad(explainPosError(suppliers.error.message), 500);
    const variants = await loadVariants(db, { variantIds: [...new Set((stock.data ?? []).map((s) => s.variant_id))] });
    const byId = new Map(variants.map((v) => [v.variant_id, v]));
    return NextResponse.json({
      suppliers: suppliers.data ?? [],
      stock: (stock.data ?? []).map((s) => ({ ...s, title: byId.get(s.variant_id)?.title ?? "", label: byId.get(s.variant_id)?.label ?? "", code: byId.get(s.variant_id)?.barcode ?? byId.get(s.variant_id)?.sku ?? "" })),
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("inventory.manage");
    const db = getServiceSupabase();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

    if (b.action === "save") {
      const name = text(b.name, 120);
      if (!name) return bad("Give the supplier a name");
      const lead = Math.floor(Number(b.lead_days ?? 3));
      const row = { name, phone: text(b.phone, 30) || null, address: text(b.address, 300) || null, notes: text(b.notes, 1000) || null, lead_days: Number.isFinite(lead) && lead >= 0 ? lead : 3, is_active: b.is_active !== false };
      const { error } = b.id ? await db.from("suppliers").update(row).eq("id", String(b.id)) : await db.from("suppliers").insert(row);
      if (error) return bad(explainPosError(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "delete") {
      const { error } = await db.from("suppliers").delete().eq("id", String(b.id ?? ""));
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
