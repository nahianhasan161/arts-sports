import { DEFAULT_PRICING, JERSEY_TYPES, LOGO_TYPES, type Collar, type CollarOption, type ExtraOption, type FabricPriceTier, type JerseyOption, type JerseyOptions, type LogoType, type OptionChoice, type PricingConfig, type RosterRow, type Sleeve, type SizeOption, type SleeveOption } from "./types";

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
  /**
   * Picks from the staff-managed option lists (POS panel). When given, these
   * price the sleeve, collar, extras and logo, and the fixed extras above
   * (names, numbers, shorts, logo type, full sleeve, polo collar) are not used.
   */
  choice?: OptionChoice | null;
}

export interface EstimateLine {
  /** "logo" only appears in orders saved before logo types. */
  key: "fabric" | "name" | "number" | "logo" | `logo_${LogoType}` | "full_sleeve" | "shorts" | "polo_collar" | "rush" | `opt_${string}`;
  quantity: number;
  unit: number;
  amount: number;
  /** Option lines (`opt_<group>_<id>`): the option's name when it was priced, en / bn. */
  name?: string;
  name_bn?: string | null;
}

/** The options an order picked, with names and prices as they were (kept in estimate_breakdown.choices). */
export interface ChosenOptions {
  sleeve: (SleeveOption & { price: number }) | null;
  collar: CollarOption | null;
  extras: ExtraOption[];
  logo: JerseyOption | null;
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
  /** Set when the estimate was made from option picks (EstimateInput.choice). */
  choices?: ChosenOptions;
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
  const base: Omit<PricingConfig, "options"> = {
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
    min_per_piece: num(r.min_per_piece, d.min_per_piece),
  };
  return { ...base, options: normalizeOptions(r.options, base.extras) };
}

const MAX_OPTIONS = 40;
const optText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const optPrice = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : 0;
};
const optInches = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 4 && n <= 80 ? Math.round(n * 2) / 2 : null;
};
/** A short id for a new option ("opt-3f9a1c"). */
export const newOptionId = () => `opt-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The first time (no saved lists) the lists start from the old fixed choices and
 * their prices, so nothing changes until staff edit them. After that the saved
 * lists are used as they are (an empty list stays empty).
 */
function seedOptions(x: PricingConfig["extras"]): JerseyOptions {
  return {
    sleeves: [
      { id: "short", name_en: "Half sleeve", name_bn: "হাফ হাতা", price: 0, full: false },
      { id: "full", name_en: "Full sleeve", name_bn: "ফুল হাতা", price: x.full_sleeve, full: true },
    ],
    collars: [
      { id: "round", name_en: "Round neck", name_bn: "গোল গলা", price: 0, type: "round" },
      { id: "polo", name_en: "Polo collar", name_bn: "পোলো কলার", price: x.polo_collar, type: "polo" },
    ],
    extras: [
      { id: "names", name_en: "Names", name_bn: "নাম", price: x.name, means: "names" },
      { id: "numbers", name_en: "Numbers", name_bn: "নম্বর", price: x.number, means: "numbers" },
      { id: "shorts", name_en: "Shorts", name_bn: "শর্টস", price: x.shorts, means: "shorts" },
    ],
    logos: [
      { id: "print", name_en: "Printed", name_bn: "প্রিন্ট", price: x.logo_print },
      { id: "dtf", name_en: "DTF", name_bn: "ডিটিএফ", price: x.logo_dtf },
      { id: "silicon", name_en: "Silicon", name_bn: "সিলিকন", price: x.logo_silicon },
      { id: "embroidery", name_en: "Embroidery", name_bn: "এমব্রয়ডারি", price: x.logo_embroidery },
    ],
    // Starting measurements (chest / length, inches); staff change or delete them.
    sizes: [
      ["S", 36, 26],
      ["M", 38, 27],
      ["L", 40, 28],
      ["XL", 42, 29],
      ["2XL", 44, 30],
      ["3XL", 46, 31],
    ].map(([label, chest, length]) => ({ id: String(label).toLowerCase(), label: String(label), chest: Number(chest), length: Number(length) })),
    pants: seedPants(x),
  };
}

/** Starting pant styles (placeholder prices; staff change them in the POS panel). */
function seedPants(x: PricingConfig["extras"]): JerseyOption[] {
  return [
    { id: "short-pant", name_en: "Short pant", name_bn: "শর্ট প্যান্ট", price: x.shorts },
    { id: "trouser", name_en: "Trouser", name_bn: "ট্রাউজার", price: x.shorts + 150 },
  ];
}

/** Clean option lists from the browser or the stored JSON: unique ids, sane names and prices. */
export function normalizeOptions(raw: unknown, extras: PricingConfig["extras"] = DEFAULT_PRICING.extras): JerseyOptions {
  if (!raw || typeof raw !== "object") return seedOptions(extras);
  const r = raw as Partial<Record<keyof JerseyOptions, unknown>>;
  const list = <T,>(v: unknown, make: (o: Record<string, unknown>) => T | null): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of Array.isArray(v) ? v.slice(0, MAX_OPTIONS) : []) {
      const o = (item ?? {}) as Record<string, unknown>;
      const made = make(o);
      const id = (made as { id?: string } | null)?.id;
      if (!made || !id || seen.has(id)) continue;
      seen.add(id);
      out.push(made);
    }
    return out;
  };
  const id = (o: Record<string, unknown>) => optText(o.id, 40).replace(/[^\w-]/g, "") || newOptionId();
  const base = (o: Record<string, unknown>): JerseyOption | null => {
    const name_en = optText(o.name_en, 60);
    const name_bn = optText(o.name_bn, 60) || null;
    if (!name_en && !name_bn) return null;
    return { id: id(o), name_en: name_en || name_bn!, name_bn, price: optPrice(o.price) };
  };
  return {
    sleeves: list(r.sleeves, (o) => {
      const b = base(o);
      return b ? { ...b, full: o.full === true } : null;
    }),
    collars: list(r.collars, (o) => {
      const b = base(o);
      return b ? { ...b, type: o.type === "polo" ? "polo" : "round" } : null;
    }),
    extras: list(r.extras, (o) => {
      const b = base(o);
      return b ? { ...b, means: o.means === "names" || o.means === "numbers" || o.means === "shorts" ? o.means : null } : null;
    }),
    logos: list(r.logos, base),
    sizes: list(r.sizes, (o): SizeOption | null => {
      const label = optText(o.label, 12).toUpperCase();
      return label ? { id: id(o), label, chest: optInches(o.chest), length: optInches(o.length) } : null;
    }),
    // Lists saved before pants existed start with the seeded pant styles.
    pants: r.pants === undefined ? seedPants(extras) : list(r.pants, base),
  };
}

/** The display name of an option in the reader's language. */
export const optionName = (o: { name_en: string; name_bn?: string | null }, locale: string) => (locale === "bn" && o.name_bn ? o.name_bn : o.name_en);

/**
 * Looks up the picked ids in the lists. Unknown ids are dropped; a collar for the
 * other jersey type is dropped too. Returns what the order columns need as well.
 */
export function resolveChoice(choice: OptionChoice, options: JerseyOptions, jerseyType: (typeof JERSEY_TYPES)[number]) {
  const sleeve = options.sleeves.find((o) => o.id === choice.sleeve) ?? null;
  const collar = options.collars.find((o) => o.id === choice.collar && o.type === jerseyType) ?? null;
  const ids = new Set(choice.extras);
  const extras = options.extras.filter((o) => ids.has(o.id));
  const logo = options.logos.find((o) => o.id === choice.logo) ?? null;
  const chosen: ChosenOptions = { sleeve, collar, extras, logo };
  return {
    chosen,
    sleeve: (sleeve?.full ? "full" : "short") as Sleeve,
    collar: (jerseyType === "polo" ? "polo" : "round") as Collar,
    withNames: extras.some((e) => e.means === "names"),
    withNumbers: extras.some((e) => e.means === "numbers"),
    withShorts: extras.some((e) => e.means === "shorts"),
    withLogo: Boolean(logo),
    /** The logo's type when its id is one of the old types (print/dtf/...), for logoTypeOf(). */
    logoType: logo && (LOGO_TYPES as readonly string[]).includes(logo.id) ? (logo.id as LogoType) : null,
  };
}

/** A choice sent by a browser, cleaned (ids only). */
export function parseChoice(raw: unknown): OptionChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const one = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 40) : null);
  return { sleeve: one(r.sleeve), collar: one(r.collar), extras: Array.isArray(r.extras) ? r.extras.map(one).filter((v): v is string => Boolean(v)).slice(0, MAX_OPTIONS) : [], logo: one(r.logo) };
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
  let logoType = input.logoType && (LOGO_TYPES as readonly string[]).includes(input.logoType) ? input.logoType : null;
  let choices: ChosenOptions | undefined;
  if (input.choice) {
    // Option lists: every picked option with a price adds a line for all pieces.
    const r = resolveChoice(input.choice, pricing.options, input.collar === "polo" ? "polo" : "round");
    choices = r.chosen;
    logoType = r.logoType;
    const addOpt = (group: string, o: JerseyOption | null) => {
      if (o && o.price > 0) lines.push({ key: `opt_${group}_${o.id}`, quantity, unit: o.price, amount: round(o.price * quantity), name: o.name_en, name_bn: o.name_bn });
    };
    addOpt("sleeve", r.chosen.sleeve);
    addOpt("collar", r.chosen.collar);
    for (const x of r.chosen.extras) addOpt("extra", x);
    addOpt("logo", r.chosen.logo);
  } else {
    add("name", input.withNames, pricing.extras.name);
    add("number", input.withNumbers, pricing.extras.number);
    if (logoType) add(`logo_${logoType}` as const, true, logoPrice(pricing, logoType));
    add("full_sleeve", fullSleeves > 0, pricing.extras.full_sleeve, fullSleeves);
    add("shorts", input.withShorts, pricing.extras.shorts);
    add("polo_collar", input.collar === "polo", pricing.extras.polo_collar);
  }

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
    ...(choices ? { choices } : {}),
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

/** The quickest a jersey is normally made. The slowest is the admin setting `rush.normal_days`. */
const FASTEST_DAYS = 4;

/** "4–6": the normal making time, the one figure every page shows. `num` writes the digits. */
export function makingDays(normalDays: number, num: (n: number) => string = String): string {
  return normalDays > FASTEST_DAYS ? `${num(FASTEST_DAYS)}–${num(normalDays)}` : num(normalDays);
}
