"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney, type Locale } from "@/i18n";

type Icon = React.ComponentType<{ className?: string }>;

/** Colour pairs that also have dark-mode versions in globals.css. */
export const tones = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  red: "bg-red-100 text-red-700",
} as const;
export type Tone = keyof typeof tones;

export const panel = "bg-surface-card border border-border-light rounded-2xl";

/** Numbers in the reader's digits: ১২ in Bangla, 12 in English. */
export const num = (n: number, locale: Locale) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);

export function Stat({ label, value, icon: I, tone, href }: { label: string; value: string; icon: Icon; tone: Tone; href?: string }) {
  const body = (
    <div className={`${panel} p-4 sm:p-5 flex items-center gap-4 h-full ${href ? "hover:border-accent-gold transition-colors" : ""}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <I className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-primary truncate">{value}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** One line of "this is waiting for you", linking to where it is done. */
export function TaskRow({ text, href, icon: I, tone, action }: { text: string; href: string; icon: Icon; tone: Tone; action: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-subtle transition-colors">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <I className="w-4 h-4" />
      </span>
      <span className="flex-1 text-sm font-medium text-on-surface">{text}</span>
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-accent-gold">
        {action}
        <ChevronRight className="w-4 h-4" />
      </span>
    </Link>
  );
}

export function QuickLink({ label, href, icon: I }: { label: string; href: string; icon: Icon }) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-subtle px-3 py-4 text-center text-sm font-semibold text-on-surface hover:border-accent-gold hover:bg-accent-gold-soft transition-colors">
      <I className="w-6 h-6 text-accent-gold" />
      {label}
    </Link>
  );
}

/** Seven days of sales as stacked bars: website below, shop on top. */
export function WeekBars({ week, locale, labels }: { week: { day: string; website: number; shop: number }[]; locale: Locale; labels: { website: string; shop: string } }) {
  const max = Math.max(1, ...week.map((d) => d.website + d.shop));
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3 h-40">
        {week.map((d) => {
          const total = d.website + d.shop;
          const date = new Date(`${d.day}T00:00:00Z`);
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full min-w-0" title={`${labels.website}: ${formatMoney(d.website, locale)} · ${labels.shop}: ${formatMoney(d.shop, locale)}`}>
              <span className="text-[10px] text-text-muted truncate max-w-full">{total > 0 ? formatMoney(Math.round(total), locale) : ""}</span>
              <div className="flex-1 w-full flex flex-col justify-end gap-0.5">
                {d.shop > 0 && <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(d.shop / max) * 100}%` }} />}
                {d.website > 0 && <div className={`w-full bg-blue-500 ${d.shop > 0 ? "" : "rounded-t"}`} style={{ height: `${(d.website / max) * 100}%` }} />}
                {total === 0 && <div className="w-full h-0.5 bg-border-light" />}
              </div>
              <span className="text-[11px] text-text-muted">{date.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { weekday: "short", timeZone: "UTC" })}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />{labels.website}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />{labels.shop}</span>
      </div>
    </div>
  );
}

export type RangeSlot = { day: string; website: number; shop: number; orders: number };

/**
 * Sales for any date range as stacked bars (website below, shop on top).
 * `day` is "YYYY-MM-DD", or "YYYY-MM" when `monthly`. Many bars scroll sideways.
 */
export function RangeBars({ series, monthly, locale, labels }: { series: RangeSlot[]; monthly: boolean; locale: Locale; labels: { website: string; shop: string; orders: string } }) {
  const max = Math.max(1, ...series.map((d) => d.website + d.shop));
  const loc = locale === "bn" ? "bn-BD" : "en-GB";
  const dense = series.length > 14;
  const label = (d: string) => {
    const date = new Date(monthly ? `${d}-01T00:00:00Z` : `${d}T00:00:00Z`);
    if (monthly) return date.toLocaleDateString(loc, { month: "short", year: "2-digit", timeZone: "UTC" });
    if (series.length <= 7) return date.toLocaleDateString(loc, { weekday: "short", timeZone: "UTC" });
    return date.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const every = dense ? Math.ceil(series.length / 10) : 1;
  return (
    <div>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-end gap-1 sm:gap-2 h-48" style={{ minWidth: dense ? series.length * 14 : undefined }}>
          {series.map((d, i) => {
            const total = d.website + d.shop;
            return (
              <div key={d.day} className="group relative flex-1 flex flex-col items-center gap-1 h-full min-w-0">
                {!dense && <span className="text-[10px] text-text-muted truncate max-w-full">{total > 0 ? formatMoney(Math.round(total), locale) : ""}</span>}
                <div className="flex-1 w-full flex flex-col justify-end gap-0.5">
                  {d.shop > 0 && <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(d.shop / max) * 100}%` }} />}
                  {d.website > 0 && <div className={`w-full bg-blue-500 ${d.shop > 0 ? "" : "rounded-t"}`} style={{ height: `${(d.website / max) * 100}%` }} />}
                  {total === 0 && <div className="w-full h-0.5 bg-border-light" />}
                </div>
                <span className="text-[10px] sm:text-[11px] text-text-muted whitespace-nowrap h-4">{i % every === 0 ? label(d.day) : ""}</span>
                <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 hidden group-hover:block whitespace-nowrap rounded-lg border border-border-light bg-surface-card px-2.5 py-1.5 text-[11px] shadow-lg">
                  <p className="font-semibold text-on-surface">{label(d.day)}</p>
                  <p className="text-blue-600">{labels.website}: {formatMoney(Math.round(d.website), locale)} · {labels.orders}: {num(d.orders, locale)}</p>
                  <p className="text-emerald-600">{labels.shop}: {formatMoney(Math.round(d.shop), locale)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />{labels.website}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />{labels.shop}</span>
      </div>
    </div>
  );
}
