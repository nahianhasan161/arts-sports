import { NextResponse } from "next/server";
import { normalizeFabricTiers } from "@/lib/custom-jersey/pricing";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { bad, failed } from "@/lib/pos/http";
import { SUPPLIER_PAY_METHODS } from "@/lib/pos/purchase-types";
import { WASTAGE_REASONS } from "@/lib/custom-jersey/fabric-stock";

/**
 * Fabric stock: the raw material for custom jerseys, in kg (migration 20261118140000).
 *
 * GET  ?fabric_id=   fabrics with their stock, suppliers, and recent entries (all, or one fabric)
 * POST { action: "purchase", fabric_id, supplier_id?, kg, cost_per_kg, extra_cost?, note?, paid?, method?, pay_reference?, from_drawer? }
 *      { action: "used", fabric_id, pieces, kg?, order_number?, note? }       kg defaults to pieces x kg_per_piece
 *      { action: "wastage", fabric_id, reason, pieces?, kg?, note? }          one of pieces / kg needed
 *      { action: "adjust", fabric_id, kg (+/-), note }                         a count correction
 *      { action: "settings", fabric_id, kg_per_piece, low_stock_kg }
 *      { action: "fabric", id?, name_en, name_bn?, price_per_piece?, price_tiers?: [{min, price}], is_active?, kg_per_piece?, low_stock_kg? }   add / edit a fabric
 *      { action: "delete_fabric", id }                                         only when it has no stock entries
 *      { action: "void", id, reason }                                          undo an entry (kept, struck out)
 */

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const MIGRATION = "Fabric stock is not set up yet: the migration 20261118140000_fabric_stock.sql has not been applied.";
const explain = (m: string) => (/fabric_(moves|stock|purchase)|kg_per_piece|low_stock_kg/.test(m) && /does not exist|schema cache|Could not find/i.test(m) ? MIGRATION : m);

const SQL_ERRORS: Record<string, string> = {
  fabric_not_found: "Fabric not found",
  invalid_kg: "Enter how many kg",
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
    const fabricId = new URL(request.url).searchParams.get("fabric_id");
    let movesQ = db
      .from("fabric_moves")
      .select("id, fabric_id, kind, reason, kg, pieces, cost_per_kg, total_cost, supplier_id, custom_order_id, note, created_by, created_at, voided_at, void_reason")
      .order("created_at", { ascending: false })
      .limit(200);
    if (fabricId) movesQ = movesQ.eq("fabric_id", fabricId);
    const [fabrics, stock, suppliers, moves] = await Promise.all([
      db.from("custom_fabrics").select("id, name_en, name_bn, image_url, is_active, price_per_piece, price_tiers, kg_per_piece, low_stock_kg, display_order").order("display_order"),
      db.from("fabric_stock").select("*"),
      db.from("suppliers").select("id, name, phone").eq("is_active", true).order("name"),
      movesQ,
    ]);
    const err = fabrics.error ?? stock.error ?? suppliers.error ?? moves.error;
    if (err) return bad(explain(err.message), 503);

    const orderIds = [...new Set((moves.data ?? []).map((m) => m.custom_order_id).filter(Boolean))] as string[];
    const staffIds = [...new Set((moves.data ?? []).map((m) => m.created_by).filter(Boolean))] as string[];
    const [orders, staff] = await Promise.all([
      orderIds.length ? db.from("custom_orders").select("id, order_number").in("id", orderIds) : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
      staffIds.length ? db.from("profiles").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ]);
    const orderNo = new Map((orders.data ?? []).map((o) => [o.id, o.order_number]));
    const staffName = new Map((staff.data ?? []).map((s) => [s.id, s.full_name]));
    const byFabric = new Map((stock.data ?? []).map((s) => [s.fabric_id, s]));

    return NextResponse.json({
      fabrics: (fabrics.data ?? []).map((f) => ({ ...f, stock: byFabric.get(f.id) ?? null })),
      suppliers: suppliers.data ?? [],
      moves: (moves.data ?? []).map((m) => ({ ...m, order_number: m.custom_order_id ? orderNo.get(m.custom_order_id) ?? null : null, staff: m.created_by ? staffName.get(m.created_by) ?? null : null })),
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
    const fabricId = text(b.fabric_id, 64);
    const note = text(b.note, 300) || null;

    if (b.action === "void") {
      const id = text(b.id, 64);
      const reason = text(b.reason, 300);
      if (!id) return bad("Entry not found");
      if (!reason) return bad("Write why you are undoing it");
      const { data, error } = await db
        .from("fabric_moves")
        .update({ voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason })
        .eq("id", id)
        .is("voided_at", null)
        .select("id");
      if (error) return bad(explain(error.message), 500);
      if (!data?.length) return bad("That entry was already undone");
      return NextResponse.json({ ok: true });
    }

    if (b.action === "fabric") {
      const id = text(b.id, 64);
      const name = text(b.name_en, 80);
      if (!name) return bad("Write the fabric name (English)");
      const price = num(b.price_per_piece);
      if (Number.isFinite(price) && price < 0) return bad("Price per piece looks wrong");
      const kgPer = num(b.kg_per_piece);
      if (Number.isFinite(kgPer) && (kgPer < 0 || kgPer > 10)) return bad("Fabric per piece looks wrong (kg)");
      const low = num(b.low_stock_kg);
      const row: Record<string, unknown> = {
        name_en: name,
        name_bn: text(b.name_bn, 80) || null,
        // The customer form shows only fabrics that are on; a stock-only fabric can stay off with price 0.
        price_per_piece: Number.isFinite(price) ? price : 0,
        // From `min` pieces the price per piece is `price`; below the first tier it is price_per_piece.
        price_tiers: normalizeFabricTiers(b.price_tiers),
        is_active: b.is_active !== false,
        kg_per_piece: Number.isFinite(kgPer) ? kgPer : null,
        low_stock_kg: Number.isFinite(low) && low >= 0 ? low : null,
        updated_at: new Date().toISOString(),
      };
      if (!id) {
        const { data: last } = await db.from("custom_fabrics").select("display_order").order("display_order", { ascending: false }).limit(1).maybeSingle();
        row.display_order = (last?.display_order ?? 0) + 10;
        row.slug = `${slugify(name) || "fabric"}-${crypto.randomUUID().slice(0, 4)}`;
      }
      const { data, error } = id
        ? await db.from("custom_fabrics").update(row).eq("id", id).select("id").maybeSingle()
        : await db.from("custom_fabrics").insert(row).select("id").single();
      if (error) return bad(explain(error.message), 500);
      if (!data) return bad("Fabric not found", 404);
      return NextResponse.json({ id: data.id });
    }

    if (b.action === "delete_fabric") {
      const id = text(b.id, 64);
      if (!id) return bad("Fabric not found");
      // Deleting would also delete its stock entries (and the supplier due they make), so only empty fabrics go.
      const { count, error: cErr } = await db.from("fabric_moves").select("id", { count: "exact", head: true }).eq("fabric_id", id);
      if (cErr) return bad(explain(cErr.message), 500);
      if (count) return bad("This fabric has stock entries, so it can't be deleted. Turn off “show to customers” instead.", 409);
      const { error } = await db.from("custom_fabrics").delete().eq("id", id);
      if (error) return bad(error.code === "23503" ? "This fabric is used elsewhere, so it can't be deleted. Turn it off instead." : explain(error.message), 409);
      return NextResponse.json({ ok: true });
    }

    if (!fabricId) return bad("Choose a fabric");
    const { data: fabric, error: fErr } = await db.from("custom_fabrics").select("id, kg_per_piece").eq("id", fabricId).maybeSingle();
    if (fErr) return bad(explain(fErr.message), 500);
    if (!fabric) return bad("Fabric not found", 404);
    const perPiece = fabric.kg_per_piece === null ? NaN : Number(fabric.kg_per_piece);

    if (b.action === "settings") {
      const kgPer = num(b.kg_per_piece);
      const low = num(b.low_stock_kg);
      if (Number.isFinite(kgPer) && (kgPer < 0 || kgPer > 10)) return bad("Fabric per piece looks wrong (kg)");
      const { error } = await db
        .from("custom_fabrics")
        .update({ kg_per_piece: Number.isFinite(kgPer) ? kgPer : null, low_stock_kg: Number.isFinite(low) && low >= 0 ? low : null })
        .eq("id", fabricId);
      if (error) return bad(explain(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "purchase") {
      const kg = num(b.kg);
      const rate = num(b.cost_per_kg);
      if (!(kg > 0)) return bad("Enter how many kg");
      if (!(rate >= 0)) return bad("Enter the price per kg");
      const { data, error } = await db.rpc("fabric_purchase", {
        p: {
          actor: user.id,
          fabric_id: fabricId,
          supplier_id: text(b.supplier_id, 64) || null,
          kg,
          cost_per_kg: rate,
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

    const pieces = Math.floor(num(b.pieces));
    const kgIn = num(b.kg);
    const hasPieces = Number.isFinite(pieces) && pieces > 0;
    // Kg typed by staff wins; else pieces x fabric per piece.
    const kg = kgIn > 0 ? kgIn : hasPieces && perPiece > 0 ? Math.round(pieces * perPiece * 1000) / 1000 : NaN;

    if (b.action === "used" || b.action === "wastage") {
      if (!(kg > 0)) return bad(hasPieces ? "Set “fabric per piece” for this fabric first, or type the kg" : "Enter pieces or kg");
      const row: Record<string, unknown> = { fabric_id: fabricId, kind: b.action, kg: -kg, pieces: hasPieces ? pieces : null, note, created_by: user.id };
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
      const { error } = await db.from("fabric_moves").insert(row);
      if (error) return bad(explain(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "adjust") {
      const delta = num(b.kg);
      if (!Number.isFinite(delta) || delta === 0) return bad("Enter the kg to add (+) or take off (−)");
      if (!note) return bad("Write why you are correcting the count");
      const { error } = await db.from("fabric_moves").insert({ fabric_id: fabricId, kind: "adjust", kg: delta, note, created_by: user.id });
      if (error) return bad(explain(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}
