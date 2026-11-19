"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, ExternalLink, Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { readUrlParam, writeUrlParams } from "@/lib/url-state";
import { DateRangeInputs, dateRange, dhakaDay, matchPeriod, periodDays, shiftDays } from "@/components/admin/filters/period";
import {
  LINE_KINDS,
  METHOD_BG,
  METHOD_FILL,
  REPORT_METHODS,
  buckets,
  isReceived,
  methodTotals,
  type Bucket,
  type CashLine,
  type CashReport as Report,
  type LineKind,
  type ReportMethod,
} from "@/lib/pos/cash-report";
import { api, btnGhost, card, dateTime, field } from "./api";

const QUICK = ["today", "yesterday", "7d", "30d", "month", "all"] as const;
const PAGE = 100;

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-surface-card border-border-light text-on-surface hover:bg-surface-subtle"}`;

const isMethod = (v: string | null): v is ReportMethod => REPORT_METHODS.includes(v as ReportMethod);
const isKind = (v: string | null): v is LineKind => LINE_KINDS.includes(v as LineKind);
const shortTaka = (n: number) => (Math.abs(n) >= 100_000 ? `৳${(n / 100_000).toFixed(n % 100_000 ? 1 : 0)}L` : Math.abs(n) >= 1000 ? `৳${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `৳${Math.round(n)}`);

/** Where a line's receipt / order / supplier opens. */
function lineHref(l: CashLine) {
  if (!l.ref_id) return null;
  if (l.kind === "sale" || l.kind === "refund") return `/admin/offline/pos/receipt/${l.ref_id}`;
  if (l.kind === "custom") return `/admin/offline/pos/custom-receipt/${l.ref_id}`;
  if (l.kind === "supplier") return `/admin/offline/suppliers/${l.ref_id}`;
  return null;
}

/**
 * Money report for the shop: what came in and went out by cash / bKash / Nagad / card / bank,
 * a day-by-day chart, every money line with filters, and the closed drawer days.
 * Filters live in the page link so a reload or a shared link shows the same view.
 */
export function CashReport() {
  const { t } = useT();
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const f = readUrlParam("from");
    const to = readUrlParam("to");
    return f === "all" ? { from: "", to: "" } : f || to ? { from: f ?? "", to: to ?? "" } : periodDays("7d");
  });
  const [showroom, setShowroom] = useState(() => readUrlParam("shop") ?? "");
  const [staff, setStaff] = useState(() => readUrlParam("staff") ?? "");
  const [method, setMethod] = useState<ReportMethod | "">(() => {
    const m = readUrlParam("method");
    return isMethod(m) ? m : "";
  });
  const [kind, setKind] = useState<LineKind | "">(() => {
    const k = readUrlParam("kind");
    return isKind(k) ? k : "";
  });
  const [q, setQ] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = dateRange(range.from, range.to);
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (showroom) p.set("showroom", showroom);
    if (staff) p.set("staff", staff);
    const res = await api<Report>(`/api/admin/pos/cash-report?${p}`);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
    setShown(PAGE);
  }, [range.from, range.to, showroom, staff]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const isAll = !range.from && !range.to;
    writeUrlParams({ from: isAll ? "all" : range.from, to: range.to, shop: showroom, staff, method, kind });
  }, [range, showroom, staff, method, kind]);

  const shopName = useMemo(() => new Map((data?.showrooms ?? []).map((s) => [s.id, s.name])), [data]);

  // Everything but the method filter (the method cards show every method), then the method.
  const byOthers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.lines ?? []).filter(
      (l) => (!kind || l.kind === kind) && (!needle || [l.ref, l.label, l.staff].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [data, kind, q]);
  const lines = useMemo(() => (method ? byOthers.filter((l) => l.method === method) : byOthers), [byOthers, method]);
  const perMethod = useMemo(() => methodTotals(byOthers).filter((m) => m.count > 0), [byOthers]);

  const totals = useMemo(() => {
    let received = 0;
    let refunds = 0;
    let paidOut = 0;
    let cashIn = 0;
    for (const l of lines) {
      if (isReceived(l)) received += l.amount;
      else if (l.kind === "refund") refunds += -l.amount;
      else if (l.kind === "cash_in") cashIn += l.amount;
      else paidOut += -l.amount;
    }
    return { received, refunds, paidOut, cashIn, net: received - refunds - paidOut + cashIn };
  }, [lines]);

  const chart = useMemo(() => buckets(lines, range.from, range.to), [lines, range.from, range.to]);

  const active = matchPeriod(range.from, range.to);
  const today = dhakaDay();
  const canShift = Boolean(range.from && range.to);
  const laterBlocked = !canShift || range.to >= today;
  const filtered = Boolean(method || kind || q || staff || showroom);

  function clearFilters() {
    setMethod("");
    setKind("");
    setQ("");
    setStaff("");
    setShowroom("");
  }

  function exportCsv() {
    const cell = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = [t("shop.cashReport.col.time"), t("shop.cashReport.col.type"), t("shop.cashReport.col.method"), t("shop.cashReport.col.ref"), t("shop.cashReport.col.detail"), t("shop.common.staff"), t("shop.cashReport.col.shop"), t("shop.common.amount")];
    const rows = lines.map((l) => [dateTime(l.at), t(`shop.cashReport.kind.${l.kind}`), t(`shop.method.${l.method}`), l.ref, l.label, l.staff, l.showroom_id ? shopName.get(l.showroom_id) : "", l.amount]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `cash-${range.from || "all"}-${range.to || "now"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className={`${card} p-3 sm:p-4 flex flex-col gap-3`}>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CalendarDays className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
            <button type="button" className={`${btnGhost} px-2`} disabled={!canShift} onClick={() => setRange(shiftDays(range.from, range.to, -1))} aria-label={t("shop.sales.earlier")} title={t("shop.sales.earlier")}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <DateRangeInputs from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} className={`${field} w-[9.5rem]`} />
            <button type="button" className={`${btnGhost} px-2`} disabled={laterBlocked} onClick={() => setRange(shiftDays(range.from, range.to, 1))} aria-label={t("shop.sales.later")} title={t("shop.sales.later")}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((p) => (
              <button key={p} type="button" className={chip(active === p)} onClick={() => setRange(periodDays(p))}>
                {t(`shop.filters.periods.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.cashReport.search")} className={`${field} pl-8`} />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value as LineKind | "")} className={field} aria-label={t("shop.cashReport.col.type")}>
            <option value="">{t("shop.cashReport.allTypes")}</option>
            {LINE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`shop.cashReport.kind.${k}`)}
              </option>
            ))}
          </select>
          {(data?.showrooms.length ?? 0) > 1 && (
            <select value={showroom} onChange={(e) => setShowroom(e.target.value)} className={field} aria-label={t("shop.cashReport.col.shop")}>
              <option value="">{t("shop.cashReport.allShops")}</option>
              {data!.showrooms.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {data?.can_manage && (
            <select value={staff} onChange={(e) => setStaff(e.target.value)} className={field} aria-label={t("shop.common.staff")}>
              <option value="">{t("shop.cashReport.allStaff")}</option>
              {data.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className={btnGhost} onClick={exportCsv} disabled={!lines.length}>
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chip(method === "")} onClick={() => setMethod("")}>
            {t("shop.cashReport.allMethods")}
          </button>
          {perMethod.map((m) => (
            <button key={m.method} type="button" className={`${chip(method === m.method)} inline-flex items-center gap-1.5`} onClick={() => setMethod(method === m.method ? "" : m.method)}>
              <span className={`w-2.5 h-2.5 rounded-sm ${METHOD_BG[m.method]}`} aria-hidden />
              {t(`shop.method.${m.method}`)}
            </button>
          ))}
          {filtered && (
            <button type="button" className="text-xs text-text-muted hover:text-on-surface inline-flex items-center gap-1 ml-auto" onClick={clearFilters}>
              <X className="w-3.5 h-3.5" /> {t("shop.filters.clear")}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3">{error}</p>}
      {data?.truncated && <p className="text-sm bg-accent-gold-soft text-on-surface rounded p-3">{t("shop.cashReport.truncated")}</p>}

      {!data ? (
        <div className={`${card} p-6 text-sm text-text-muted`}>{t("shop.common.loading")}</div>
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {/* Headline totals */}
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              [t("shop.cashReport.received"), totals.received, t("shop.cashReport.receivedHint")],
              [t("shop.cashReport.refunds"), -totals.refunds, null],
              [t("shop.cashReport.paidOut"), -totals.paidOut, t("shop.cashReport.paidOutHint")],
              [t("shop.cashReport.net"), totals.net, totals.cashIn ? t("shop.cashReport.netHint", { amount: taka(totals.cashIn) }) : null],
            ].map(([label, value, hint]) => (
              <div key={label as string} className={`${card} p-3`}>
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="font-display font-bold text-xl tabular-nums">{(value as number) < 0 ? `−${taka(-(value as number))}` : taka(value as number)}</dd>
                {hint && <p className="text-[11px] text-text-muted leading-tight mt-0.5">{hint}</p>}
              </div>
            ))}
          </dl>

          {/* Per method: where the money is */}
          {perMethod.length > 0 && (
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
              {perMethod.map((m) => (
                <button
                  key={m.method}
                  type="button"
                  onClick={() => setMethod(method === m.method ? "" : m.method)}
                  className={`${card} p-3 text-left transition-colors hover:bg-surface-subtle ${method === m.method ? "ring-2 ring-primary" : ""} ${method && method !== m.method ? "opacity-50" : ""}`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`w-2.5 h-2.5 rounded-sm ${METHOD_BG[m.method]}`} aria-hidden />
                    {t(`shop.method.${m.method}`)}
                  </span>
                  <span className="block font-bold text-lg tabular-nums mt-1">{m.net < 0 ? `−${taka(-m.net)}` : taka(m.net)}</span>
                  <span className="block text-[11px] text-text-muted tabular-nums">
                    +{taka(m.in)} · −{taka(m.out)}
                  </span>
                  <span className="block text-[11px] text-text-muted">{t("shop.cashReport.entries", { n: String(m.count) })}</span>
                </button>
              ))}
            </section>
          )}

          {/* Chart */}
          <section className={`${card} p-3 sm:p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold">{t(chart.unit === "month" ? "shop.cashReport.chartMonthly" : "shop.cashReport.chartDaily")}</h3>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                {REPORT_METHODS.filter((m) => chart.rows.some((r) => r.values[m] > 0)).map((m) => (
                  <li key={m} className="inline-flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-sm ${METHOD_BG[m]}`} aria-hidden />
                    {t(`shop.method.${m}`)}
                  </li>
                ))}
              </ul>
            </div>
            {chart.rows.some((r) => r.total > 0) ? (
              <StackedBars rows={chart.rows} unit={chart.unit} />
            ) : (
              <p className="text-sm text-text-muted py-10 text-center">{t("shop.cashReport.noMoney")}</p>
            )}
          </section>

          {/* Every money line */}
          <section className={`${card} overflow-hidden`}>
            <div className="flex items-baseline justify-between gap-2 px-3 sm:px-4 pt-3">
              <h3 className="text-sm font-semibold">{t("shop.cashReport.history")}</h3>
              <span className="text-xs text-text-muted">{t("shop.filters.shown", { n: String(lines.length) })}</span>
            </div>
            {lines.length === 0 ? (
              <p className="text-sm text-text-muted p-4">{t("shop.common.none")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-text-muted text-left">
                    <tr>
                      <th className="p-2 pl-3 sm:pl-4 font-medium">{t("shop.cashReport.col.time")}</th>
                      <th className="p-2 font-medium">{t("shop.cashReport.col.type")}</th>
                      <th className="p-2 font-medium">{t("shop.cashReport.col.method")}</th>
                      <th className="p-2 font-medium">{t("shop.cashReport.col.ref")}</th>
                      <th className="p-2 font-medium hidden md:table-cell">{t("shop.common.staff")}</th>
                      <th className="p-2 pr-3 sm:pr-4 font-medium text-right">{t("shop.common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.slice(0, shown).map((l) => {
                      const href = lineHref(l);
                      return (
                        <tr key={l.id} className="border-t border-border-light align-top">
                          <td className="p-2 pl-3 sm:pl-4 whitespace-nowrap text-xs">{dateTime(l.at)}</td>
                          <td className="p-2 whitespace-nowrap">{t(`shop.cashReport.kind.${l.kind}`)}</td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-sm ${METHOD_BG[l.method]}`} aria-hidden />
                              {t(`shop.method.${l.method}`)}
                            </span>
                          </td>
                          <td className="p-2 min-w-[10rem]">
                            {l.ref &&
                              (href ? (
                                <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                                  {l.ref} <ExternalLink className="w-3 h-3" aria-hidden />
                                </a>
                              ) : (
                                <span className="font-semibold">{l.ref}</span>
                              ))}
                            {l.label && <span className="block text-xs text-text-muted">{l.label}</span>}
                            {l.showroom_id && (data.showrooms.length > 1) && <span className="block text-[11px] text-text-muted">{shopName.get(l.showroom_id)}</span>}
                          </td>
                          <td className="p-2 hidden md:table-cell text-xs">{l.staff}</td>
                          <td className={`p-2 pr-3 sm:pr-4 text-right font-semibold tabular-nums whitespace-nowrap ${l.amount < 0 ? "text-badge-discount" : ""}`}>
                            {l.amount < 0 ? `−${taka(-l.amount)}` : `+${taka(l.amount)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lines.length > shown && (
                  <div className="p-3 border-t border-border-light text-center">
                    <button type="button" className={btnGhost} onClick={() => setShown((n) => n + PAGE)}>
                      {t("shop.cashReport.more", { n: String(Math.min(PAGE, lines.length - shown)) })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Closed drawer days */}
          {data.days.length > 0 && (
            <section className={`${card} overflow-hidden`}>
              <h3 className="text-sm font-semibold px-3 sm:px-4 pt-3">{t("shop.cashReport.drawerDays")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-text-muted text-left">
                    <tr>
                      <th className="p-2 pl-3 sm:pl-4 font-medium">{t("shop.day.closedAt")}</th>
                      <th className="p-2 font-medium">{t("shop.common.staff")}</th>
                      <th className="p-2 font-medium text-right">{t("shop.cashReport.float")}</th>
                      <th className="p-2 font-medium text-right">{t("shop.day.expectedCash")}</th>
                      <th className="p-2 font-medium text-right">{t("shop.day.counted")}</th>
                      <th className="p-2 pr-3 sm:pr-4 font-medium">{t("shop.day.difference")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => (
                      <tr key={d.id} className="border-t border-border-light align-top">
                        <td className="p-2 pl-3 sm:pl-4 whitespace-nowrap text-xs">
                          {dateTime(d.closed_at)}
                          {data.showrooms.length > 1 && <span className="block text-text-muted">{shopName.get(d.showroom_id)}</span>}
                        </td>
                        <td className="p-2">{d.staff}</td>
                        <td className="p-2 text-right tabular-nums">{taka(d.opening_float)}</td>
                        <td className="p-2 text-right tabular-nums">{taka(d.expected_cash)}</td>
                        <td className="p-2 text-right tabular-nums">{taka(d.counted_cash)}</td>
                        <td className={`p-2 pr-3 sm:pr-4 ${Math.abs(d.difference) >= 0.005 ? "text-badge-discount font-semibold" : ""}`}>
                          {Math.abs(d.difference) < 0.005 ? t("shop.day.exact") : d.difference < 0 ? t("shop.day.short", { amount: taka(-d.difference) }) : t("shop.day.over", { amount: taka(d.difference) })}
                          {d.note && <span className="block text-xs text-text-muted font-normal">{d.note}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Stacked bars: money received per day (or month), one segment per method.
 * ------------------------------------------------------------------------- */

const H = 220;
const PAD = { top: 8, right: 4, bottom: 24, left: 48 };

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** A bar segment with only its top corners rounded. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function StackedBars({ rows, unit }: { rows: Bucket[]; unit: "day" | "month" }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(...rows.map((r) => r.total)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / rows.length;
  const barW = Math.max(2, Math.min(36, slot * 0.7));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.floor(plotW / 56)));

  const label = (key: string, long = false) => {
    const d = new Date(`${unit === "month" ? `${key}-01` : key}T00:00:00Z`);
    return d.toLocaleDateString("en-GB", unit === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : long ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
  };

  const hovered = hover == null ? null : rows[hover];
  const tipLeft = hover == null ? 0 : PAD.left + slot * hover + slot / 2;

  return (
    <div ref={box} className="relative select-none" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label={t("shop.cashReport.chartDaily")} className="block">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border-light" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-text-muted text-[10px] tabular-nums">
              {shortTaka(v)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          let acc = 0;
          const segs = REPORT_METHODS.filter((m) => r.values[m] > 0);
          return (
            <g key={r.key} opacity={hover == null || hover === i ? 1 : 0.45}>
              {segs.map((m, j) => {
                const v = r.values[m];
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                const gap = j > 0 ? 2 : 0; // surface gap between stacked segments
                const hh = Math.max(0, h - gap);
                return j === segs.length - 1 ? (
                  <path key={m} d={topRounded(x, top, barW, hh, 4)} className={METHOD_FILL[m]} />
                ) : (
                  <rect key={m} x={x} y={top} width={barW} height={hh} className={METHOD_FILL[m]} />
                );
              })}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-text-muted text-[10px]">
                  {label(r.key)}
                </text>
              )}
              {/* hit target: the whole column */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[11rem] rounded-lg border border-border-light bg-surface-card shadow-lg p-2.5 text-xs"
          style={{ left: Math.min(Math.max(tipLeft, 90), width - 90), transform: "translateX(-50%)" }}
        >
          <p className="font-semibold mb-1">{label(hovered.key, true)}</p>
          {REPORT_METHODS.filter((m) => hovered.values[m] > 0)
            .reverse()
            .map((m) => (
              <p key={m} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-text-muted">
                  <span className={`w-2 h-2 rounded-sm ${METHOD_BG[m]}`} aria-hidden />
                  {t(`shop.method.${m}`)}
                </span>
                <span className="tabular-nums">{taka(hovered.values[m])}</span>
              </p>
            ))}
          <p className="flex justify-between gap-3 border-t border-border-light mt-1 pt-1 font-semibold">
            <span>{t("shop.cashReport.received")}</span>
            <span className="tabular-nums">{taka(hovered.total)}</span>
          </p>
          {hovered.out > 0 && (
            <p className="flex justify-between gap-3 text-text-muted">
              <span>{t("shop.cashReport.wentOut")}</span>
              <span className="tabular-nums">−{taka(hovered.out)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
