/**
 * Custom jersey (roadmap Phase 3): shared shapes for the browser and the server.
 * The tables are in supabase/migrations/20261113100000_custom_jersey.sql.
 */

export const SPORTS = ["football", "cricket", "badminton", "running", "other"] as const;
export type Sport = (typeof SPORTS)[number];

export const PATTERNS = ["plain", "stripes", "hoops", "sash", "halves", "chevron", "side-panels", "sleeves"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
/** Boys' (kids') jersey sizes, by chest width in inches as the factory labels them. */
export const BOYS_SIZES = ["20", "22", "24", "26", "28", "30", "32", "34"] as const;
/** Size value for a piece made to the player's own measurements. */
export const CUSTOM_SIZE = "CUSTOM";

/** Men is the default; boys use BOYS_SIZES. */
export type Fit = "men" | "boys";
export const FITS: Fit[] = ["men", "boys"];

export type Sleeve = "short" | "full";
/**
 * The jersey type: "round" = T-shirt (no collar), "polo" = polo (with a collar).
 * "v" (V neck) is kept for old orders; new orders choose T-shirt or polo, and a
 * picture tagged "collar" shows the exact neck/collar when the design doesn't.
 */
export type Collar = "round" | "v" | "polo";
/** The two choices offered for new orders. */
export const JERSEY_TYPES = ["round", "polo"] as const;
export type Source = "upload" | "template" | "ai";

/** How the logo is made. "print" is printed with the jersey (free by default); the others cost extra. */
export const LOGO_TYPES = ["print", "dtf", "silicon", "embroidery"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

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
  /** Price per piece from `min` pieces upwards (sorted by min). Empty = use the % discount tiers. */
  price_tiers?: FabricPriceTier[] | null;
  display_order: number;
  is_active: boolean;
}

export interface FabricPriceTier {
  min: number;
  price: number;
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
  /** Taka per piece. Names and numbers are free (0); a 0 price shows as "free". */
  extras: {
    name: number;
    number: number;
    full_sleeve: number;
    shorts: number;
    polo_collar: number;
    logo_print: number;
    logo_dtf: number;
    logo_silicon: number;
    logo_embroidery: number;
  };
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
  // Placeholder prices except name/number (free) and printed logo (free); set the real ones on the Jersey prices page.
  extras: { name: 0, number: 0, full_sleeve: 60, shorts: 250, polo_collar: 50, logo_print: 0, logo_dtf: 40, logo_silicon: 40, logo_embroidery: 40 },
  rush: { normal_days: 7, min_days: 3, percent: 20 },
  advance_percent: 30,
  free_revisions: 2,
};

export interface RosterRow {
  player_name: string;
  player_number: string;
  size: string;
  sleeve: Sleeve;
  /** Missing = men. */
  fit?: Fit;
  /** Body measurements in inches. Chest + length are required when size is CUSTOM. */
  chest?: number | null;
  length?: number | null;
  /** Optional; also allowed on a standard size when only the sleeve is made longer/shorter. */
  sleeve_length?: number | null;
}

export interface UploadedFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: "design" | "reference" | "logo" | "preview";
  /** What the picture shows: a part tag in the writer's language ("Collar" / "কলার", see customJersey.upload.tags) and/or a note. */
  note?: string;
  /** Set when staff picked a catalogue product as the reference; `path` is then that product's public image URL. */
  product_id?: string;
  /** Set when staff picked one of our gallery designs (custom_gallery); `path` is then its public image URL. */
  design_id?: string;
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
  /** Shop details for "pick up from the shop" (Receipt settings); null when no address is set. */
  pickup?: { name: string; address: string; phone: string; hours: string; map: { link: string; embed: string } | null } | null;
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

/**
 * How the order's logo is made: kept in estimate_breakdown.logoType (next to the
 * logo price it decided). Null = no logo; old orders with a logo and no type = "print"
 * is not assumed, they return null with `with_logo` still true.
 */
export function logoTypeOf(o: { with_logo?: boolean; estimate_breakdown?: Record<string, unknown> | null }): LogoType | null {
  const v = o.estimate_breakdown?.logoType;
  return o.with_logo && typeof v === "string" && (LOGO_TYPES as readonly string[]).includes(v) ? (v as LogoType) : null;
}

/** "polo" for a polo collar, else "round" (T-shirt; old V-neck orders count as T-shirt). */
export const jerseyTypeOf = (collar: Collar | string | null | undefined): (typeof JERSEY_TYPES)[number] => (collar === "polo" ? "polo" : "round");

/** Total the customer owes: the final price plus delivery. */
export function orderTotal(o: Pick<CustomOrderDetail, "final_price" | "delivery_charge">): number {
  return Number(o.final_price ?? 0) + Number(o.delivery_charge ?? 0);
}

export function isOverdue(o: Pick<CustomOrderDetail, "due_date" | "status">, today = new Date()): boolean {
  if (!o.due_date) return false;
  if (!["queued", "cutting", "printing", "sewing", "qc"].includes(o.status)) return false;
  return o.due_date < today.toISOString().slice(0, 10);
}
