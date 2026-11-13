export interface StockRow {
  variant_id: string;
  product_id: string;
  title: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  cost_price: number | null;
  low_stock_threshold: number | null;
  is_active: boolean;
  quantity: number;
  reserved: number;
  threshold: number;
  low: boolean;
  suppliers: { supplier_id: string; quantity: number }[];
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  lead_days: number;
  is_active: boolean;
}

export interface Showroom {
  id: string;
  name: string;
}
