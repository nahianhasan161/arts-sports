/**
 * Custom jersey making cost: accessories stock + production batches (migration 20261118150000).
 * APIs: /api/admin/accessory-stock, /api/admin/production. Safe for client and server.
 */
export const ACCESSORY_KINDS = ["logo", "name", "number", "label", "tag", "packaging", "other"] as const;
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number];

export const PRINT_BASES = ["kg", "piece", "lump"] as const;
export type PrintBasis = (typeof PRINT_BASES)[number];

export const EXTRA_COST_KINDS = ["travel", "transport", "labour", "food", "other"] as const;
export type ExtraCostKind = (typeof EXTRA_COST_KINDS)[number];

export const SLEEVES = ["short", "full"] as const;
export const COLLARS = ["round", "v", "polo"] as const;
export type Sleeve = (typeof SLEEVES)[number];
export type Collar = (typeof COLLARS)[number];

export type BatchStatus = "open" | "done" | "void";

/* ---------- Garments rate card (app_settings.garment_rates) ---------- */

export const GARMENT_RATES_KEY = "garment_rates";
export type StyleKey = `${Sleeve}_${Collar}`;
export type GarmentRates = Record<StyleKey, number> & { shorts: number };

export const styleKey = (sleeve: Sleeve, collar: Collar): StyleKey => `${sleeve}_${collar}`;
export const STYLE_KEYS: StyleKey[] = SLEEVES.flatMap((s) => COLLARS.map((c) => styleKey(s, c)));

/** Empty card: every rate 0 until the shop fills in real ones. */
export const EMPTY_RATES: GarmentRates = { ...(Object.fromEntries(STYLE_KEYS.map((k) => [k, 0])) as Record<StyleKey, number>), shorts: 0 };

export function parseGarmentRates(raw: unknown): GarmentRates {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...EMPTY_RATES };
  for (const k of [...STYLE_KEYS, "shorts"] as const) {
    const n = Number(o[k]);
    if (Number.isFinite(n) && n >= 0 && n < 100000) out[k] = Math.round(n * 100) / 100;
  }
  return out;
}

/* ---------- Accessories ---------- */

export interface AccessoryStockRow {
  on_hand: number;
  bought_qty: number;
  bought_cost: number;
  avg_cost: number | null;
  used_qty: number;
  wasted_qty: number;
  last_purchase_at: string | null;
}

export interface AccessoryWithStock {
  id: string;
  name_en: string;
  name_bn: string | null;
  kind: AccessoryKind;
  per_jersey: number | null;
  low_stock_pcs: number | null;
  is_active: boolean;
  display_order: number;
  stock: AccessoryStockRow | null;
}

export interface AccessoryMove {
  id: string;
  accessory_id: string;
  kind: "purchase" | "used" | "wastage" | "adjust";
  reason: string | null;
  qty: number;
  cost_per_pc: number | null;
  total_cost: number | null;
  supplier_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  order_number: string | null;
  note: string | null;
  staff: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

/* ---------- Production batches ---------- */

export interface BatchTotals {
  pieces: number;
  garments_cost: number;
  fabric_kg: number;
  fabric_cost: number;
  accessory_qty: number;
  accessory_cost: number;
  print_cost: number;
  extra_cost: number;
  total_cost: number;
  cost_per_piece: number | null;
}

export interface BatchListRow {
  id: string;
  batch_number: string;
  title: string | null;
  status: BatchStatus;
  created_at: string;
  done_at: string | null;
  orders: string[];
  totals: BatchTotals | null;
}

export interface BatchLine {
  id?: string;
  custom_order_id: string | null;
  order_number?: string | null;
  customer_name?: string | null;
  label: string | null;
  pieces: number;
  sleeve: Sleeve;
  collar: Collar;
  shorts: number;
  garment_rate: number;
  shorts_rate: number;
}

export interface LineCost {
  line_id: string;
  custom_order_id: string | null;
  pieces: number;
  garment_cost: number;
  direct_cost: number;
  shared_cost: number;
  total_cost: number;
  cost_per_piece: number;
}

export interface BatchCost {
  kind: ExtraCostKind;
  amount: number;
  note: string | null;
}

/** A fabric or accessory entry taken out for the batch. */
export interface BatchMaterial {
  id: string;
  material: "fabric" | "accessory";
  item_id: string;
  name: string;
  kind: "used" | "wastage";
  reason: string | null;
  amount: number; // kg (fabric) or pieces (accessory), positive
  pieces: number | null;
  total_cost: number | null;
  order_number: string | null;
  note: string | null;
  created_at: string;
  voided_at: string | null;
}

export interface BatchDetail {
  id: string;
  batch_number: string;
  title: string | null;
  note: string | null;
  status: BatchStatus;
  print_supplier_id: string | null;
  print_basis: PrintBasis;
  print_qty: number | null;
  print_rate: number | null;
  print_cost: number;
  garments_supplier_id: string | null;
  created_at: string;
  done_at: string | null;
  void_reason: string | null;
  lines: BatchLine[];
  costs: BatchCost[];
  materials: BatchMaterial[];
  line_costs: LineCost[];
  totals: BatchTotals | null;
  /** Selling price per piece for each order in the batch (final price, else the estimate; no delivery). */
  order_prices: Record<string, { price: number; quantity: number; final: boolean }>;
}

/** Custom orders that can go into a batch. */
export interface BatchOrderOption {
  id: string;
  order_number: string;
  customer_name: string;
  status: string;
  quantity: number;
  sleeve: Sleeve;
  collar: Collar;
  with_shorts: boolean;
  with_names: boolean;
  with_numbers: boolean;
  with_logo: boolean;
  fabric_id: string | null;
  fabric_name: string | null;
  /** Pieces of this order already in other (not void) batches. */
  in_batches: number;
}

/** Print cost the way the SQL works it out (shown live while typing). */
export function printCost(basis: PrintBasis, qty: number, rate: number, lump: number) {
  if (basis === "lump") return Math.max(0, lump || 0);
  return Math.round(Math.max(0, qty || 0) * Math.max(0, rate || 0) * 100) / 100;
}

export const lineGarmentCost = (l: Pick<BatchLine, "pieces" | "garment_rate" | "shorts" | "shorts_rate">) =>
  (l.pieces || 0) * (l.garment_rate || 0) + (l.shorts || 0) * (l.shorts_rate || 0);
