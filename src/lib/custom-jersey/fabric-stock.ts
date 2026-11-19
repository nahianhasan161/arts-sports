/** Fabric stock (raw material, kg). Migration 20261118140000; API /api/admin/fabric-stock. */
export const WASTAGE_REASONS = ["cutting", "display", "sample", "damaged", "misprint", "other"] as const;
export type WastageReason = (typeof WASTAGE_REASONS)[number];
export type FabricMoveKind = "purchase" | "used" | "wastage" | "adjust";

export interface FabricStockRow {
  on_hand_kg: number;
  bought_kg: number;
  bought_cost: number;
  avg_cost_per_kg: number | null;
  used_kg: number;
  used_pieces: number;
  wasted_kg: number;
  wasted_pieces: number;
  last_purchase_at: string | null;
}

export interface FabricWithStock {
  id: string;
  name_en: string;
  name_bn: string | null;
  image_url: string | null;
  is_active: boolean;
  price_per_piece: number | null;
  price_tiers: { min: number; price: number }[] | null;
  kg_per_piece: number | null;
  low_stock_kg: number | null;
  stock: FabricStockRow | null;
}

export interface FabricMove {
  id: string;
  fabric_id: string;
  kind: FabricMoveKind;
  reason: WastageReason | null;
  kg: number;
  pieces: number | null;
  cost_per_kg: number | null;
  total_cost: number | null;
  supplier_id: string | null;
  order_number: string | null;
  note: string | null;
  staff: string | null;
  created_at: string;
  /** The day it happened (YYYY-MM-DD); staff may back-date a purchase. */
  move_date: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface FabricTotals {
  bought_kg: number;
  bought_cost: number;
  used_kg: number;
  wasted_kg: number;
  adjust_kg: number;
  count: number;
}

/** Pieces one kg makes, or how many pieces the stock is enough for. */
export const piecesFor = (kg: number, kgPerPiece: number | null) => (kgPerPiece && kgPerPiece > 0 ? Math.floor(kg / kgPerPiece) : null);
