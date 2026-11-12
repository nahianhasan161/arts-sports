import { DEFAULT_PRICING, type Collar, type PricingConfig, type RosterRow, type Sleeve } from "./types";

/**
 * The estimate shown on the site, and stored with the order. The same
 * function runs in the browser (live, as the customer types) and on the
 * server (which never trusts the browser's number).
 *
 *   price = fabric price per piece, less the quantity discount
 *         + extras per piece (name, number, logo, full sleeve, shorts, polo collar)
 *         + rush charge when it is needed sooner than the normal lead time
 *
 * It is an estimate: staff set the final price after seeing the design.
 */

export interface EstimateInput {
  fabricPrice: number;
  quantity: number;
  sleeve: Sleeve;
  collar: Collar;
  withShorts: boolean;
  withNames: boolean;
  withNumbers: boolean;
  withLogo: boolean;
  /** When a roster is given it decides quantity and how many are full sleeve. */
  roster?: Pick<RosterRow, "sleeve">[];
  /** YYYY-MM-DD */
  neededBy?: string | null;
  today?: Date;
}

export interface EstimateLine {
  key: "fabric" | "name" | "number" | "logo" | "full_sleeve" | "shorts" | "polo_collar" | "rush";
  quantity: number;
  unit: number;
  amount: number;
}

export interface Estimate {
  quantity: number;
  discountPercent: number;
  unitFabricPrice: number;
  lines: EstimateLine[];
  subtotal: number;
  isRush: boolean;
  /** True when the date is sooner than we can make it at all. */
  tooSoon: boolean;
  rushAmount: number;
  total: number;
  perPiece: number;
}

const round = (n: number) => Math.round(n);

export function normalizePricing(raw: unknown): PricingConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PricingConfig>;
  const num = (v: unknown, fallback: number, max = 1_000_000) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
  };
  const tiers = Array.isArray(r.tiers)
    ? r.tiers
        .map((t) => ({ min: Math.floor(num(t?.min, 0, 100000)), discount_percent: num(t?.discount_percent, 0, 90) }))
        .filter((t) => t.min >= 1)
        .sort((a, b) => a.min - b.min)
    : [];
  const d = DEFAULT_PRICING;
  const e = (r.extras ?? {}) as Partial<PricingConfig["extras"]>;
  const rush = (r.rush ?? {}) as Partial<PricingConfig["rush"]>;
  return {
    tiers: tiers.length ? tiers : d.tiers,
    extras: {
      name: num(e.name, d.extras.name),
      number: num(e.number, d.extras.number),
      logo: num(e.logo, d.extras.logo),
      full_sleeve: num(e.full_sleeve, d.extras.full_sleeve),
      shorts: num(e.shorts, d.extras.shorts),
      polo_collar: num(e.polo_collar, d.extras.polo_collar),
    },
    rush: {
      normal_days: Math.max(1, Math.floor(num(rush.normal_days, d.rush.normal_days, 365))),
      min_days: Math.max(0, Math.floor(num(rush.min_days, d.rush.min_days, 365))),
      percent: num(rush.percent, d.rush.percent, 500),
    },
    advance_percent: Math.min(100, Math.max(0, num(r.advance_percent, d.advance_percent, 100))),
    free_revisions: Math.floor(num(r.free_revisions, d.free_revisions, 20)),
  };
}

export function discountFor(quantity: number, pricing: PricingConfig): number {
  let percent = 0;
  for (const tier of pricing.tiers) if (quantity >= tier.min) percent = tier.discount_percent;
  return percent;
}

/** Whole days from today (local midnight) to the date. */
export function daysUntil(date: string, today = new Date()): number {
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function estimate(input: EstimateInput, pricing: PricingConfig): Estimate {
  const rosterCount = input.roster?.length ?? 0;
  const quantity = Math.max(1, Math.floor(rosterCount > 0 ? rosterCount : input.quantity || 1));
  const fullSleeves =
    rosterCount > 0 ? input.roster!.filter((r) => r.sleeve === "full").length : input.sleeve === "full" ? quantity : 0;

  const discountPercent = discountFor(quantity, pricing);
  const unitFabricPrice = round(input.fabricPrice * (1 - discountPercent / 100));

  const lines: EstimateLine[] = [{ key: "fabric", quantity, unit: unitFabricPrice, amount: unitFabricPrice * quantity }];
  const add = (key: EstimateLine["key"], on: boolean, unit: number, count = quantity) => {
    if (on && unit > 0 && count > 0) lines.push({ key, quantity: count, unit, amount: round(unit * count) });
  };
  add("name", input.withNames, pricing.extras.name);
  add("number", input.withNumbers, pricing.extras.number);
  add("logo", input.withLogo, pricing.extras.logo);
  add("full_sleeve", fullSleeves > 0, pricing.extras.full_sleeve, fullSleeves);
  add("shorts", input.withShorts, pricing.extras.shorts);
  add("polo_collar", input.collar === "polo", pricing.extras.polo_collar);

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);

  let isRush = false;
  let tooSoon = false;
  if (input.neededBy && /^\d{4}-\d{2}-\d{2}$/.test(input.neededBy)) {
    const days = daysUntil(input.neededBy, input.today);
    tooSoon = days < pricing.rush.min_days;
    isRush = days < pricing.rush.normal_days;
  }
  const rushAmount = isRush ? round((subtotal * pricing.rush.percent) / 100) : 0;
  if (rushAmount > 0) lines.push({ key: "rush", quantity: 1, unit: rushAmount, amount: rushAmount });

  const total = subtotal + rushAmount;
  return {
    quantity,
    discountPercent,
    unitFabricPrice,
    lines,
    subtotal,
    isRush,
    tooSoon,
    rushAmount,
    total,
    perPiece: round(total / quantity),
  };
}

/** The advance (30% by default), rounded up to a whole taka. */
export function advanceFor(total: number, pricing: PricingConfig): number {
  return Math.ceil((total * pricing.advance_percent) / 100);
}

/** { M: 5, L: 4 } in the usual size order. */
export function sizeSummary(roster: Pick<RosterRow, "size">[]): [string, number][] {
  const order = ["XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL"];
  const counts = new Map<string, number>();
  for (const r of roster) {
    const size = r.size.trim().toUpperCase();
    if (size) counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  const rank = (s: string) => (order.indexOf(s) === -1 ? order.length : order.indexOf(s));
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}
