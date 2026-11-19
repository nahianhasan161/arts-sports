import { DEFAULT_PRICING, LOGO_TYPES, type Collar, type FabricPriceTier, type LogoType, type PricingConfig, type RosterRow, type Sleeve } from "./types";

/**
 * The estimate shown on the site, and stored with the order. The same
 * function runs in the browser (live, as the customer types) and on the
 * server (which never trusts the browser's number).
 *
 *   price = fabric price per piece for that quantity (the fabric's own price
 *           tiers when it has them, else the base price less the % discount)
 *         + extras per piece (name, number, logo by type, full sleeve, shorts, polo collar);
 *           an extra priced 0 (names, numbers, printed logo) adds no line
 *         + rush charge when it is needed sooner than the normal lead time
 *
 * It is an estimate: staff set the final price after seeing the design.
 */

export interface EstimateInput {
  fabricPrice: number;
  /** The fabric's own price by quantity. When set, the % discount tiers are not used. */
  fabricTiers?: FabricPriceTier[] | null;
  quantity: number;
  sleeve: Sleeve;
  collar: Collar;
  withShorts: boolean;
  withNames: boolean;
  withNumbers: boolean;
  /** How the logo is made; null / undefined = no logo. */
  logoType?: LogoType | null;
  /** When a roster is given it decides quantity and how many are full sleeve. */
  roster?: Pick<RosterRow, "sleeve">[];
  /** YYYY-MM-DD */
  neededBy?: string | null;
  today?: Date;
}

export interface EstimateLine {
  /** "logo" only appears in orders saved before logo types. */
  key: "fabric" | "name" | "number" | "logo" | `logo_${LogoType}` | "full_sleeve" | "shorts" | "polo_collar" | "rush";
  quantity: number;
  unit: number;
  amount: number;
}

export interface Estimate {
  quantity: number;
  /** Kept with the order (estimate_breakdown.logoType); see logoTypeOf(). */
  logoType: LogoType | null;
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
  const e = (r.extras ?? {}) as Partial<PricingConfig["extras"]> & { logo?: unknown };
  const rush = (r.rush ?? {}) as Partial<PricingConfig["rush"]>;
  // Price tables saved before logo types had one "logo" price: the paid types start from it.
  const oldLogo = e.logo === undefined ? null : num(e.logo, d.extras.logo_dtf);
  return {
    tiers: tiers.length ? tiers : d.tiers,
    extras: {
      name: num(e.name, d.extras.name),
      number: num(e.number, d.extras.number),
      full_sleeve: num(e.full_sleeve, d.extras.full_sleeve),
      shorts: num(e.shorts, d.extras.shorts),
      polo_collar: num(e.polo_collar, d.extras.polo_collar),
      logo_print: num(e.logo_print, d.extras.logo_print),
      logo_dtf: num(e.logo_dtf, oldLogo ?? d.extras.logo_dtf),
      logo_silicon: num(e.logo_silicon, oldLogo ?? d.extras.logo_silicon),
      logo_embroidery: num(e.logo_embroidery, oldLogo ?? d.extras.logo_embroidery),
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

/** Clean, sorted fabric price tiers (min >= 2, price >= 0, one per min). */
export function normalizeFabricTiers(raw: unknown): FabricPriceTier[] {
  if (!Array.isArray(raw)) return [];
  const byMin = new Map<number, number>();
  for (const t of raw.slice(0, 20)) {
    const min = Math.floor(Number((t as FabricPriceTier)?.min));
    const price = Number((t as FabricPriceTier)?.price);
    if (Number.isFinite(min) && min >= 2 && min <= 100000 && Number.isFinite(price) && price >= 0 && price <= 1_000_000) byMin.set(min, price);
  }
  return [...byMin.entries()].sort((a, b) => a[0] - b[0]).map(([min, price]) => ({ min, price }));
}

/** Price per piece of a fabric for this many pieces, from its own tiers (null when it has none). */
export function fabricTierPrice(base: number, tiers: FabricPriceTier[] | null | undefined, quantity: number): number | null {
  const list = normalizeFabricTiers(tiers);
  if (!list.length) return null;
  let price = base;
  for (const t of list) if (quantity >= t.min) price = t.price;
  return price;
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

  const tierPrice = fabricTierPrice(input.fabricPrice, input.fabricTiers, quantity);
  let discountPercent: number;
  let unitFabricPrice: number;
  if (tierPrice !== null) {
    unitFabricPrice = round(tierPrice);
    // Shown as "x% quantity discount" when the tier price is below the base price.
    discountPercent = input.fabricPrice > 0 && unitFabricPrice < input.fabricPrice ? Math.round((1 - unitFabricPrice / input.fabricPrice) * 100) : 0;
  } else {
    discountPercent = discountFor(quantity, pricing);
    unitFabricPrice = round(input.fabricPrice * (1 - discountPercent / 100));
  }

  const lines: EstimateLine[] = [{ key: "fabric", quantity, unit: unitFabricPrice, amount: unitFabricPrice * quantity }];
  const add = (key: EstimateLine["key"], on: boolean, unit: number, count = quantity) => {
    if (on && unit > 0 && count > 0) lines.push({ key, quantity: count, unit, amount: round(unit * count) });
  };
  const logoType = input.logoType && (LOGO_TYPES as readonly string[]).includes(input.logoType) ? input.logoType : null;
  add("name", input.withNames, pricing.extras.name);
  add("number", input.withNumbers, pricing.extras.number);
  if (logoType) add(`logo_${logoType}` as const, true, logoPrice(pricing, logoType));
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
    logoType,
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

/** Taka per piece for a logo made this way. */
export function logoPrice(pricing: PricingConfig, type: LogoType): number {
  return pricing.extras[`logo_${type}` as const] ?? 0;
}

/** A logo type sent by a form, or null (no logo). */
export function parseLogoType(v: unknown): LogoType | null {
  return typeof v === "string" && (LOGO_TYPES as readonly string[]).includes(v) ? (v as LogoType) : null;
}

/** The advance (30% by default), rounded up to a whole taka. */
export function advanceFor(total: number, pricing: PricingConfig): number {
  return Math.ceil((total * pricing.advance_percent) / 100);
}

/** "M", "BOYS 26", "CUSTOM": the size with its fit, for counts and lists. */
export function sizeLabel(r: Pick<RosterRow, "size" | "fit">): string {
  const size = r.size.trim().toUpperCase();
  return size && r.fit === "boys" ? `BOYS ${size}` : size;
}

/** 'Chest 38" · Length 29" · Sleeve 9"' — empty when no measurements. */
export function measureText(r: Pick<RosterRow, "chest" | "length" | "sleeve_length">): string {
  return [
    r.chest ? `Chest ${r.chest}"` : "",
    r.length ? `Length ${r.length}"` : "",
    r.sleeve_length ? `Sleeve ${r.sleeve_length}"` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** { M: 5, L: 4 } in the usual size order. */
export function sizeSummary(roster: Pick<RosterRow, "size" | "fit">[]): [string, number][] {
  const order = ["XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "CUSTOM"];
  const counts = new Map<string, number>();
  for (const r of roster) {
    const size = sizeLabel(r);
    if (size) counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  // Men first, then boys, then custom.
  const rank = (s: string) => (s.startsWith("BOYS ") ? 100 + Number(s.slice(5)) || 199 : s === "CUSTOM" || s === "BOYS CUSTOM" ? 300 : order.indexOf(s) === -1 ? order.length : order.indexOf(s));
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}
