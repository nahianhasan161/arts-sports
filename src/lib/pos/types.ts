/** Shapes shared by the POS screens and their API routes (no server code here). */

export interface PosVariant {
  variant_id: string | null;
  label: string;
  sku: string | null;
  barcode: string | null;
  available: number;
}

export interface PosProduct {
  product_id: string;
  title: string;
  image: string | null;
  price: number;
  base_price: number;
  variants: PosVariant[];
}

export const PAY_METHODS = ["cash", "card", "bkash", "nagad", "other"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export interface CartLine {
  key: string;
  product_id: string;
  variant_id: string | null;
  title: string;
  label: string;
  price: number;
  available: number;
  quantity: number;
  discount: number;
  /** Register only: a % off the line, or a new unit price (sent as a discount). */
  pct?: number;
  unit?: number;
}

/** The ৳ off one bill line, from a fixed amount, a % or a lowered unit price. */
export function lineDiscount(l: CartLine): number {
  const gross = l.price * l.quantity;
  const off = l.unit != null ? (l.price - l.unit) * l.quantity : l.pct != null ? (gross * l.pct) / 100 : l.discount;
  return Math.round(Math.min(gross, Math.max(0, off)) * 100) / 100;
}

export interface SaleDetail {
  sale: {
    id: string;
    receipt_no: string;
    customer_name: string | null;
    customer_phone: string | null;
    subtotal: number;
    discount_total: number;
    coupon_code: string | null;
    coupon_discount: number;
    total: number;
    cash_tendered: number;
    change_due: number;
    refunded_total: number;
    status: string;
    note: string | null;
    staff: string;
    created_at: string;
  };
  items: {
    id: string;
    product_id: string | null;
    variant_id: string | null;
    title: string;
    variant_label: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    line_total: number;
    returned_quantity: number;
  }[];
  payments: { id: string; type: "charge" | "refund"; method: string; amount: number; reference: string | null; created_at: string }[];
  returns: { id: string; reason: string | null; refund_amount: number; refund_method: string; created_at: string }[];
  showroom: { name: string; address: string | null } | null;
}

export const taka = (n: number | string | null | undefined) => `৳${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
