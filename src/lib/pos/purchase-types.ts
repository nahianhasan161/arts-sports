/** Shapes shared by the supplier purchase screens and their API routes (no server code here). */

export const SUPPLIER_PAY_METHODS = ["cash", "bkash", "nagad", "bank", "card", "other"] as const;
export type SupplierPayMethod = (typeof SUPPLIER_PAY_METHODS)[number];

export interface SupplierFull {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  payment_info: string | null;
  notes: string | null;
  lead_days: number;
  opening_due: number;
  is_active: boolean;
  created_at?: string;
}

export interface SupplierBalance {
  supplier_id: string;
  purchases: number;
  bought: number;
  paid: number;
  /** Negative = paid in advance. */
  due: number;
  last_purchase_at: string | null;
}

export interface PurchaseRow {
  id: string;
  receipt_no: number | null;
  supplier_id: string | null;
  supplier: string;
  showroom: string;
  reference: string | null;
  note: string | null;
  invoice_date: string | null;
  subtotal: number;
  discount: number;
  extra_cost: number;
  payable: number;
  paid: number;
  due: number;
  lines: number;
  pieces: number;
  staff: string;
  created_at: string;
}

export interface PurchaseItem {
  variant_id: string;
  title: string;
  label: string;
  code: string;
  quantity: number;
  unit_cost: number | null;
}

export interface SupplierPayment {
  id: string;
  receipt_id: string | null;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  from_drawer: boolean;
  staff: string;
  created_at: string;
  /** Set when the payment was undone (kept, struck out). */
  voided_at: string | null;
  void_reason: string | null;
  voided_by: string;
}

export interface ReceiptSnapshot {
  reference: string | null;
  invoice_date: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  extra_cost: number;
  items: { variant_id: string; quantity: number; unit_cost: number | null }[];
}

/** One correction to a purchase, or an undone payment against it. */
export interface PurchaseEdit {
  id: string;
  kind: "edit" | "payment_void";
  reason: string;
  before: Partial<ReceiptSnapshot> & { amount?: number; method?: string; paid_at?: string };
  after: Partial<ReceiptSnapshot> & { cash_back_in_drawer?: boolean };
  staff: string;
  created_at: string;
}

/** A row of the audit log, with the person's name. */
export interface AuditEntry {
  id: number;
  occurred_at: string;
  who: string;
  action: "insert" | "update" | "delete";
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown>;
  reason: string | null;
}

/** Purchase number as printed: P-1001. */
export const purchaseNo = (p: { receipt_no: number | null; id: string }) => (p.receipt_no ? `P-${p.receipt_no}` : p.id.slice(0, 8));

/** The text key for a payment method. */
export const methodKey = (m: string) =>
  (SUPPLIER_PAY_METHODS as readonly string[]).includes(m) ? (`shop.purchase.method.${m as SupplierPayMethod}` as const) : ("shop.purchase.method.other" as const);
