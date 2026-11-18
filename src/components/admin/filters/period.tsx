"use client";

import { useT } from "@/i18n/client";

/** Date windows used by the admin list filters. Days are counted in Dhaka time. */
export const PERIODS = ["all", "today", "yesterday", "7d", "30d", "month"] as const;
export type Period = (typeof PERIODS)[number];

const DAY = 86_400_000;
const DHAKA = 6 * 3_600_000;

/** Start of the Dhaka day that holds `ms`, as a UTC timestamp. */
function dhakaDayStart(ms: number) {
  return Math.floor((ms + DHAKA) / DAY) * DAY - DHAKA;
}

/** ISO from/to for a period (`to` is exclusive); null = no limit. */
export function periodRange(p: Period, now = Date.now()): { from: string | null; to: string | null } {
  const today = dhakaDayStart(now);
  const iso = (ms: number) => new Date(ms).toISOString();
  switch (p) {
    case "today":
      return { from: iso(today), to: null };
    case "yesterday":
      return { from: iso(today - DAY), to: iso(today) };
    case "7d":
      return { from: iso(today - 6 * DAY), to: null };
    case "30d":
      return { from: iso(today - 29 * DAY), to: null };
    case "month": {
      const d = new Date(now + DHAKA);
      return { from: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - DHAKA), to: null };
    }
    default:
      return { from: null, to: null };
  }
}

/** ISO from/to for picked Dhaka dates (YYYY-MM-DD, both days included; `to` returned exclusive). */
export function dateRange(fromDay: string, toDay: string): { from: string | null; to: string | null } {
  const ms = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) - DHAKA : NaN);
  const f = ms(fromDay);
  const t = ms(toDay);
  return {
    from: Number.isNaN(f) ? null : new Date(f).toISOString(),
    to: Number.isNaN(t) ? null : new Date(t + DAY).toISOString(),
  };
}

/** The Dhaka calendar day (YYYY-MM-DD) `offset` days from the day holding `now`. */
export function dhakaDay(offset = 0, now = Date.now()) {
  return new Date(dhakaDayStart(now) + DHAKA + offset * DAY).toISOString().slice(0, 10);
}

/** A period as picked Dhaka days (both included); "" = no limit. */
export function periodDays(p: Period, now = Date.now()): { from: string; to: string } {
  const today = dhakaDay(0, now);
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: dhakaDay(-1, now), to: dhakaDay(-1, now) };
    case "7d":
      return { from: dhakaDay(-6, now), to: today };
    case "30d":
      return { from: dhakaDay(-29, now), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    default:
      return { from: "", to: "" };
  }
}

/** Which period, if any, a picked from/to range is the same as. */
export function matchPeriod(from: string, to: string, now = Date.now()): Period | null {
  return PERIODS.find((p) => {
    const d = periodDays(p, now);
    return d.from === from && d.to === to;
  }) ?? null;
}

/** Move a picked range by its own length (−1 = earlier, +1 = later). Empty ends stay empty. */
export function shiftDays(from: string, to: string, dir: -1 | 1): { from: string; to: string } {
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  if (!from || !to) return { from, to };
  const len = Math.round((ms(to) - ms(from)) / DAY) + 1;
  const move = (d: string) => new Date(ms(d) + dir * len * DAY).toISOString().slice(0, 10);
  return { from: move(from), to: move(to) };
}

/** True when an ISO date falls inside the period. */
export function inPeriod(iso: string | null | undefined, p: Period) {
  if (p === "all") return true;
  if (!iso) return false;
  const { from, to } = periodRange(p);
  const t = new Date(iso).getTime();
  return (!from || t >= new Date(from).getTime()) && (!to || t < new Date(to).getTime());
}

/** A <select> of the date windows. With `custom`, it also offers "Custom range". */
export function PeriodSelect<P extends string = Period>({
  value,
  onChange,
  className,
  custom,
}: {
  value: P;
  onChange: (p: P) => void;
  className?: string;
  custom?: boolean;
}) {
  const { t } = useT();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as P)} className={className} aria-label={t("shop.filters.period")}>
      {PERIODS.map((p) => (
        <option key={p} value={p}>
          {t(`shop.filters.periods.${p}`)}
        </option>
      ))}
      {custom && <option value="custom">{t("shop.filters.periods.custom")}</option>}
    </select>
  );
}

/** Two date boxes (from / to) for a custom range. */
export function DateRangeInputs({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}) {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-1">
      <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className={className} aria-label={t("shop.filters.from")} />
      <span className="text-text-muted text-xs">–</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className={className} aria-label={t("shop.filters.to")} />
    </span>
  );
}
