/** Shop money report (api/admin/pos/cash-report): types and the sums the screen works out. */

/** Fixed order = stacking order and colour slot; a method keeps its colour whatever the filter. */
export const REPORT_METHODS = ["cash", "bkash", "nagad", "card", "bank", "other", "online"] as const;
export type ReportMethod = (typeof REPORT_METHODS)[number];

export const LINE_KINDS = ["sale", "custom", "refund", "cash_in", "cash_out", "supplier"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface CashLine {
  id: string;
  at: string;
  kind: LineKind;
  method: ReportMethod;
  /** + money came in, − money went out */
  amount: number;
  /** receipt no / custom order no / supplier name */
  ref: string | null;
  ref_id: string | null;
  label: string | null;
  staff_id: string | null;
  staff?: string | null;
  showroom_id: string | null;
}

export interface DrawerDay {
  id: string;
  showroom_id: string;
  staff: string;
  opened_at: string;
  closed_at: string;
  opening_float: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  note: string | null;
}

export interface CashReport {
  showrooms: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  can_manage: boolean;
  /** a list hit the row limit: pick a shorter date range */
  truncated: boolean;
  lines: CashLine[];
  days: DrawerDay[];
}

/** Money in (sales, custom jersey) counts as received; cash put into the drawer does not. */
export const isReceived = (l: CashLine) => l.kind === "sale" || l.kind === "custom";

export interface MethodTotal {
  method: ReportMethod;
  in: number;
  out: number;
  net: number;
  count: number;
}

export function methodTotals(lines: CashLine[]): MethodTotal[] {
  const map = new Map<ReportMethod, MethodTotal>(REPORT_METHODS.map((m) => [m, { method: m, in: 0, out: 0, net: 0, count: 0 }]));
  for (const l of lines) {
    const t = map.get(l.method)!;
    if (l.amount >= 0) t.in += l.amount;
    else t.out += -l.amount;
    t.net += l.amount;
    t.count += 1;
  }
  return [...map.values()];
}

const DAY = 86_400_000;
const DHAKA = 6 * 3_600_000;
/** Dhaka calendar day (YYYY-MM-DD) of an ISO time. */
export const dhakaDayOf = (iso: string) => new Date(Date.parse(iso) + DHAKA).toISOString().slice(0, 10);

export interface Bucket {
  key: string;
  /** received per method in this day/month */
  values: Record<ReportMethod, number>;
  total: number;
  /** refunds + cash out + supplier payments */
  out: number;
}

/**
 * Money received per day (per month when the window is longer than ~2 months),
 * with empty days filled in so gaps show. `fromDay`/`toDay` are Dhaka days; empty = from the data.
 */
export function buckets(lines: CashLine[], fromDay: string, toDay: string): { unit: "day" | "month"; rows: Bucket[] } {
  const days = lines.map((l) => dhakaDayOf(l.at)).sort();
  const start = fromDay || days[0];
  const end = toDay || days[days.length - 1];
  if (!start || !end) return { unit: "day", rows: [] };
  const span = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
  const unit: "day" | "month" = span > 62 ? "month" : "day";
  const keyOf = (day: string) => (unit === "month" ? day.slice(0, 7) : day);

  const empty = (): Record<ReportMethod, number> => Object.fromEntries(REPORT_METHODS.map((m) => [m, 0])) as Record<ReportMethod, number>;
  const map = new Map<string, Bucket>();
  for (let ms = Date.parse(`${start}T00:00:00Z`); ms <= Date.parse(`${end}T00:00:00Z`); ms += DAY) {
    const k = keyOf(new Date(ms).toISOString().slice(0, 10));
    if (!map.has(k)) map.set(k, { key: k, values: empty(), total: 0, out: 0 });
  }
  for (const l of lines) {
    const b = map.get(keyOf(dhakaDayOf(l.at)));
    if (!b) continue;
    if (isReceived(l)) {
      b.values[l.method] += l.amount;
      b.total += l.amount;
    } else if (l.amount < 0) b.out += -l.amount;
  }
  return { unit, rows: [...map.values()] };
}

/**
 * Chart colours per method (validated categorical order, light / dark steps).
 * Full class names so Tailwind keeps them.
 */
export const METHOD_FILL: Record<ReportMethod, string> = {
  cash: "fill-[#2a78d6] dark:fill-[#3987e5]",
  bkash: "fill-[#eb6834] dark:fill-[#d95926]",
  nagad: "fill-[#1baf7a] dark:fill-[#199e70]",
  card: "fill-[#eda100] dark:fill-[#c98500]",
  bank: "fill-[#e87ba4] dark:fill-[#d55181]",
  other: "fill-[#008300] dark:fill-[#0ca30c]",
  online: "fill-[#6250d6] dark:fill-[#9085e9]",
};
export const METHOD_BG: Record<ReportMethod, string> = {
  cash: "bg-[#2a78d6] dark:bg-[#3987e5]",
  bkash: "bg-[#eb6834] dark:bg-[#d95926]",
  nagad: "bg-[#1baf7a] dark:bg-[#199e70]",
  card: "bg-[#eda100] dark:bg-[#c98500]",
  bank: "bg-[#e87ba4] dark:bg-[#d55181]",
  other: "bg-[#008300] dark:bg-[#0ca30c]",
  online: "bg-[#6250d6] dark:bg-[#9085e9]",
};
