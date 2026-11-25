import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { explainPosError, listShowrooms, loadVariants, staffNames } from "./server";
import { plainItemId, plainProductId } from "./purchase-types";
import type { AuditEntry, PurchaseEdit, PurchaseRow, PurchaseItem, SupplierPayment } from "./purchase-types";

/**
 * Supplier purchases (migration 20261117120000). A purchase is a
 * stock_receipts row; money paid is in supplier_payments.
 */

const RECEIPT_COLUMNS = "id, receipt_no, supplier_id, showroom_id, reference, note, invoice_date, total_cost, discount, extra_cost, received_by, created_at";

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * supplier_payments rows. `voided_at` arrives with migration 20261117130000;
 * before that the read falls back to the older columns.
 */
async function paymentRows(db: SupabaseClient, columns: string, filter: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => typeof q) {
  const withVoid = await filter(db.from("supplier_payments").select(`${columns}, voided_at, voided_by, void_reason`));
  if (!withVoid.error || !/voided_at|void_reason|voided_by/.test(withVoid.error.message)) return withVoid;
  return filter(db.from("supplier_payments").select(columns));
}

/** Purchases, newest first, with what was paid against each. */
export async function listPurchases(db: SupabaseClient, by: { supplierId?: string; id?: string; limit?: number }): Promise<PurchaseRow[]> {
  let query = db.from("stock_receipts").select(RECEIPT_COLUMNS).order("created_at", { ascending: false }).limit(by.limit ?? 100);
  if (by.supplierId) query = query.eq("supplier_id", by.supplierId);
  if (by.id) query = query.eq("id", by.id);
  const { data, error } = await query;
  if (error) throw new Error(explainPosError(error.message));
  const rows = data ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id as string);
  const supplierIds = [...new Set(rows.map((r) => r.supplier_id as string | null).filter(Boolean))] as string[];
  const [payments, items, suppliers, showrooms, names] = await Promise.all([
    paymentRows(db, "receipt_id, amount", (q) => q.in("receipt_id", ids)),
    db.from("stock_receipt_items").select("receipt_id, quantity").in("receipt_id", ids),
    supplierIds.length ? db.from("suppliers").select("id, name").in("id", supplierIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    listShowrooms(db),
    staffNames(db, rows.map((r) => r.received_by as string | null)),
  ]);
  if (payments.error) throw new Error(explainPosError(payments.error.message));

  const paid = new Map<string, number>();
  for (const p of (payments.data ?? []) as unknown as Record<string, unknown>[]) {
    if (p.voided_at) continue;
    paid.set(p.receipt_id as string, (paid.get(p.receipt_id as string) ?? 0) + num(p.amount));
  }
  const pieces = new Map<string, { lines: number; qty: number }>();
  for (const i of items.data ?? []) {
    const c = pieces.get(i.receipt_id as string) ?? { lines: 0, qty: 0 };
    pieces.set(i.receipt_id as string, { lines: c.lines + 1, qty: c.qty + num(i.quantity) });
  }
  const supplierName = new Map((suppliers.data ?? []).map((s) => [s.id as string, s.name as string]));
  const showroomName = new Map(showrooms.map((s) => [s.id, s.name]));

  return rows.map((r) => {
    const payable = num(r.total_cost) - num(r.discount) + num(r.extra_cost);
    const p = paid.get(r.id as string) ?? 0;
    return {
      id: r.id as string,
      receipt_no: (r.receipt_no as number | null) ?? null,
      supplier_id: (r.supplier_id as string | null) ?? null,
      supplier: r.supplier_id ? supplierName.get(r.supplier_id as string) ?? "" : "",
      showroom: showroomName.get(r.showroom_id as string) ?? "",
      reference: (r.reference as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      invoice_date: (r.invoice_date as string | null) ?? null,
      subtotal: num(r.total_cost),
      discount: num(r.discount),
      extra_cost: num(r.extra_cost),
      payable,
      paid: p,
      due: payable - p,
      lines: pieces.get(r.id as string)?.lines ?? 0,
      pieces: pieces.get(r.id as string)?.qty ?? 0,
      staff: r.received_by ? names.get(r.received_by as string) ?? "Staff" : "",
      created_at: r.created_at as string,
    };
  });
}

/** Names of purchase lines: variants, and products without options ("product:<id>"). */
async function itemsById(db: SupabaseClient, itemIds: string[]): Promise<Map<string, { title: string; label: string; code: string }>> {
  const ids = [...new Set(itemIds)];
  const productIds = ids.map(plainProductId).filter((id): id is string => Boolean(id));
  const [variants, products] = await Promise.all([
    loadVariants(db, { variantIds: ids.filter((id) => plainProductId(id) === null) }),
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : null,
  ]);
  if (products?.error) throw new Error(explainPosError(products.error.message));
  return new Map([
    ...variants.map((v) => [v.variant_id, { title: v.title, label: v.label, code: v.barcode ?? v.sku ?? "" }] as const),
    ...(products?.data ?? []).map((p) => [plainItemId(p.id as string), { title: p.title as string, label: "", code: "" }] as const),
  ]);
}

/** The lines of one purchase. */
export async function purchaseItems(db: SupabaseClient, receiptId: string): Promise<PurchaseItem[]> {
  // "*": product_id arrives with migration 20261125100000.
  const { data, error } = await db.from("stock_receipt_items").select("*").eq("receipt_id", receiptId);
  if (error) throw new Error(explainPosError(error.message));
  const idOf = (i: { variant_id: string | null; product_id?: string | null }) => i.variant_id ?? plainItemId(i.product_id ?? "");
  const byId = await itemsById(db, (data ?? []).map(idOf));
  return (data ?? []).map((i) => {
    const v = byId.get(idOf(i));
    return {
      variant_id: idOf(i),
      title: v?.title ?? "(deleted)",
      label: v?.label ?? "",
      code: v?.code ?? "",
      quantity: num(i.quantity),
      unit_cost: i.unit_cost === null ? null : num(i.unit_cost),
    };
  });
}

/** Money paid to a supplier (or against one purchase), newest first. Undone payments are kept. */
export async function listPayments(db: SupabaseClient, by: { supplierId?: string; receiptId?: string }): Promise<SupplierPayment[]> {
  const { data, error } = await paymentRows(db, "id, supplier_id, receipt_id, amount, method, reference, note, cash_move_id, paid_by, created_at", (q) => {
    let query = q.order("created_at", { ascending: false }).limit(300);
    if (by.supplierId) query = query.eq("supplier_id", by.supplierId);
    if (by.receiptId) query = query.eq("receipt_id", by.receiptId);
    return query;
  });
  if (error) throw new Error(explainPosError(error.message));
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const names = await staffNames(db, rows.flatMap((p) => [p.paid_by as string | null, p.voided_by as string | null]));
  return rows.map((p) => ({
    id: p.id as string,
    receipt_id: (p.receipt_id as string | null) ?? null,
    amount: num(p.amount),
    method: p.method as string,
    reference: (p.reference as string | null) ?? null,
    note: (p.note as string | null) ?? null,
    from_drawer: Boolean(p.cash_move_id),
    staff: p.paid_by ? names.get(p.paid_by as string) ?? "Staff" : "",
    created_at: p.created_at as string,
    voided_at: (p.voided_at as string | null) ?? null,
    void_reason: (p.void_reason as string | null) ?? null,
    voided_by: p.voided_by ? names.get(p.voided_by as string) ?? "Staff" : "",
  }));
}

/** Corrections to one purchase, newest first, with the names of every item they mention. */
export async function purchaseEdits(db: SupabaseClient, receiptId: string): Promise<{ edits: PurchaseEdit[]; names: Record<string, string> }> {
  const { data, error } = await db.from("stock_receipt_edits").select("id, kind, reason, before_state, after_state, edited_by, created_at").eq("receipt_id", receiptId).order("created_at", { ascending: false }).limit(100);
  // Missing until migration 20261117130000: no history yet, not an error.
  if (error) return { edits: [], names: {} };
  const rows = data ?? [];
  const variantIds = new Set<string>();
  for (const r of rows) for (const side of [r.before_state, r.after_state] as { items?: { variant_id: string }[] }[]) for (const i of side?.items ?? []) variantIds.add(i.variant_id);
  const [staff, items] = await Promise.all([staffNames(db, rows.map((r) => r.edited_by as string | null)), itemsById(db, [...variantIds])]);
  return {
    edits: rows.map((r) => ({
      id: r.id as string,
      kind: r.kind as PurchaseEdit["kind"],
      reason: r.reason as string,
      before: (r.before_state ?? {}) as PurchaseEdit["before"],
      after: (r.after_state ?? {}) as PurchaseEdit["after"],
      staff: r.edited_by ? staff.get(r.edited_by as string) ?? "Staff" : "",
      created_at: r.created_at as string,
    })),
    names: Object.fromEntries([...items].map(([id, v]) => [id, `${v.title} ${v.label}`.trim()])),
  };
}

/**
 * Audit log rows for some records, newest first. `targets` are
 * [table, ids] pairs. Read with the service client: the route has already
 * checked the staff permission for these records.
 */
export async function auditFor(db: SupabaseClient, targets: [string, string[]][], limit = 200): Promise<AuditEntry[]> {
  const parts = targets
    .map(([table, ids]) => [table, ids.filter((id) => /^[\w:-]+$/.test(id)).slice(0, 150)] as const)
    .filter(([, ids]) => ids.length)
    .map(([table, ids]) => `and(entity_type.eq.${table},entity_id.in.(${ids.join(",")}))`);
  if (!parts.length) return [];
  const read = (columns: string) => db.from("audit_log").select(columns).or(parts.join(",")).order("id", { ascending: false }).limit(limit);
  const base = "id, occurred_at, actor_id, actor_email, actor_kind, action, entity_type, entity_id, changes";
  let res = await read(`${base}, reason`);
  // `reason` arrives with migration 20261117130000.
  if (res.error && /reason/.test(res.error.message)) res = await read(base);
  if (res.error) throw new Error(explainPosError(res.error.message));
  const rows = (res.data ?? []) as unknown as Record<string, unknown>[];
  const names = await staffNames(db, rows.map((r) => r.actor_id as string | null));
  return rows.map((r) => ({
    id: r.id as number,
    occurred_at: r.occurred_at as string,
    who: r.actor_id ? names.get(r.actor_id as string) ?? (r.actor_email as string) ?? "Staff" : r.actor_kind === "anon" ? "Customer" : "System",
    action: r.action as AuditEntry["action"],
    entity_type: r.entity_type as string,
    entity_id: (r.entity_id as string | null) ?? null,
    changes: (r.changes ?? {}) as Record<string, unknown>,
    reason: (r.reason as string | null) ?? null,
  }));
}
