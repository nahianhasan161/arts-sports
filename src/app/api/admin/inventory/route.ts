import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError, listShowrooms, loadVariants, numericSetting, shelfStock, staffNames, type VariantRow } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * GET  /api/admin/inventory?q=&low=1&showroom_id=      stock per variant
 * GET  /api/admin/inventory?movements=<variant id|all>  the history of changes
 * GET  /api/admin/inventory?ids=a,b,c                   chosen variants (label sheet)
 * POST /api/admin/inventory   { action: "receive" | "adjust" | "transfer" | "barcodes" | "threshold", ... }
 */
export async function GET(request: Request) {
  try {
    await requirePermission("inventory.manage");
    const url = new URL(request.url);
    const db = getServiceSupabase();
    const showrooms = await listShowrooms(db);
    const showroomId = showrooms.find((s) => s.id === url.searchParams.get("showroom_id"))?.id ?? showrooms[0]?.id ?? "";

    const movementsOf = url.searchParams.get("movements");
    if (movementsOf) {
      let query = db
        .from("inventory_movements")
        .select("variant_id, showroom_id, delta, reason, reference_id, note, unit_cost, created_by, created_at")
        .neq("delta", 0)
        .order("created_at", { ascending: false })
        .limit(200);
      if (movementsOf !== "all") query = query.eq("variant_id", movementsOf);
      const { data, error } = await query;
      if (error) return bad(explainPosError(error.message), 500);
      const [variants, names] = await Promise.all([
        loadVariants(db, { variantIds: [...new Set((data ?? []).map((m) => m.variant_id))] }),
        staffNames(db, (data ?? []).map((m) => m.created_by)),
      ]);
      const byId = new Map(variants.map((v) => [v.variant_id, v]));
      return NextResponse.json({
        movements: (data ?? []).map((m) => ({
          ...m,
          title: byId.get(m.variant_id)?.title ?? "(deleted)",
          label: byId.get(m.variant_id)?.label ?? "",
          staff: m.created_by ? names.get(m.created_by) ?? "Staff" : "",
        })),
      });
    }

    let variants: VariantRow[];
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 300);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (ids.length) {
      variants = await loadVariants(db, { variantIds: ids });
    } else {
      const exact = q ? await loadVariants(db, { code: q }) : [];
      if (exact.length) {
        variants = exact;
      } else {
        let products = db.from("products").select("id").is("deleted_at", null).order("title").limit(q ? 40 : 400);
        if (q) products = products.ilike("title", `%${q.replace(/[%,()]/g, " ").trim()}%`);
        const { data, error } = await products;
        if (error) return bad(explainPosError(error.message), 500);
        variants = await loadVariants(db, { productIds: (data ?? []).map((p) => p.id) });
      }
    }

    const variantIds = variants.map((v) => v.variant_id);
    const [shelf, supplier, fallback] = await Promise.all([
      showroomId ? shelfStock(db, showroomId, variantIds) : Promise.resolve(new Map()),
      variantIds.length ? db.from("supplier_stock").select("variant_id, supplier_id, quantity, unit_cost").in("variant_id", variantIds).gt("quantity", 0) : Promise.resolve({ data: [], error: null }),
      numericSetting(db, "low_stock_threshold", 3),
    ]);
    if (supplier.error) return bad(explainPosError(supplier.error.message), 500);
    const atSupplier = new Map<string, { supplier_id: string; quantity: number }[]>();
    for (const s of supplier.data ?? []) {
      atSupplier.set(s.variant_id, [...(atSupplier.get(s.variant_id) ?? []), { supplier_id: s.supplier_id, quantity: s.quantity }]);
    }

    let rows = variants.map((v) => {
      const s = shelf.get(v.variant_id);
      const quantity = s?.quantity ?? 0;
      const threshold = v.low_stock_threshold ?? fallback;
      return {
        ...v,
        quantity,
        reserved: s?.reserved ?? 0,
        threshold,
        low: v.is_active && quantity - (s?.reserved ?? 0) <= threshold,
        suppliers: atSupplier.get(v.variant_id) ?? [],
      };
    });
    if (url.searchParams.get("low") === "1") rows = rows.filter((r) => r.low);
    rows.sort((a, b) => a.title.localeCompare(b.title) || a.label.localeCompare(b.label));

    return NextResponse.json({ rows, showrooms, showroom_id: showroomId, default_threshold: fallback });
  } catch (error) {
    return failed(error);
  }
}

function makeBarcode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100000000;
  return `AS${String(n).padStart(8, "0")}`;
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("inventory.manage");
    const db = getServiceSupabase();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const items = Array.isArray(b.items) ? (b.items.slice(0, 500) as Record<string, unknown>[]) : [];
    const note = typeof b.note === "string" ? b.note.slice(0, 500) : "";
    const showrooms = await listShowrooms(db);
    const showroomId = showrooms.find((s) => s.id === b.showroom_id)?.id ?? showrooms[0]?.id;

    switch (b.action) {
      case "receive": {
        const lines = items
          .map((i) => ({ variant_id: String(i.variant_id ?? ""), quantity: Math.floor(Number(i.quantity) || 0), unit_cost: i.unit_cost === "" || i.unit_cost === null || i.unit_cost === undefined ? "" : String(Number(i.unit_cost)) }))
          .filter((i) => i.variant_id && i.quantity > 0);
        if (!lines.length) return bad("Add at least one item with a quantity");
        if (lines.some((l) => l.unit_cost === "NaN")) return bad("A buying price is not valid");
        const { data, error } = await db.rpc("inventory_receive", {
          p: { actor: user.id, showroom_id: showroomId, supplier_id: typeof b.supplier_id === "string" ? b.supplier_id : "", reference: typeof b.reference === "string" ? b.reference.slice(0, 80) : "", note, items: lines },
        });
        if (error) return bad(explainPosError(error.message), 400);
        return NextResponse.json({ ok: true, receipt_id: data });
      }

      case "adjust": {
        const lines = items
          .map((i) => ({ variant_id: String(i.variant_id ?? ""), counted: Math.floor(Number(i.counted)) }))
          .filter((i) => i.variant_id && Number.isFinite(i.counted) && i.counted >= 0);
        if (!lines.length) return bad("Enter what you counted");
        if (b.reason !== "count" && !note.trim()) return bad("Write a short note about what happened");
        const { data, error } = await db.rpc("inventory_adjust", { p: { actor: user.id, showroom_id: showroomId, reason: String(b.reason ?? "count"), note, items: lines } });
        if (error) return bad(explainPosError(error.message), 400);
        return NextResponse.json({ ok: true, changed: data });
      }

      case "transfer": {
        const { error } = await db.rpc("inventory_transfer", {
          p_variant_id: String(b.variant_id ?? ""),
          p_from: String(b.from ?? ""),
          p_to: String(b.to ?? ""),
          p_quantity: Math.floor(Number(b.quantity) || 0),
          p_actor: user.id,
          p_note: note,
        });
        if (error) return bad(explainPosError(error.message), 400);
        return NextResponse.json({ ok: true });
      }

      // Give a barcode to every chosen variant that has none.
      case "barcodes": {
        const ids = (Array.isArray(b.variant_ids) ? b.variant_ids : []).map(String).slice(0, 500);
        if (!ids.length) return bad("Choose at least one item");
        const { data: missing, error } = await db.from("product_variants").select("id").in("id", ids).is("barcode", null);
        if (error) return bad(explainPosError(error.message), 500);
        let made = 0;
        for (const v of missing ?? []) {
          for (let attempt = 0; attempt < 5; attempt++) {
            const { error: e } = await db.from("product_variants").update({ barcode: makeBarcode() }).eq("id", v.id).is("barcode", null);
            if (!e) {
              made++;
              break;
            }
          }
        }
        return NextResponse.json({ ok: true, made });
      }

      case "threshold": {
        const value = b.value === "" || b.value === null ? null : Math.floor(Number(b.value));
        if (value !== null && (!Number.isFinite(value) || value < 0)) return bad("Enter a number");
        const { error } = await db.from("product_variants").update({ low_stock_threshold: value }).eq("id", String(b.variant_id ?? ""));
        if (error) return bad(explainPosError(error.message), 500);
        return NextResponse.json({ ok: true });
      }

      default:
        return bad("Unknown action");
    }
  } catch (error) {
    return failed(error);
  }
}
