"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Globe, Package, Shirt, Store, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney, type Locale } from "@/i18n";
import { api } from "@/components/admin/pos/api";
import { Skeleton } from "@/components/ui/skeleton";
import { panel, tones, type Tone } from "@/components/admin/dashboard/parts";
import type { BusinessReport, Slot } from "@/lib/admin/report";
import { net } from "./math";

type Icon = React.ComponentType<{ className?: string }>;

const REPORT = "/admin/offline/reports";

/** Bangladesh day key, `n` days back. */
function dhakaKey(daysAgo = 0) {
  return new Date(Date.now() + 6 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** One day's numbers, for all shops or one shop. */
function dayNumbers(s: Slot, shop: string, customCountsForShop: boolean) {
  const web = net(s.web);
  const customOnline = net(s.customOnline);
  const customShop = customCountsForShop ? net(s.customShop) : 0;
  const counterM = shop ? s.shops[shop] : null;
  const counter = shop ? (counterM ? counterM.sales - counterM.refunds : 0) : net(s.shop);
  const counterCost = shop ? (counterM?.cost ?? 0) : s.shop.cost;
  const spent = shop ? s.spent.shop : s.spent.both + s.spent.online + s.spent.shop;
  const cost = s.web.cost + s.customOnline.cost + (customCountsForShop ? s.customShop.cost : 0) + counterCost;
  const total = web + customOnline + counter + customShop;
  return {
    total,
    online: web + customOnline,
    offline: counter + customShop,
    custom: customOnline + customShop,
    other: web + counter,
    spent,
    profit: total - cost - spent,
    bills: s.web.count + s.customOnline.count + (shop ? 0 : s.shop.count) + (customCountsForShop ? s.customShop.count : 0),
    paid: s.paid,
  };
}

/**
 * The shop app's home for the owner: today's totals only (online / offline,
 * custom jersey / other products, spendings, profit), a shop picker, and the
 * last 30 days as a chart. Every number opens the full report.
 */
export default function TodaySummary() {
  const { t, locale } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const shop = params.get("shop") ?? "";
  const today = dhakaKey();
  const from = dhakaKey(29);
  const [data, setData] = useState<BusinessReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void api<BusinessReport>(`/api/admin/reports?from=${from}&to=${today}&group=day`).then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [from, today]);

  const money = (v: number) => formatMoney(Math.round(v), locale);
  const count = (v: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(v);

  const view = useMemo(() => {
    if (!data) return null;
    const shops = data.showrooms.filter((s) => s.is_active !== false || data.slots.some((x) => x.shops[s.id]));
    // With one shop, counter custom-jersey orders are that shop's.
    const customCounts = !shop || shops.length === 1;
    const days = data.slots.map((s) => ({ key: s.key, ...dayNumbers(s, shop, customCounts) }));
    const todaySlot = data.slots.find((s) => s.key === today);
    const now = days.find((d) => d.key === today) ?? { key: today, total: 0, online: 0, offline: 0, custom: 0, other: 0, spent: 0, profit: 0, bills: 0, paid: 0 };
    const perShop = shops.map((s) => {
      const m = todaySlot?.shops[s.id];
      return { id: s.id, name: s.name, today: m ? m.sales - m.refunds : 0 };
    });
    return { days, now, perShop, customCounts, allShopsToday: todaySlot ? net(todaySlot.shop) + net(todaySlot.customShop) : 0 };
  }, [data, shop, today]);

  const pickShop = (id: string) => {
    const q = new URLSearchParams(params.toString());
    if (id) q.set("shop", id);
    else q.delete("shop");
    router.replace(`?${q.toString()}`, { scroll: false });
  };

  if (error) return <p className="rounded-xl border border-badge-discount/30 bg-badge-discount/10 p-4 text-sm text-badge-discount">{t("admin.summary.error")} {error}</p>;

  const dayLink = (side?: string) => `${REPORT}?from=${today}&to=${today}${side ? `&side=${side}` : ""}`;
  const todayLabel = new Date(`${today}T00:00:00Z`).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary">{t("admin.summary.title")}</h1>
          <p className="text-sm text-text-muted">{todayLabel}</p>
        </div>
        <Link href={`${REPORT}?from=${from}&to=${today}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-gold hover:underline">
          {t("admin.summary.details")}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {!data || !view ? (
        <div className="space-y-4">
          <Skeleton className="h-12 rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Which shop: today's sales of each */}
          {view.perShop.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
              <ShopChip on={!shop} name={t("admin.summary.allShops")} value={money(view.allShopsToday)} onClick={() => pickShop("")} />
              {view.perShop.map((s) => (
                <ShopChip key={s.id} on={shop === s.id} name={s.name} value={money(s.today)} onClick={() => pickShop(s.id)} />
              ))}
            </div>
          )}

          {/* Today's totals */}
          <Link href={dayLink()} className={`${panel} block p-4 sm:p-5 hover:border-accent-gold transition-colors`}>
            <p className="text-sm text-text-muted">{t("admin.summary.total")}</p>
            <p className="text-3xl sm:text-4xl font-bold text-primary tabular-nums">{money(view.now.total)}</p>
            <p className="text-xs text-text-muted mt-1">{t("admin.summary.bills", { n: count(view.now.bills) })}</p>
          </Link>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Card label={t("admin.summary.online")} value={money(view.now.online)} icon={Globe} tone="blue" href={dayLink("online")} />
            <Card label={t("admin.summary.offline")} value={money(view.now.offline)} icon={Store} tone="green" href={dayLink("shop")} />
            <Card label={t("admin.summary.custom")} value={money(view.now.custom)} icon={Shirt} tone="purple" href={dayLink()} />
            <Card label={t("admin.summary.other")} value={money(view.now.other)} icon={Package} tone="amber" href={dayLink()} />
            <Card label={t("admin.summary.spent")} value={money(view.now.spent)} icon={Wallet} tone="red" href={dayLink()} />
            <Card
              label={t(view.now.profit >= 0 ? "admin.summary.profit" : "admin.summary.loss")}
              value={money(Math.abs(view.now.profit))}
              icon={view.now.profit >= 0 ? TrendingUp : TrendingDown}
              tone={view.now.profit >= 0 ? "green" : "red"}
              href={dayLink()}
              strong
            />
          </div>
          {(!data.expenses.ready || !view.customCounts) && (
            <div className="space-y-1 text-xs text-text-muted">
              {!data.expenses.ready && <p>{t("admin.summary.noSpendTable")}</p>}
              {!view.customCounts && <p>{t("admin.summary.customNote")}</p>}
            </div>
          )}

          {/* 30 days */}
          <section className={`${panel} p-4 sm:p-5`}>
            <div className="mb-3">
              <h2 className="text-base font-bold text-primary">{t("admin.summary.chartTitle")}</h2>
              <p className="text-xs text-text-muted">{t("admin.summary.chartHint")}</p>
            </div>
            <EarnSpendChart days={view.days} locale={locale} money={money} href={`${REPORT}?from=${from}&to=${today}${shop ? "&side=shop" : ""}`} labels={{ earning: t("admin.summary.earning"), spending: t("admin.summary.spending"), profit: t("admin.summary.profitLine"), paid: t("admin.summary.paidSuppliers") }} />
          </section>
        </>
      )}
    </div>
  );
}

function ShopChip({ on, name, value, onClick }: { on: boolean; name: string; value: string; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick} className={`flex-shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${on ? "border-accent-gold bg-accent-gold-soft" : "border-border-light bg-surface-card hover:border-accent-gold"}`}>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
        <Store className="w-3.5 h-3.5 text-text-muted" />
        {name}
      </span>
      <span className="block text-base font-bold text-primary tabular-nums">{value}</span>
    </button>
  );
}

function Card({ label, value, icon: I, tone, href, strong }: { label: string; value: string; icon: Icon; tone: Tone; href: string; strong?: boolean }) {
  return (
    <Link href={href} className={`${panel} p-3 sm:p-4 flex items-center gap-3 hover:border-accent-gold transition-colors`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <I className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-text-muted">{label}</span>
        <span className={`block text-lg sm:text-xl font-bold truncate tabular-nums ${strong ? (tone === "red" ? "text-red-700" : "text-emerald-700") : "text-primary"}`}>{value}</span>
      </span>
    </Link>
  );
}

type Day = { key: string; total: number; spent: number; profit: number; paid: number };

/** Earning and spending per day as paired bars, one ৳ axis, hover for the day's numbers. */
function EarnSpendChart({ days, locale, money, href, labels }: { days: Day[]; locale: Locale; money: (v: number) => string; href: string; labels: { earning: string; spending: string; profit: string; paid: string } }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => Math.max(d.total, d.spent)));
  const step = niceStep(max / 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const totals = days.reduce((a, d) => ({ earn: a.earn + d.total, spend: a.spend + d.spent, profit: a.profit + d.profit }), { earn: 0, spend: 0, profit: 0 });
  const loc = locale === "bn" ? "bn-BD" : "en-GB";
  const short = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" });
  const axis = (v: number) => (v >= 1000 ? `${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(v / 1000)}k` : new Intl.NumberFormat(loc).format(v));
  const h = hover === null ? null : days[hover];

  return (
    <div>
      {/* Legend with the 30-day totals (identity is never colour alone) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-on-surface">
          <span className="w-3 h-3 rounded-sm bg-[#257de0] dark:bg-[#338ced]" />
          {labels.earning} <b className="tabular-nums">{money(totals.earn)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5 text-on-surface">
          <span className="w-3 h-3 rounded-sm bg-[#f47230] dark:bg-[#e76624]" />
          {labels.spending} <b className="tabular-nums">{money(totals.spend)}</b>
        </span>
        <span className="text-text-muted">
          {labels.profit} <b className={`tabular-nums ${totals.profit < 0 ? "text-red-700" : "text-on-surface"}`}>{money(totals.profit)}</b>
        </span>
      </div>

      <Link href={href} className="block" aria-label={labels.earning}>
        <div className="relative flex h-56 sm:h-64">
          {/* y axis labels */}
          <div className="relative w-10 flex-shrink-0 text-[10px] text-text-muted">
            {ticks.map((v) => (
              <span key={v} className="absolute right-1.5 tabular-nums" style={{ bottom: `${(v / top) * 100}%`, transform: "translateY(50%)" }}>
                {axis(v)}
              </span>
            ))}
          </div>
          <div className="relative flex-1" onMouseLeave={() => setHover(null)}>
            {/* recessive grid */}
            {ticks.map((v) => (
              <div key={v} className="absolute inset-x-0 border-t border-border-light" style={{ bottom: `${(v / top) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {days.map((d, i) => (
                <div key={d.key} className={`relative flex-1 h-full flex items-end justify-center gap-[2px] px-[1px] ${hover === i ? "bg-surface-subtle" : ""}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
                  <span className="w-full max-w-[10px] rounded-t-[4px] bg-[#257de0] dark:bg-[#338ced]" style={{ height: `${(Math.max(0, d.total) / top) * 100}%` }} />
                  <span className="w-full max-w-[10px] rounded-t-[4px] bg-[#f47230] dark:bg-[#e76624]" style={{ height: `${(d.spent / top) * 100}%` }} />
                </div>
              ))}
            </div>
            {h && hover !== null && (
              <div className="pointer-events-none absolute z-10 top-0 rounded-lg border border-border-light bg-surface-card px-3 py-2 text-xs shadow-lg" style={hover > days.length / 2 ? { right: `${((days.length - hover - 0.5) / days.length) * 100}%` } : { left: `${((hover + 0.5) / days.length) * 100}%` }}>
                <p className="font-semibold text-on-surface mb-1">{short(h.key)}</p>
                <p className="flex items-center gap-1.5 text-on-surface">
                  <span className="w-2 h-2 rounded-sm bg-[#257de0] dark:bg-[#338ced]" />
                  {labels.earning}: <b className="tabular-nums">{money(h.total)}</b>
                </p>
                <p className="flex items-center gap-1.5 text-on-surface">
                  <span className="w-2 h-2 rounded-sm bg-[#f47230] dark:bg-[#e76624]" />
                  {labels.spending}: <b className="tabular-nums">{money(h.spent)}</b>
                </p>
                <p className="text-text-muted">
                  {labels.profit}: <b className={`tabular-nums ${h.profit < 0 ? "text-red-700" : "text-on-surface"}`}>{money(h.profit)}</b>
                </p>
                {h.paid > 0 && (
                  <p className="text-text-muted">
                    {labels.paid}: <b className="tabular-nums text-on-surface">{money(h.paid)}</b>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        {/* x axis: every 5th day */}
        <div className="flex pl-10 mt-1 text-[10px] text-text-muted">
          {days.map((d, i) => (
            <span key={d.key} className="flex-1 text-center whitespace-nowrap overflow-visible">
              {i % 5 === 0 || i === days.length - 1 ? short(d.key) : ""}
            </span>
          ))}
        </div>
      </Link>
    </div>
  );
}

/** 1, 2 or 5 × a power of ten, at least `raw`. */
function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
