/**
 * Custom jersey (roadmap Phase 3): shared shapes for the browser and the server.
 * The tables are in supabase/migrations/20261113100000_custom_jersey.sql.
 */

export const SPORTS = ["football", "cricket", "badminton", "running", "other"] as const;
export type Sport = (typeof SPORTS)[number];

export const PATTERNS = ["plain", "stripes", "hoops", "sash", "halves", "chevron", "side-panels", "sleeves"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;

export type Sleeve = "short" | "full";
export type Collar = "round" | "v" | "polo";
export type Source = "upload" | "template" | "ai";

export const STATUSES = [
  "submitted",
  "in_review",
  "changes_needed",
  "mockup_sent",
  "revision_requested",
  "approved",
  "queued",
  "cutting",
  "printing",
  "sewing",
  "qc",
  "ready",
  "delivered",
  "rejected",
  "cancelled",
] as const;
export type CustomOrderStatus = (typeof STATUSES)[number];

/** Production steps in order; the customer page shows these as a progress line. */
export const PRODUCTION_STEPS: CustomOrderStatus[] = ["queued", "cutting", "printing", "sewing", "qc", "ready", "delivered"];

/** Before the customer confirms the mockup. Cancelling is only possible here. */
export const BEFORE_APPROVAL: CustomOrderStatus[] = ["submitted", "in_review", "changes_needed", "mockup_sent", "revision_requested"];

export const CLOSED: CustomOrderStatus[] = ["delivered", "rejected", "cancelled"];

/**
 * What staff may move an order to from each status. Customer moves
 * (approve, ask for a revision, resubmit, cancel) and the automatic
 * approved -> queued on payment are not in this table.
 */
export const STAFF_TRANSITIONS: Record<CustomOrderStatus, CustomOrderStatus[]> = {
  submitted: ["in_review", "changes_needed", "rejected", "mockup_sent"],
  in_review: ["changes_needed", "rejected", "mockup_sent"],
  changes_needed: ["in_review", "rejected"],
  mockup_sent: ["mockup_sent", "rejected"],
  revision_requested: ["mockup_sent", "rejected"],
  approved: [],
  queued: ["cutting"],
  cutting: ["printing", "queued"],
  printing: ["sewing", "cutting"],
  sewing: ["qc", "printing"],
  qc: ["ready", "sewing"],
  ready: ["delivered", "qc"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export interface Fabric {
  id: string;
  slug: string;
  name_en: string;
  name_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  image_url: string | null;
  price_per_piece: number;
  display_order: number;
  is_active: boolean;
}

export interface JerseyTemplate {
  id: string;
  slug: string;
  sport: Sport;
  name_en: string;
  name_bn: string | null;
  pattern: Pattern;
  default_colors: string[];
  display_order: number;
  is_active: boolean;
}

export interface PricingConfig {
  /** Discount on the fabric price from `min` pieces upwards. Sorted by min. */
  tiers: { min: number; discount_percent: number }[];
  /** Taka per piece. */
  extras: { name: number; number: number; logo: number; full_sleeve: number; shorts: number; polo_collar: number };
  /** Needed sooner than normal_days: +percent. Nothing sooner than min_days. */
  rush: { normal_days: number; min_days: number; percent: number };
  advance_percent: number;
  free_revisions: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  tiers: [
    { min: 1, discount_percent: 0 },
    { min: 5, discount_percent: 5 },
    { min: 11, discount_percent: 10 },
    { min: 21, discount_percent: 15 },
    { min: 51, discount_percent: 20 },
  ],
  extras: { name: 30, number: 30, logo: 40, full_sleeve: 60, shorts: 250, polo_collar: 50 },
  rush: { normal_days: 7, min_days: 3, percent: 20 },
  advance_percent: 30,
  free_revisions: 2,
};

export interface RosterRow {
  player_name: string;
  player_number: string;
  size: string;
  sleeve: Sleeve;
}

export interface UploadedFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: "design" | "reference" | "logo" | "preview";
}

export interface TemplateDesign {
  pattern: Pattern;
  colors: string[];
  team_name: string;
  name: string;
  number: string;
  logo_path: string | null;
  preview_path: string | null;
}

export interface CustomJerseyConfig {
  fabrics: Fabric[];
  templates: JerseyTemplate[];
  pricing: PricingConfig;
  delivery: { dhaka: number; outside: number };
  onlinePayment: boolean;
}

/** What the customer's page and the admin drawer both read. */
export interface CustomOrderDetail {
  id: string;
  order_number: string;
  access_token?: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  locale: "bn" | "en";
  channel: string;
  source: Source;
  sport: Sport;
  template_id: string | null;
  design: Partial<TemplateDesign>;
  files: UploadedFile[];
  notes: string | null;
  fabric_id: string | null;
  fabric_name: string | null;
  sleeve: Sleeve;
  collar: Collar;
  with_shorts: boolean;
  with_names: boolean;
  with_numbers: boolean;
  with_logo: boolean;
  quantity: number;
  needed_by: string | null;
  is_rush: boolean;
  delivery_method: "delivery" | "pickup";
  delivery_zone: "dhaka" | "outside" | null;
  delivery_address: string | null;
  delivery_charge: number;
  estimated_price: number;
  estimate_breakdown: Record<string, unknown>;
  final_price: number | null;
  advance_amount: number | null;
  status: CustomOrderStatus;
  status_reason: string | null;
  revision_count: number;
  approved_at: string | null;
  gallery_consent: boolean;
  assigned_to: string | null;
  due_date: string | null;
  staff_note?: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  paid_total: number;
  roster: (RosterRow & { id: string; position: number })[];
  mockups: { id: string; version: number; images: string[]; note: string | null; created_at: string }[];
  messages: { id: string; author: "customer" | "staff"; body: string; created_at: string }[];
  events: { id: string; from_status: string | null; to_status: string; actor: string; note: string | null; created_at: string }[];
  payments: {
    id: string;
    kind: string;
    method: string;
    amount: number;
    status: string;
    trx_id: string | null;
    note: string | null;
    created_at: string;
    paid_at: string | null;
  }[];
}

/** Total the customer owes: the final price plus delivery. */
export function orderTotal(o: Pick<CustomOrderDetail, "final_price" | "delivery_charge">): number {
  return Number(o.final_price ?? 0) + Number(o.delivery_charge ?? 0);
}

export function isOverdue(o: Pick<CustomOrderDetail, "due_date" | "status">, today = new Date()): boolean {
  if (!o.due_date) return false;
  if (!["queued", "cutting", "printing", "sewing", "qc"].includes(o.status)) return false;
  return o.due_date < today.toISOString().slice(0, 10);
}
