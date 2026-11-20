import { daysUntil, discountFor, fabricTierPrice, optionName, resolveChoice, type ChosenOptions, type EstimateLine } from "./pricing";
import type { Fabric, JerseyOption, OrderItem, PricingConfig, RosterRow } from "./types";

/**
 * Orders with several designs (custom_orders.items). Shared by the POS panel
 * (live estimate) and the server (which prices the order again from its own lists).
 *
 *   per design   fabric price per jersey (the fabric's own price for the order's
 *                total pieces when it has tiers)
 *              + sleeve per player (half / full option price)
 *              + collar, extras (names, numbers...), logo per jersey
 *              + pant style price per player with a pant size
 *   order        quantity discount (%) by the order's total pieces, on everything
 *                except fabric that already has its own quantity price;
 *                never below `min_per_piece` on average
 *              + urgent charge
 */

export const MAX_ITEMS = 12;

export interface ItemEstimate {
  id: string;
  title: string;
  pieces: number;
  pants: number;
  fullSleeves: number;
  lines: EstimateLine[];
  subtotal: number;
  /** The option picks with their names and prices as priced (null for a pant-only design). */
  choices: ChosenOptions | null;
  pant: JerseyOption | null;
}

export interface OrderEstimate {
  quantity: number;
  items: ItemEstimate[];
  /** Sum of the designs, before the discount. */
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  isRush: boolean;
  tooSoon: boolean;
  rushAmount: number;
  total: number;
  perPiece: number;
}

const round = (n: number) => Math.round(n);

/** Rows that get a pant: every row of a pant-only design, else rows with a pant size. */
export const hasPant = (item: Pick<OrderItem, "jersey">, r: Pick<RosterRow, "pant_size">) => !item.jersey || Boolean(r.pant_size);

export function estimateOrder(
  input: { items: { item: OrderItem; rows: RosterRow[] }[]; fabrics: Fabric[]; neededBy?: string | null; today?: Date },
  pricing: PricingConfig
): OrderEstimate {
  const opts = pricing.options;
  const quantity = input.items.reduce((n, x) => n + x.rows.length, 0);
  let tieredFabric = 0;
  const items: ItemEstimate[] = [];

  for (const { item, rows } of input.items) {
    const pieces = rows.length;
    const lines: EstimateLine[] = [];
    const line = (key: EstimateLine["key"], count: number, unit: number, o?: { name_en: string; name_bn?: string | null }) => {
      if (count > 0 && unit > 0) lines.push({ key, quantity: count, unit, amount: round(unit * count), ...(o ? { name: o.name_en, name_bn: o.name_bn ?? null } : {}) });
    };
    let choices: ChosenOptions | null = null;
    let fullSleeves = 0;

    if (item.jersey && pieces > 0) {
      const fabric = input.fabrics.find((f) => f.id === item.fabric_id);
      if (fabric) {
        const tier = fabricTierPrice(fabric.price_per_piece, fabric.price_tiers, quantity);
        const unit = round(tier ?? fabric.price_per_piece);
        line("fabric", pieces, unit, { name_en: fabric.name_en, name_bn: fabric.name_bn });
        if (tier !== null) tieredFabric += unit * pieces;
      }
      const r = resolveChoice(item.choice, opts, item.jersey_type);
      choices = r.chosen;
      // Sleeve per player: full rows pay the full-sleeve option, half rows the half one.
      const picked = r.chosen.sleeve;
      const full = picked?.full ? picked : (opts.sleeves.find((o) => o.full) ?? null);
      const half = picked && !picked.full ? picked : (opts.sleeves.find((o) => !o.full) ?? null);
      fullSleeves = rows.filter((x) => x.sleeve === "full").length;
      if (full) line(`opt_sleeve_${full.id}`, fullSleeves, full.price, full);
      if (half) line(`opt_sleeve_${half.id}`, pieces - fullSleeves, half.price, half);
      if (r.chosen.collar) line(`opt_collar_${r.chosen.collar.id}`, pieces, r.chosen.collar.price, r.chosen.collar);
      for (const x of r.chosen.extras) line(`opt_extra_${x.id}`, pieces, x.price, x);
      if (r.chosen.logo) line(`opt_logo_${r.chosen.logo.id}`, pieces, r.chosen.logo.price, r.chosen.logo);
    }

    const pant = item.pant?.option ? (opts.pants.find((o) => o.id === item.pant!.option) ?? null) : null;
    const pants = pant ? rows.filter((x) => hasPant(item, x)).length : 0;
    if (pant) line(`opt_pant_${pant.id}`, pants, pant.price, pant);

    items.push({ id: item.id, title: item.title, pieces, pants, fullSleeves, lines, subtotal: lines.reduce((s, l) => s + l.amount, 0), choices, pant });
  }

  const subtotal = items.reduce((s, x) => s + x.subtotal, 0);
  const discountPercent = discountFor(quantity, pricing);
  let discountAmount = round(((subtotal - tieredFabric) * discountPercent) / 100);
  // The discount stops at the lowest price per piece.
  if (pricing.min_per_piece > 0) discountAmount = Math.max(0, Math.min(discountAmount, subtotal - pricing.min_per_piece * quantity));
  const afterDiscount = subtotal - discountAmount;

  let isRush = false;
  let tooSoon = false;
  if (input.neededBy && /^\d{4}-\d{2}-\d{2}$/.test(input.neededBy)) {
    const days = daysUntil(input.neededBy, input.today);
    tooSoon = days < pricing.rush.min_days;
    isRush = days < pricing.rush.normal_days;
  }
  const rushAmount = isRush ? round((afterDiscount * pricing.rush.percent) / 100) : 0;
  const total = afterDiscount + rushAmount;
  return { quantity, items, subtotal, discountPercent, discountAmount, isRush, tooSoon, rushAmount, total, perPiece: quantity ? round(total / quantity) : 0 };
}

/** "Mesh · Polo · Full sleeve · Names · Logo: DTF · Pant: Short pant" for one design. */
export function itemSummary(item: OrderItem, est: ItemEstimate | undefined, locale: string, t: (k: string) => string): string {
  const name = (o: { name_en: string; name_bn?: string | null } | null | undefined) => (o ? optionName(o, locale) : "");
  const c = est?.choices;
  return [
    item.jersey ? item.fabric_name : t("shop.customReg.pantOnly"),
    item.jersey ? t(item.jersey_type === "polo" ? "customJersey.options.poloName" : "customJersey.options.tshirtName") : "",
    est && est.fullSleeves > 0 ? `${t("customJersey.options.full")} ×${est.fullSleeves}` : "",
    name(c?.collar),
    ...(c?.extras ?? []).map(name),
    c?.logo ? `${t("customJersey.options.logo")}: ${name(c.logo)}` : "",
    est?.pant ? `${t("shop.customReg.pant")}: ${name(est.pant)} ×${est.pants}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
