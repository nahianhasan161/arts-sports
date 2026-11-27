import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dhakaDayKey, dhakaKeyStart } from "@/lib/admin/overview";
import { isMissingTable, type ExpensePlace, type ExpenseRow } from "@/lib/admin/expenses";
import { staffNames } from "@/lib/pos/server";

/**
 * The business report (owner's page, /admin/{online,offline}/reports):
 * sales, cost of goods, profit, spendings and supplier purchases for a range
 * of Bangladesh days, split by channel and by day / month / year.
 *
 * What counts as what:
 *  - Website: `orders` count as sold only once delivered (COD can still come back),
 *    by delivery date (`delivered_at`, else the order date). Orders made in the range
 *    but not delivered yet are only shown as a note (`notDelivered`); cancelled ones
 *    too (`cancelled`). Sales = total minus the
 *    delivery charge (that goes to the courier). Refunds = successful refunds on
 *    those orders (order_financials). Cost = qty × the product's buying price
 *    (`products.cost_price`, today's value: order lines do not store it); a refund
 *    takes the same share off the cost, as the goods come back.
 *  - Shop: `pos_sales` by bill date. Refunds = refunded_total. Cost = buying price
 *    stored on the bill line (else today's product price) × pieces not returned.
 *  - Custom jersey: `custom_orders` from "approved" on (approved, in production,
 *    ready, delivered), by approval date. Sales = final price (else the estimate),
 *    delivery not included. Cost = making cost from production batches
 *    (`production_line_costs`); orders not in a batch yet have no cost.
 *    channel 'shop' = made at the counter, the rest = online.
 *  - Spendings: `expenses` (not voided). Missing table = `ready: false`.
 *  - Suppliers: goods purchases (invoice date), fabric (purchase day), accessories,
 *    print shop + garments charges of production batches (batch date), payments to
 *    suppliers, and today's due (`supplier_balances`).
 *
 * Reads are paged (1000 rows a call). Fine for an alpha shop; if a year gets
 * slow, move these sums into one SQL function.
 */

export type Group = "day" | "month" | "year";

export interface Money {
  /** orders / bills */
  count: number;
  sales: number;
  refunds: number;
  cost: number;
  /** pieces (or custom orders) with no buying / making price, so the profit is too high */
  missingCost: number;
  /** delivery charges (not part of sales) */
  delivery: number;
  /** money actually received for these sales */
  received: number;
}

export type Channel = "web" | "shop" | "customOnline" | "customShop";
export const CHANNELS: Channel[] = ["web", "shop", "customOnline", "customShop"];

export interface Slot {
  key: string;
  web: Money;
  shop: Money;
  customOnline: Money;
  customShop: Money;
  spent: Record<ExpensePlace, number>;
  /** shop counter: showroom id → sales, refunds, cost (custom jerseys have no shop) */
  shops: Record<string, { sales: number; refunds: number; cost: number }>;
  bought: number;
  paid: number;
}

export type PurchaseKind = "goods" | "fabric" | "accessory" | "print" | "garments";

export interface PurchaseRow {
  date: string;
  kind: PurchaseKind;
  supplier_id: string | null;
  supplier: string;
  ref: string;
  amount: number;
}

export interface SupplierPaymentRow {
  date: string;
  supplier_id: string;
  supplier: string;
  amount: number;
  method: string;
}

export interface ProductLine {
  key: string;
  title: string;
  web: { qty: number; sales: number; cost: number };
  shop: { qty: number; sales: number; cost: number };
}

export interface BusinessReport {
  from: string;
  to: string;
  group: Group;
  generated_at: string;
  slots: Slot[];
  totals: Record<Channel, Money>;
  branches: ({ id: string; name: string } & Money)[];
  cancelled: { count: number; amount: number };
  /** website orders made in the range, not delivered yet (not counted as sales) */
  notDelivered: { count: number; amount: number };
  expenses: { ready: boolean; rows: ExpenseRow[] };
  suppliers: {
    rows: { id: string; name: string; bought: number; paid: number; due: number }[];
    purchases: PurchaseRow[];
    payments: SupplierPaymentRow[];
    /** bought with no supplier picked (own stock entry with a cost) */
    unassigned: number;
    due_now: number;
  };
  products: ProductLine[];
  showrooms: { id: string; name: string; is_active?: boolean }[];
}

const CONFIRMED_CUSTOM = ["approved", "queued", "cutting", "printing", "sewing", "qc", "ready", "delivered"];
const PAGE = 1000;
const MAX_ROWS = 60_000;

const zero = (): Money => ({ count: 0, sales: 0, refunds: 0, cost: 0, missingCost: 0, delivery: 0, received: 0 });
const n = (v: unknown) => Number(v ?? 0) || 0;

type Err = { message: string; code?: string } | null;
type Page<T> = PromiseLike<{ data: T[] | null; error: Err }>;

/** Every row of a query, 1000 at a time. */
async function readAll<T>(make: (from: number, to: number) => Page<T>): Promise<{ rows: T[]; error: Err }> {
  const rows: T[] = [];
  for (let start = 0; start < MAX_ROWS; start += PAGE) {
    const { data, error } = await make(start, start + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

/** `.in()` in small pieces, so the URL stays short. */
async function inChunks<T>(ids: string[], make: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: Err }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await make(ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

function must<T>(res: { rows: T[]; error: Err }, what: string): T[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.rows;
}

const slotKey = (day: string, group: Group) => (group === "year" ? day.slice(0, 4) : group === "month" ? day.slice(0, 7) : day);

/** Days in the range, inclusive. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** day up to 62 days, month up to two years, then year. A day view over 400 days becomes months. */
export function pickGroup(from: string, to: string, asked?: string | null): Group {
  const days = daysBetween(from, to);
  if (asked === "year") return "year";
  if (asked === "month") return "month";
  if (asked === "day" && days <= 400) return "day";
  return days <= 62 ? "day" : days <= 730 ? "month" : "year";
}

export async function buildReport(db: SupabaseClient, from: string, to: string, group: Group): Promise<BusinessReport> {
  const startIso = dhakaKeyStart(from).toISOString();
  const endIso = new Date(dhakaKeyStart(to).getTime() + 86_400_000).toISOString();
  const inRange = (day: string) => day >= from && day <= to;

  // Empty slots, oldest first.
  const slots: Slot[] = [];
  const byKey = new Map<string, Slot>();
  for (let i = 0, days = daysBetween(from, to); i < days; i++) {
    const key = slotKey(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), group);
    if (byKey.has(key)) continue;
    const slot: Slot = { key, web: zero(), shop: zero(), customOnline: zero(), customShop: zero(), spent: { both: 0, online: 0, shop: 0 }, shops: {}, bought: 0, paid: 0 };
    slots.push(slot);
    byKey.set(key, slot);
  }
  const slotFor = (day: string) => byKey.get(slotKey(day, group));

  const totals: Record<Channel, Money> = { web: zero(), shop: zero(), customOnline: zero(), customShop: zero() };
  const add = (channel: Channel, day: string, m: Partial<Money>) => {
    const slot = slotFor(day);
    for (const target of [totals[channel], slot?.[channel]]) {
      if (!target) continue;
      for (const [k, v] of Object.entries(m) as [keyof Money, number][]) target[k] += v;
    }
  };

  type OrderRow = { id: string; status: string; total_amount: number; shipping_fee: number | null; created_at: string; delivered_at: string | null; order_items: { product_id: string | null; title: string; quantity: number; unit_price: number }[] | null };
  type MoneyRow = { order_id: string; amount_paid: number; amount_refunded: number };
  type SaleRow = { id: string; showroom_id: string; total: number; refunded_total: number; created_at: string; pos_sale_items: { product_id: string | null; title: string; quantity: number; returned_quantity: number; line_total: number; cost_price: number | null }[] | null };
  type CustomRow = { id: string; channel: string; status: string; final_price: number | null; estimated_price: number | null; delivery_charge: number | null; approved_at: string | null; created_at: string };
  type ExpenseDb = Omit<ExpenseRow, "by"> & { created_by: string | null };
  type ReceiptRow = { id: string; receipt_no: number | null; supplier_id: string | null; invoice_date: string | null; created_at: string; total_cost: number; discount: number; extra_cost: number; reference: string | null };
  type FabricRow = { id: string; supplier_id: string | null; total_cost: number | null; move_date: string | null; created_at: string; custom_fabrics: { name_en: string; name_bn: string | null } | null };
  type AccessoryRow = { id: string; supplier_id: string | null; total_cost: number | null; created_at: string; custom_accessories: { name_en: string; name_bn: string | null } | null };
  type BatchRow = { id: string; batch_number: string; print_supplier_id: string | null; print_cost: number; garments_supplier_id: string | null; created_at: string; production_batch_lines: { garment_cost: number }[] | null };
  type PayRow = { supplier_id: string; amount: number; method: string; created_at: string };

  const q = `"${startIso}"`;
  const qEnd = `"${endIso}"`;

  const [orders, sales, customs, expenseRes, receipts, fabric, accessories, batches, payments, suppliers, balances, showrooms] = await Promise.all([
    readAll<OrderRow>((a, b) =>
      db
        .from("orders")
        .select("id, status, total_amount, shipping_fee, created_at, delivered_at, order_items(product_id, title, quantity, unit_price)")
        .or(`and(created_at.gte.${q},created_at.lt.${qEnd}),and(delivered_at.gte.${q},delivered_at.lt.${qEnd})`)
        .order("created_at")
        .range(a, b) as unknown as Page<OrderRow>,
    ),
    readAll<SaleRow>((a, b) => db.from("pos_sales").select("id, showroom_id, total, refunded_total, created_at, pos_sale_items(product_id, title, quantity, returned_quantity, line_total, cost_price)").gte("created_at", startIso).lt("created_at", endIso).order("created_at").range(a, b) as unknown as Page<SaleRow>),
    readAll<CustomRow>((a, b) =>
      db
        .from("custom_orders")
        .select("id, channel, status, final_price, estimated_price, delivery_charge, approved_at, created_at")
        .in("status", CONFIRMED_CUSTOM)
        .or(`and(approved_at.gte.${q},approved_at.lt.${qEnd}),and(approved_at.is.null,created_at.gte.${q},created_at.lt.${qEnd})`)
        .order("created_at")
        .range(a, b) as unknown as Page<CustomRow>,
    ),
    readAll<ExpenseDb>((a, b) => db.from("expenses").select("id, spent_on, category, amount, method, place, showroom_id, note, created_by, created_at").is("voided_at", null).gte("spent_on", from).lte("spent_on", to).order("spent_on", { ascending: false }).order("created_at", { ascending: false }).range(a, b) as unknown as Page<ExpenseDb>),
    readAll<ReceiptRow>((a, b) =>
      db
        .from("stock_receipts")
        .select("id, receipt_no, supplier_id, invoice_date, created_at, total_cost, discount, extra_cost, reference")
        .or(`and(invoice_date.gte.${from},invoice_date.lte.${to}),and(invoice_date.is.null,created_at.gte.${q},created_at.lt.${qEnd})`)
        .order("created_at")
        .range(a, b) as unknown as Page<ReceiptRow>,
    ),
    readAll<FabricRow>((a, b) =>
      db
        .from("fabric_moves")
        .select("id, supplier_id, total_cost, move_date, created_at, custom_fabrics(name_en, name_bn)")
        .eq("kind", "purchase")
        .is("voided_at", null)
        .or(`and(move_date.gte.${from},move_date.lte.${to}),and(move_date.is.null,created_at.gte.${q},created_at.lt.${qEnd})`)
        .order("created_at")
        .range(a, b) as unknown as Page<FabricRow>,
    ),
    readAll<AccessoryRow>((a, b) => db.from("accessory_moves").select("id, supplier_id, total_cost, created_at, custom_accessories(name_en, name_bn)").eq("kind", "purchase").is("voided_at", null).gte("created_at", startIso).lt("created_at", endIso).order("created_at").range(a, b) as unknown as Page<AccessoryRow>),
    readAll<BatchRow>((a, b) => db.from("production_batches").select("id, batch_number, print_supplier_id, print_cost, garments_supplier_id, created_at, production_batch_lines(garment_cost)").neq("status", "void").gte("created_at", startIso).lt("created_at", endIso).order("created_at").range(a, b) as unknown as Page<BatchRow>),
    readAll<PayRow>((a, b) => db.from("supplier_payments").select("supplier_id, amount, method, created_at").is("voided_at", null).gte("created_at", startIso).lt("created_at", endIso).order("created_at").range(a, b) as unknown as Page<PayRow>),
    readAll<{ id: string; name: string }>((a, b) => db.from("suppliers").select("id, name").order("name").range(a, b) as unknown as Page<{ id: string; name: string }>),
    readAll<{ supplier_id: string; due: number }>((a, b) => db.from("supplier_balances").select("supplier_id, due").order("supplier_id").range(a, b) as unknown as Page<{ supplier_id: string; due: number }>),
    readAll<{ id: string; name: string; is_active: boolean }>((a, b) => db.from("showrooms").select("id, name, is_active").order("name").range(a, b) as unknown as Page<{ id: string; name: string; is_active: boolean }>),
  ]);

  // ---- Buying prices of every product sold ---------------------------
  const orderRows = must(orders, "orders");
  const saleRows = must(sales, "shop bills");
  const productIds = new Set<string>();
  for (const o of orderRows) if (o.status === "delivered") for (const i of o.order_items ?? []) if (i.product_id) productIds.add(i.product_id);
  for (const s of saleRows) for (const i of s.pos_sale_items ?? []) if (i.product_id) productIds.add(i.product_id);
  const costOf = new Map<string, number | null>();
  const productRows = await inChunks<{ id: string; cost_price: number | null }>([...productIds], (chunk) => db.from("products").select("id, cost_price").in("id", chunk) as unknown as PromiseLike<{ data: { id: string; cost_price: number | null }[] | null; error: Err }>);
  for (const p of productRows) costOf.set(p.id, p.cost_price === null || p.cost_price === undefined ? null : n(p.cost_price));

  const products = new Map<string, ProductLine>();
  const productLine = (id: string | null, title: string) => {
    const key = id ?? `t:${title}`;
    let line = products.get(key);
    if (!line) {
      line = { key, title, web: { qty: 0, sales: 0, cost: 0 }, shop: { qty: 0, sales: 0, cost: 0 } };
      products.set(key, line);
    }
    return line;
  };

  // ---- Website orders ------------------------------------------------
  const cancelled = { count: 0, amount: 0 };
  const notDelivered = { count: 0, amount: 0 };
  const delivered: OrderRow[] = [];
  for (const o of orderRows) {
    const madeInRange = inRange(dhakaDayKey(o.created_at));
    if (o.status === "delivered") {
      if (inRange(dhakaDayKey(o.delivered_at ?? o.created_at))) delivered.push(o);
    } else if (madeInRange) {
      const bucket = o.status === "cancelled" ? cancelled : notDelivered;
      bucket.count += 1;
      bucket.amount += n(o.total_amount);
    }
  }
  const moneyRows = await inChunks<MoneyRow>(
    delivered.map((o) => o.id),
    (chunk) => db.from("order_financials").select("order_id, amount_paid, amount_refunded").in("order_id", chunk) as unknown as PromiseLike<{ data: MoneyRow[] | null; error: Err }>,
  );
  const money = new Map(moneyRows.map((m) => [m.order_id, m]));
  for (const o of delivered) {
    const day = dhakaDayKey(o.delivered_at ?? o.created_at);
    const delivery = n(o.shipping_fee);
    const salesAmount = Math.max(0, n(o.total_amount) - delivery);
    const m = money.get(o.id);
    const refunds = Math.min(salesAmount, n(m?.amount_refunded));
    const kept = salesAmount > 0 ? 1 - refunds / salesAmount : 1;
    let cost = 0;
    let missing = 0;
    for (const i of o.order_items ?? []) {
      const unit = i.product_id ? costOf.get(i.product_id) : null;
      const qty = n(i.quantity);
      const lineCost = unit === null || unit === undefined ? 0 : unit * qty * kept;
      if (unit === null || unit === undefined) missing += qty;
      cost += lineCost;
      const line = productLine(i.product_id, i.title);
      line.web.qty += qty;
      line.web.sales += n(i.unit_price) * qty;
      line.web.cost += lineCost;
    }
    add("web", day, { count: 1, sales: salesAmount, refunds, cost, missingCost: missing, delivery, received: Math.max(0, n(m?.amount_paid) - n(m?.amount_refunded)) });
  }

  // ---- Shop bills ----------------------------------------------------
  const shopNames = must(showrooms, "branches");
  const branchMap = new Map<string, { id: string; name: string } & Money>();
  for (const s of saleRows) {
    const day = dhakaDayKey(s.created_at);
    let cost = 0;
    let missing = 0;
    for (const i of s.pos_sale_items ?? []) {
      const pieces = Math.max(0, n(i.quantity) - n(i.returned_quantity));
      const stored = i.cost_price === null || i.cost_price === undefined ? null : n(i.cost_price);
      const unit = stored ?? (i.product_id ? (costOf.get(i.product_id) ?? null) : null);
      if (unit === null) missing += pieces;
      const lineCost = (unit ?? 0) * pieces;
      cost += lineCost;
      const line = productLine(i.product_id, i.title);
      const share = n(i.quantity) > 0 ? pieces / n(i.quantity) : 0;
      line.shop.qty += pieces;
      line.shop.sales += n(i.line_total) * share;
      line.shop.cost += lineCost;
    }
    const m: Partial<Money> = { count: 1, sales: n(s.total), refunds: n(s.refunded_total), cost, missingCost: missing, received: n(s.total) - n(s.refunded_total) };
    add("shop", day, m);
    const slot = slotFor(day);
    if (slot) {
      const per = (slot.shops[s.showroom_id] ??= { sales: 0, refunds: 0, cost: 0 });
      per.sales += n(s.total);
      per.refunds += n(s.refunded_total);
      per.cost += cost;
    }
    let b = branchMap.get(s.showroom_id);
    if (!b) {
      b = { id: s.showroom_id, name: shopNames.find((r) => r.id === s.showroom_id)?.name ?? s.showroom_id, ...zero() };
      branchMap.set(s.showroom_id, b);
    }
    for (const [k, v] of Object.entries(m) as [keyof Money, number][]) b[k] += v;
  }

  // ---- Custom jerseys ------------------------------------------------
  const customRows = must(customs, "custom orders");
  const customIds = customRows.map((c) => c.id);
  const [customPays, customCosts] = await Promise.all([
    inChunks<{ custom_order_id: string; amount: number }>(customIds, (chunk) => db.from("custom_order_payments").select("custom_order_id, amount").eq("status", "successful").in("custom_order_id", chunk) as unknown as PromiseLike<{ data: { custom_order_id: string; amount: number }[] | null; error: Err }>),
    inChunks<{ custom_order_id: string; total_cost: number }>(customIds, (chunk) => db.from("production_line_costs").select("custom_order_id, total_cost").in("custom_order_id", chunk) as unknown as PromiseLike<{ data: { custom_order_id: string; total_cost: number }[] | null; error: Err }>),
  ]);
  const paidFor = new Map<string, number>();
  for (const p of customPays) paidFor.set(p.custom_order_id, (paidFor.get(p.custom_order_id) ?? 0) + n(p.amount));
  const madeFor = new Map<string, number>();
  for (const c of customCosts) madeFor.set(c.custom_order_id, (madeFor.get(c.custom_order_id) ?? 0) + n(c.total_cost));
  for (const c of customRows) {
    const day = dhakaDayKey(c.approved_at ?? c.created_at);
    if (!inRange(day)) continue;
    const cost = madeFor.get(c.id);
    add(c.channel === "shop" ? "customShop" : "customOnline", day, {
      count: 1,
      sales: n(c.final_price ?? c.estimated_price),
      cost: cost ?? 0,
      missingCost: cost === undefined ? 1 : 0,
      delivery: n(c.delivery_charge),
      received: paidFor.get(c.id) ?? 0,
    });
  }

  // ---- Spendings -----------------------------------------------------
  let expensesReady = true;
  let expenseRows: ExpenseRow[] = [];
  if (expenseRes.error) {
    if (!isMissingTable(expenseRes.error)) throw new Error(`spendings: ${expenseRes.error.message}`);
    expensesReady = false;
  } else {
    const names = await staffNames(db, expenseRes.rows.map((e) => e.created_by));
    expenseRows = expenseRes.rows.map(({ created_by, ...e }) => ({ ...e, amount: n(e.amount), by: (created_by && names.get(created_by)) || "" }));
    for (const e of expenseRows) {
      const slot = slotFor(e.spent_on);
      if (slot) slot.spent[e.place] += e.amount;
    }
  }

  // ---- Suppliers -----------------------------------------------------
  const supplierList = must(suppliers, "suppliers");
  const supplierName = new Map(supplierList.map((s) => [s.id, s.name]));
  const purchases: PurchaseRow[] = [];
  const addPurchase = (day: string, kind: PurchaseKind, supplierId: string | null, ref: string, amount: number) => {
    if (amount <= 0 || !inRange(day)) return;
    purchases.push({ date: day, kind, supplier_id: supplierId, supplier: supplierId ? (supplierName.get(supplierId) ?? "") : "", ref, amount });
    const slot = slotFor(day);
    if (slot) slot.bought += amount;
  };
  for (const r of must(receipts, "purchases")) addPurchase(r.invoice_date ?? dhakaDayKey(r.created_at), "goods", r.supplier_id, r.reference || (r.receipt_no ? `#${r.receipt_no}` : ""), n(r.total_cost) - n(r.discount) + n(r.extra_cost));
  for (const f of must(fabric, "fabric")) addPurchase(f.move_date ?? dhakaDayKey(f.created_at), "fabric", f.supplier_id, f.custom_fabrics?.name_en ?? "", n(f.total_cost));
  for (const a of must(accessories, "accessories")) addPurchase(dhakaDayKey(a.created_at), "accessory", a.supplier_id, a.custom_accessories?.name_en ?? "", n(a.total_cost));
  for (const b of must(batches, "production")) {
    const day = dhakaDayKey(b.created_at);
    if (b.print_supplier_id) addPurchase(day, "print", b.print_supplier_id, b.batch_number, n(b.print_cost));
    if (b.garments_supplier_id) addPurchase(day, "garments", b.garments_supplier_id, b.batch_number, (b.production_batch_lines ?? []).reduce((s, l) => s + n(l.garment_cost), 0));
  }
  purchases.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const paymentRows: SupplierPaymentRow[] = must(payments, "supplier payments").map((p) => ({ date: dhakaDayKey(p.created_at), supplier_id: p.supplier_id, supplier: supplierName.get(p.supplier_id) ?? "", amount: n(p.amount), method: p.method }));
  for (const p of paymentRows) {
    const slot = slotFor(p.date);
    if (slot) slot.paid += p.amount;
  }
  paymentRows.reverse();

  const dueOf = new Map(must(balances, "supplier balances").map((b) => [b.supplier_id, n(b.due)]));
  const perSupplier = new Map<string, { id: string; name: string; bought: number; paid: number; due: number }>();
  const supplierRow = (id: string) => {
    let row = perSupplier.get(id);
    if (!row) {
      row = { id, name: supplierName.get(id) ?? id, bought: 0, paid: 0, due: dueOf.get(id) ?? 0 };
      perSupplier.set(id, row);
    }
    return row;
  };
  let unassigned = 0;
  for (const p of purchases) {
    if (p.supplier_id) supplierRow(p.supplier_id).bought += p.amount;
    else unassigned += p.amount;
  }
  for (const p of paymentRows) supplierRow(p.supplier_id).paid += p.amount;
  // Suppliers we still owe show up even when nothing happened in the range.
  for (const [id, due] of dueOf) if (Math.abs(due) >= 0.5) supplierRow(id);

  return {
    from,
    to,
    group,
    generated_at: new Date().toISOString(),
    slots,
    totals,
    branches: [...branchMap.values()].sort((a, b) => b.sales - a.sales),
    cancelled,
    notDelivered,
    expenses: { ready: expensesReady, rows: expenseRows },
    suppliers: {
      rows: [...perSupplier.values()].sort((a, b) => b.bought - a.bought || b.due - a.due),
      purchases,
      payments: paymentRows,
      unassigned,
      due_now: [...dueOf.values()].reduce((s, d) => s + d, 0),
    },
    products: [...products.values()].sort((a, b) => b.web.sales + b.shop.sales - (a.web.sales + a.shop.sales)).slice(0, 200),
    showrooms: shopNames,
  };
}
