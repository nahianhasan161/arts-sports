"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";

/** Lowest and highest price on offer, on the slider's steps. */
export type PriceRange = { min: number; max: number };
const PRICE_STEP = 50; // as in lib/services/shop-query.ts

/**
 * The two price sliders. They run between the cheapest and the dearest product
 * of the current category, search and team. The list is asked for once the
 * slider has been still for a moment, not on every step.
 * An end left at its limit is reported as null: no limit on that side.
 */
export function PriceFilter({
  range,
  min,
  max,
  onChange,
}: {
  range: PriceRange;
  min?: number;
  max?: number;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const { t, locale } = useT();
  const money = (n: number) => formatMoney(n, locale);
  const clamp = (n: number) => Math.min(range.max, Math.max(range.min, n));
  const low = clamp(min ?? range.min);
  const high = clamp(max ?? range.max);

  const [draft, setDraft] = useState({ low, high });
  // Filters cleared or another category chosen: follow the URL again.
  const [seen, setSeen] = useState({ low, high, range });
  if (seen.low !== low || seen.high !== high || seen.range.min !== range.min || seen.range.max !== range.max) {
    setSeen({ low, high, range });
    setDraft({ low, high });
  }

  useEffect(() => {
    if (draft.low === low && draft.high === high) return;
    const id = setTimeout(
      () => onChange(draft.low > range.min ? draft.low : null, draft.high < range.max ? draft.high : null),
      350
    );
    return () => clearTimeout(id);
  }, [draft, low, high, range.min, range.max, onChange]);

  const slider = "w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary";
  return (
    <div className="pt-2">
      <div className="flex justify-between text-xs font-semibold text-text-muted mb-2">
        <span>{money(range.min)}</span>
        <span>{money(range.max)}</span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={PRICE_STEP}
        value={draft.high}
        onChange={(e) => {
          const high = Math.min(range.max, Math.max(Number(e.target.value), draft.low + PRICE_STEP));
          setDraft({ ...draft, high });
        }}
        aria-label={t("store.shop.ui.maxPrice")}
        aria-valuetext={money(draft.high)}
        className={slider}
      />
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={PRICE_STEP}
        value={draft.low}
        onChange={(e) => {
          const low = Math.max(range.min, Math.min(Number(e.target.value), draft.high - PRICE_STEP));
          setDraft({ ...draft, low });
        }}
        aria-label={t("store.shop.ui.minPrice")}
        aria-valuetext={money(draft.low)}
        className={`${slider} mt-2`}
      />
      <div className="flex items-center justify-between gap-2 mt-3 text-xs">
        <div className="flex-1 bg-surface-subtle px-2 py-1.5 rounded border border-border-light">
          <span className="text-xs text-text-muted block">{t("store.shop.ui.min")}</span>
          <span className="font-bold text-primary">{money(draft.low)}</span>
        </div>
        <span className="text-text-muted">-</span>
        <div className="flex-1 bg-surface-subtle px-2 py-1.5 rounded border border-border-light">
          <span className="text-xs text-text-muted block">{t("store.shop.ui.max")}</span>
          <span className="font-bold text-primary">{money(draft.high)}</span>
        </div>
      </div>
    </div>
  );
}
