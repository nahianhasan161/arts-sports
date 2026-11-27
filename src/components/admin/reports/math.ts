import type { BusinessReport, Channel, Money, Slot } from "@/lib/admin/report";
import type { ExpensePlace } from "@/lib/admin/expenses";

/** Which half of the business the report shows. */
export type Side = "all" | "online" | "shop";

export const SIDE_CHANNELS: Record<Side, Channel[]> = {
  all: ["web", "shop", "customOnline", "customShop"],
  online: ["web", "customOnline"],
  shop: ["shop", "customShop"],
};

/** Spendings marked "both" are only counted when the whole business is shown. */
export const SIDE_PLACES: Record<Side, ExpensePlace[]> = {
  all: ["both", "online", "shop"],
  online: ["online"],
  shop: ["shop"],
};

export const zeroMoney = (): Money => ({ count: 0, sales: 0, refunds: 0, cost: 0, missingCost: 0, delivery: 0, received: 0 });

export function sumMoney(list: Money[]): Money {
  const out = zeroMoney();
  for (const m of list) for (const k of Object.keys(out) as (keyof Money)[]) out[k] += m[k];
  return out;
}

export const net = (m: Money) => m.sales - m.refunds;
export const profit = (m: Money) => net(m) - m.cost;
export const marginPct = (m: Money) => (net(m) > 0 ? Math.round((profit(m) / net(m)) * 100) : 0);

export const slotSpent = (s: Slot, side: Side) => SIDE_PLACES[side].reduce((sum, p) => sum + s.spent[p], 0);

/** The headline numbers for one side of the business. */
export function headline(r: BusinessReport, side: Side) {
  const m = sumMoney(SIDE_CHANNELS[side].map((c) => r.totals[c]));
  const spent = r.slots.reduce((sum, s) => sum + slotSpent(s, side), 0);
  const sales = net(m);
  const gross = profit(m);
  const noCostPieces = SIDE_CHANNELS[side].filter((c) => c === "web" || c === "shop").reduce((s, c) => s + r.totals[c].missingCost, 0);
  const noMaking = SIDE_CHANNELS[side].filter((c) => c === "customOnline" || c === "customShop").reduce((s, c) => s + r.totals[c].missingCost, 0);
  return {
    money: m,
    sales,
    cost: m.cost,
    gross,
    spent,
    profit: gross - spent,
    received: m.received,
    toCollect: Math.max(0, sales + m.delivery - m.received),
    noCostPieces,
    noMaking,
  };
}
