"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { Count, Tick, rowClass } from "@/components/shop/CategoryTree";
import type { PriceBand } from "@/lib/services/shop-query";

type T = ReturnType<typeof useT>["t"];

/**
 * How a price filter reads: "Under ৳1,000", "৳1,000 – ৳2,000", "৳2,000 and up".
 * A ready-made range (`band`) ends one taka below a round number (999, so
 * 1,000 is not counted twice) and is shown as that round number; a range the
 * shopper typed is shown as typed.
 */
export function priceText(t: T, locale: Parameters<typeof formatMoney>[1], min?: number, max?: number, band = false): string {
  const money = (n: number) => formatMoney(n, locale);
  const end = band && max !== undefined ? max + 1 : max;
  if (min !== undefined && end !== undefined) return t("store.shop.ui.between", { from: money(min), to: money(end) });
  if (end !== undefined) return end === max ? t("store.shop.ui.upTo", { price: money(end) }) : t("store.shop.ui.under", { price: money(end) });
  if (min !== undefined) return t("store.shop.ui.andUp", { price: money(min) });
  return "";
}

/**
 * Price: a few ready-made ranges with how many products each has, and two
 * boxes for a range of one's own. A second tap on the chosen range clears it.
 */
export function PriceFilter({
  bands,
  min,
  max,
  onChange,
}: {
  bands: PriceBand[];
  min?: number;
  max?: number;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const { t, locale } = useT();
  const isBand = bands.some((b) => b.min === min && b.max === max);
  const [low, setLow] = useState(!isBand && min !== undefined ? String(min) : "");
  const [high, setHigh] = useState(!isBand && max !== undefined ? String(max) : "");

  // The URL changed elsewhere (a chip removed, filters cleared): follow it.
  const [seen, setSeen] = useState({ min, max });
  if (seen.min !== min || seen.max !== max) {
    setSeen({ min, max });
    setLow(!isBand && min !== undefined ? String(min) : "");
    setHigh(!isBand && max !== undefined ? String(max) : "");
  }

  const toNumber = (v: string) => (v.trim() && Number(v) >= 0 ? Math.round(Number(v)) : null);
  const box =
    "w-full min-w-0 min-h-11 md:min-h-9 rounded-md border border-border-light bg-surface-subtle px-2 text-sm tabular-nums text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="flex flex-col gap-1">
      {bands.map((b) => {
        const on = b.min === min && b.max === max;
        return (
          <button
            key={`${b.min}-${b.max}`}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => (on ? onChange(null, null) : onChange(b.min ?? null, b.max ?? null))}
            className={rowClass(on)}
          >
            <Tick on={on} round />
            <span className="truncate">{priceText(t, locale, b.min, b.max, true)}</span>
            <Count n={b.count} />
          </button>
        );
      })}
      <form
        className="mt-1 flex items-center gap-1.5"
        aria-label={t("store.shop.ui.customPrice")}
        onSubmit={(e) => {
          e.preventDefault();
          let a = toNumber(low);
          let b = toNumber(high);
          if (a !== null && b !== null && a > b) [a, b] = [b, a];
          onChange(a, b);
        }}
      >
        <input inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value.replace(/\D/g, ""))} placeholder={t("store.shop.ui.min")} aria-label={t("store.shop.ui.minPrice")} className={box} />
        <span className="text-text-muted" aria-hidden>–</span>
        <input inputMode="numeric" value={high} onChange={(e) => setHigh(e.target.value.replace(/\D/g, ""))} placeholder={t("store.shop.ui.max")} aria-label={t("store.shop.ui.maxPrice")} className={box} />
        <button type="submit" className="sp-btn sp-board shrink-0 min-h-11 md:min-h-9 px-3 text-xs font-bold">
          {t("store.shop.ui.go")}
        </button>
      </form>
    </div>
  );
}
