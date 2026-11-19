import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { bad, failed } from "@/lib/pos/http";
import { WASTAGE_REASONS } from "@/lib/custom-jersey/fabric-stock";
import {
  COLLARS, EXTRA_COST_KINDS, GARMENT_RATES_KEY, PRINT_BASES, SLEEVES, parseGarmentRates,
  type BatchDetail, type BatchMaterial, type BatchOrderOption,
} from "@/lib/custom-jersey/production";

/**
 * Production batches: print + stitching runs for custom jerseys, and what each jersey cost to make
 * (migration 20261118150000).
 *
 * GET               batches (newest first) with totals, suppliers, garments rate card
 * GET ?id=          + that batch in full, orders that can go in, fabrics and accessories with stock
 * POST { action: "save", id?, title?, note?, print_supplier_id?, print_basis, print_qty?, print_rate?, print_cost?,
 *        garments_supplier_id?, lines: [...], costs: [...] }                     create / update an open batch
 *      { action: "use", batch_id, material: fabric|accessory, item_id, kind: used|wastage, reason?,
 *        kg? | qty?, pieces?, custom_order_id?, note? }                         take material out of stock
 *      { action: "void_material", id, material, reason }                       give it back (entry kept, struck out)
 *      { action: "status", id, status: open|done|void, reason? }
 *      { action: "rates", rates: { short_round, ..., shorts } }                 the garments rate card
 */

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const MIGRATION = "Production costing is not set up yet: the migration 20261118150000_production_costing.sql has not been applied.";
const explain = (m: string) =>
  /^not_enough_stock:/.test(m.trim())
    ? `Not enough in stock: only ${m.trim().split(":")[1]} left. Buy or correct the count first.`
    : /production_|accessor(y|ies)_|custom_accessories|batch_id/.test(m) && /does not exist|schema cache|Could not find/i.test(m) ? MIGRATION : m;

const SQL_ERRORS: Record<string, string> = {
  batch_not_found: "Batch not found",
  batch_not_open: "This batch is closed. Reopen it to change it.",
  batch_void: "This batch was voided",
  batch_empty: "Add the jerseys first",
  reason_required: "Write why",
  invalid_print_basis: "Choose how printing is charged",
  invalid_amount: "Check the amounts",
  invalid_pieces: "Each line needs pieces",
  invalid_kg: "Enter how many kg",
  invalid_qty: "Enter how many pieces",
  invalid_kind: "Choose used or wastage",
  invalid_material: "Choose fabric or accessory",
  invalid_status: "Unknown status",
  order_not_found: "Custom order not found",
  fabric_not_found: "Fabric not found",
  accessory_not_found: "Accessory not found",
  supplier_not_found: "Supplier not found",
};
const sqlError = (m: string) => SQL_ERRORS[m.trim()] ?? explain(m);

/** Orders in these stages can be put into a batch. */
const BATCH_STAGES = ["approved", "queued", "cutting", "printing", "sewing", "qc", "ready"];

type Db = ReturnType<typeof getServiceSupabase>;

async function loadRates(db: Db) {
  const { data } = await db.from("app_settings").select("value").eq("key", GARMENT_RATES_KEY).maybeSingle();
  return parseGarmentRates(data?.value ?? null);
}

async function loadDetail(db: Db, id: string): Promise<BatchDetail | null> {
  const [batch, lines, costs, totals, lineCosts, fabricMoves, accMoves] = await Promise.all([
    db.from("production_batches").select("*").eq("id", id).maybeSingle(),
    db.from("production_batch_lines").select("id, custom_order_id, label, pieces, sleeve, collar, shorts, garment_rate, shorts_rate").eq("batch_id", id).order("position"),
    db.from("production_costs").select("kind, amount, note").eq("batch_id", id).order("position"),
    db.from("production_batch_totals").select("*").eq("batch_id", id).maybeSingle(),
    db.from("production_line_costs").select("*").eq("batch_id", id),
    db.from("fabric_moves").select("id, fabric_id, kind, reason, kg, pieces, total_cost, custom_order_id, note, created_at, voided_at").eq("batch_id", id).order("created_at"),
    db.from("accessory_moves").select("id, accessory_id, kind, reason, qty, total_cost, custom_order_id, note, created_at, voided_at").eq("batch_id", id).order("created_at"),
  ]);
  const err = batch.error ?? lines.error ?? costs.error ?? totals.error ?? lineCosts.error ?? fabricMoves.error ?? accMoves.error;
  if (err) throw new Error(explain(err.message));
  if (!batch.data) return null;

  const orderIds = [
    ...new Set([
      ...(lines.data ?? []).map((l) => l.custom_order_id),
      ...(fabricMoves.data ?? []).map((m) => m.custom_order_id),
      ...(accMoves.data ?? []).map((m) => m.custom_order_id),
    ].filter(Boolean)),
  ] as string[];
  const fabricIds = [...new Set((fabricMoves.data ?? []).map((m) => m.fabric_id))];
  const accIds = [...new Set((accMoves.data ?? []).map((m) => m.accessory_id))];
  const [orders, fabrics, accs] = await Promise.all([
    orderIds.length
      ? db.from("custom_orders").select("id, order_number, customer_name, quantity, final_price, estimated_price").in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; order_number: string; customer_name: string; quantity: number; final_price: number | null; estimated_price: number }[] }),
    fabricIds.length ? db.from("custom_fabrics").select("id, name_en").in("id", fabricIds) : Promise.resolve({ data: [] as { id: string; name_en: string }[] }),
    accIds.length ? db.from("custom_accessories").select("id, name_en").in("id", accIds) : Promise.resolve({ data: [] as { id: string; name_en: string }[] }),
  ]);
  const orderMap = new Map((orders.data ?? []).map((o) => [o.id, o]));
  const fabricName = new Map((fabrics.data ?? []).map((f) => [f.id, f.name_en]));
  const accName = new Map((accs.data ?? []).map((a) => [a.id, a.name_en]));
  const orderNo = (oid: string | null) => (oid ? orderMap.get(oid)?.order_number ?? null : null);

  const materials: BatchMaterial[] = [
    ...(fabricMoves.data ?? []).map((m) => ({
      id: m.id, material: "fabric" as const, item_id: m.fabric_id, name: fabricName.get(m.fabric_id) ?? "—",
      kind: m.kind as "used" | "wastage", reason: m.reason, amount: -Number(m.kg), pieces: m.pieces,
      total_cost: m.total_cost === null ? null : Number(m.total_cost), order_number: orderNo(m.custom_order_id),
      note: m.note, created_at: m.created_at, voided_at: m.voided_at,
    })),
    ...(accMoves.data ?? []).map((m) => ({
      id: m.id, material: "accessory" as const, item_id: m.accessory_id, name: accName.get(m.accessory_id) ?? "—",
      kind: m.kind as "used" | "wastage", reason: m.reason, amount: -Number(m.qty), pieces: null,
      total_cost: m.total_cost === null ? null : Number(m.total_cost), order_number: orderNo(m.custom_order_id),
      note: m.note, created_at: m.created_at, voided_at: m.voided_at,
    })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const order_prices: BatchDetail["order_prices"] = {};
  for (const o of orders.data ?? []) {
    const final = o.final_price !== null && o.final_price !== undefined;
    order_prices[o.id] = { price: Number(final ? o.final_price : o.estimated_price) || 0, quantity: o.quantity, final };
  }

  const b = batch.data;
  return {
    id: b.id,
    batch_number: b.batch_number,
    title: b.title,
    note: b.note,
    status: b.status,
    print_supplier_id: b.print_supplier_id,
    print_basis: b.print_basis,
    print_qty: b.print_qty === null ? null : Number(b.print_qty),
    print_rate: b.print_rate === null ? null : Number(b.print_rate),
    print_cost: Number(b.print_cost),
    garments_supplier_id: b.garments_supplier_id,
    created_at: b.created_at,
    done_at: b.done_at,
    void_reason: b.void_reason,
    lines: (lines.data ?? []).map((l) => ({
      ...l,
      order_number: orderNo(l.custom_order_id),
      customer_name: l.custom_order_id ? orderMap.get(l.custom_order_id)?.customer_name ?? null : null,
      garment_rate: Number(l.garment_rate),
      shorts_rate: Number(l.shorts_rate),
    })),
    costs: (costs.data ?? []).map((c) => ({ ...c, amount: Number(c.amount) })),
    materials,
    line_costs: (lineCosts.data ?? []).map((c) => ({
      line_id: c.line_id, custom_order_id: c.custom_order_id, pieces: c.pieces,
      garment_cost: Number(c.garment_cost), direct_cost: Number(c.direct_cost), shared_cost: Number(c.shared_cost),
      total_cost: Number(c.total_cost), cost_per_piece: Number(c.cost_per_piece),
    })),
    totals: totals.data,
    order_prices,
  };
}

async function loadOrderOptions(db: Db, batchId: string): Promise<BatchOrderOption[]> {
  const { data: orders, error } = await db
    .from("custom_orders")
    .select("id, order_number, customer_name, status, quantity, sleeve, collar, with_shorts, with_names, with_numbers, with_logo, fabric_id, fabric_name, created_at")
    .in("status", BATCH_STAGES)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const ids = (orders ?? []).map((o) => o.id);
  const inBatches = new Map<string, number>();
  if (ids.length) {
    const { data: lines, error: lErr } = await db
      .from("production_batch_lines")
      .select("custom_order_id, pieces, batch_id, production_batches!inner(status)")
      .in("custom_order_id", ids)
      .neq("batch_id", batchId)
      .neq("production_batches.status", "void");
    if (lErr) throw new Error(explain(lErr.message));
    for (const l of lines ?? []) if (l.custom_order_id) inBatches.set(l.custom_order_id, (inBatches.get(l.custom_order_id) ?? 0) + l.pieces);
  }
  return (orders ?? []).map((o) => ({
    id: o.id, order_number: o.order_number, customer_name: o.customer_name, status: o.status, quantity: o.quantity,
    sleeve: o.sleeve, collar: o.collar, with_shorts: o.with_shorts, with_names: o.with_names, with_numbers: o.with_numbers,
    with_logo: o.with_logo, fabric_id: o.fabric_id, fabric_name: o.fabric_name, in_batches: inBatches.get(o.id) ?? 0,
  }));
}

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(user);
    const id = new URL(request.url).searchParams.get("id");

    const [batches, totals, suppliers, rates] = await Promise.all([
      db.from("production_batches").select("id, batch_number, title, status, created_at, done_at").order("created_at", { ascending: false }).limit(100),
      db.from("production_batch_totals").select("*"),
      // "*": categories come with 20261119120000.
      db.from("suppliers").select("*").eq("is_active", true).order("name"),
      loadRates(db),
    ]);
    const err = batches.error ?? totals.error ?? suppliers.error;
    if (err) return bad(explain(err.message), 503);

    const batchIds = (batches.data ?? []).map((b) => b.id);
    const { data: lineOrders } = batchIds.length
      ? await db.from("production_batch_lines").select("batch_id, custom_orders(order_number)").in("batch_id", batchIds)
      : { data: [] };
    const ordersBy = new Map<string, string[]>();
    for (const l of (lineOrders ?? []) as unknown as { batch_id: string; custom_orders: { order_number: string } | null }[]) {
      if (!l.custom_orders) continue;
      const list = ordersBy.get(l.batch_id) ?? [];
      if (!list.includes(l.custom_orders.order_number)) list.push(l.custom_orders.order_number);
      ordersBy.set(l.batch_id, list);
    }
    const totalsBy = new Map((totals.data ?? []).map((t) => [t.batch_id, t]));
    const out: Record<string, unknown> = {
      batches: (batches.data ?? []).map((b) => ({ ...b, orders: ordersBy.get(b.id) ?? [], totals: totalsBy.get(b.id) ?? null })),
      suppliers: suppliers.data ?? [],
      rates,
    };

    if (id) {
      const [detail, orders, fabrics, fabricStock, accs, accStock] = await Promise.all([
        loadDetail(db, id),
        loadOrderOptions(db, id),
        db.from("custom_fabrics").select("id, name_en, name_bn, kg_per_piece, is_active").order("display_order"),
        db.from("fabric_stock").select("fabric_id, on_hand_kg, avg_cost_per_kg"),
        db.from("custom_accessories").select("id, name_en, name_bn, kind, per_jersey, is_active").order("display_order").order("name_en"),
        db.from("accessory_stock").select("accessory_id, on_hand, avg_cost"),
      ]);
      if (!detail) return bad("Batch not found", 404);
      const fs = new Map((fabricStock.data ?? []).map((s) => [s.fabric_id, s]));
      const as = new Map((accStock.data ?? []).map((s) => [s.accessory_id, s]));
      out.batch = detail;
      out.orders = orders;
      out.fabrics = (fabrics.data ?? []).map((f) => ({ ...f, on_hand: Number(fs.get(f.id)?.on_hand_kg ?? 0), avg_cost: fs.get(f.id)?.avg_cost_per_kg ?? null }));
      out.accessories = (accs.data ?? []).map((a) => ({ ...a, on_hand: Number(as.get(a.id)?.on_hand ?? 0), avg_cost: as.get(a.id)?.avg_cost ?? null }));
    }
    return NextResponse.json(out);
  } catch (error) {
    if (error instanceof Error && error.message === MIGRATION) return bad(MIGRATION, 503);
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("inventory.manage");
    const db = getServiceSupabase(user);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (b.action === "save") {
      const lines = Array.isArray(b.lines) ? (b.lines as Record<string, unknown>[]).slice(0, 200) : [];
      const costs = Array.isArray(b.costs) ? (b.costs as Record<string, unknown>[]).slice(0, 50) : [];
      for (const l of lines) if (!(Math.floor(num(l.pieces)) > 0)) return bad("Each line needs pieces");
      for (const c of costs) if (Number.isFinite(num(c.amount)) && num(c.amount) < 0) return bad("Costs can't be negative");
      const p = {
        actor: user.id,
        id: text(b.id, 64) || null,
        title: text(b.title, 120),
        note: text(b.note, 500),
        print_supplier_id: text(b.print_supplier_id, 64) || null,
        print_basis: PRINT_BASES.find((x) => x === b.print_basis) ?? "kg",
        print_qty: Number.isFinite(num(b.print_qty)) ? num(b.print_qty) : null,
        print_rate: Number.isFinite(num(b.print_rate)) ? num(b.print_rate) : null,
        print_cost: Number.isFinite(num(b.print_cost)) ? num(b.print_cost) : 0,
        garments_supplier_id: text(b.garments_supplier_id, 64) || null,
        lines: lines.map((l) => ({
          custom_order_id: text(l.custom_order_id, 64) || null,
          label: text(l.label, 80) || null,
          pieces: Math.floor(num(l.pieces)),
          sleeve: SLEEVES.find((s) => s === l.sleeve) ?? "short",
          collar: COLLARS.find((c) => c === l.collar) ?? "round",
          shorts: Math.max(0, Math.floor(num(l.shorts)) || 0),
          garment_rate: Math.max(0, num(l.garment_rate) || 0),
          shorts_rate: Math.max(0, num(l.shorts_rate) || 0),
        })),
        costs: costs
          .filter((c) => num(c.amount) > 0)
          .map((c) => ({ kind: EXTRA_COST_KINDS.find((k) => k === c.kind) ?? "other", amount: num(c.amount), note: text(c.note, 200) || null })),
      };
      const { data, error } = await db.rpc("production_batch_save", { p });
      if (error) return bad(sqlError(error.message), 400);
      return NextResponse.json({ id: data });
    }

    if (b.action === "use") {
      const material = b.material === "accessory" ? "accessory" : b.material === "fabric" ? "fabric" : null;
      if (!material) return bad("Choose fabric or accessory");
      const kind = b.kind === "wastage" ? "wastage" : "used";
      const pieces = Math.floor(num(b.pieces));
      const p = {
        actor: user.id,
        batch_id: text(b.batch_id, 64),
        material,
        item_id: text(b.item_id, 64),
        kind,
        reason: kind === "wastage" ? WASTAGE_REASONS.find((r) => r === b.reason) ?? "other" : null,
        kg: material === "fabric" ? num(b.kg) : null,
        qty: material === "accessory" ? Math.floor(num(b.qty)) : null,
        pieces: material === "fabric" && pieces > 0 ? pieces : null,
        custom_order_id: text(b.custom_order_id, 64) || null,
        note: text(b.note, 300) || null,
      };
      if (material === "fabric" && !(Number(p.kg) > 0)) return bad("Enter how many kg");
      if (material === "accessory" && !(Number(p.qty) > 0)) return bad("Enter how many pieces");
      const { data, error } = await db.rpc("production_use", { p });
      if (error) return bad(sqlError(error.message), 400);
      return NextResponse.json({ id: data });
    }

    if (b.action === "void_material") {
      const id = text(b.id, 64);
      const reason = text(b.reason, 300);
      if (!id) return bad("Entry not found");
      if (!reason) return bad("Write why you are undoing it");
      const table = b.material === "accessory" ? "accessory_moves" : "fabric_moves";
      const { data: row } = await db.from(table).select("batch_id").eq("id", id).maybeSingle();
      if (row?.batch_id) {
        const { data: batch } = await db.from("production_batches").select("status").eq("id", row.batch_id).maybeSingle();
        if (batch && batch.status !== "open") return bad(SQL_ERRORS.batch_not_open);
      }
      const { data, error } = await db
        .from(table)
        .update({ voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason })
        .eq("id", id)
        .is("voided_at", null)
        .select("id");
      if (error) return bad(explain(error.message), 500);
      if (!data?.length) return bad("That entry was already undone");
      return NextResponse.json({ ok: true });
    }

    if (b.action === "status") {
      const status = ["open", "done", "void"].find((s) => s === b.status);
      if (!status) return bad("Unknown status");
      const { error } = await db.rpc("production_batch_status", { p: { actor: user.id, id: text(b.id, 64), status, reason: text(b.reason, 300) || null } });
      if (error) return bad(sqlError(error.message), 400);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "rates") {
      const rates = parseGarmentRates(b.rates ?? null);
      const { error } = await db
        .from("app_settings")
        .upsert({ key: GARMENT_RATES_KEY, value: JSON.stringify(rates), updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ rates });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}
