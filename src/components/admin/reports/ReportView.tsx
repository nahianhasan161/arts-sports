"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Banknote, Download, HandCoins, Landmark, PackagePlus, Plus, Printer, RefreshCw, Scale, ShoppingBag, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney, type Locale } from "@/i18n";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { Skeleton } from "@/components/ui/skeleton";
import { panel, tones, type Tone } from "@/components/admin/dashboard/parts";
import type { BusinessReport, Channel, Group, Money } from "@/lib/admin/report";
import type { ExpenseCategory, ExpenseMethod, ExpensePlace } from "@/lib/admin/expenses";
import ExpenseForm from "./ExpenseForm";
import { SIDE_CHANNELS, SIDE_PLACES, headline, marginPct, net, profit, slotSpent, sumMoney, type Side } from "./math";
import { downloadCsv } from "./csv";

type Icon = React.ComponentType<{ className?: string }>;

/** Today (Bangladesh) as "2026-11-28", and `n` days back. */
function dhakaKey(daysAgo = 0) {
  return new Date(Date.now() + 6 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const SIDES: Side[] = ["all", "online", "shop"];
const GROUPS = ["auto", "day", "month", "year"] as const;

/**
 * The owner's business report: pick dates (and website / shop), see sales,
 * cost, profit or loss, spendings and supplier purchases. Print and CSV
 * download. Numbers come from GET /api/admin/reports (lib/admin/report.ts).
 */
export default function ReportView() {
  const { t, locale } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const base = pathname.startsWith("/admin/offline") ? "/admin/offline" : "/admin/online";
  const today = dhakaKey();
  const from = params.get("from") || `${today.slice(0, 7)}-01`;
  const to = params.get("to") || today;
  const groupParam = (params.get("group") ?? "auto") as (typeof GROUPS)[number];
  const side = (SIDES.includes(params.get("side") as Side) ? params.get("side") : "all") as Side;
  const supplierId = params.get("supplier") ?? "";

  const [data, setData] = useState<BusinessReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");

  const setParams = useCallback(
    (next: Record<string, string>) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      router.replace(`?${q.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const group = groupParam === "auto" ? "" : `&group=${groupParam}`;
    const res = await api<BusinessReport>(`/api/admin/reports?from=${from}&to=${to}${group}`);
    setLoading(false);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, [from, to, groupParam]);

  useEffect(() => {
    // Fetching on date change is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Print in light colours even when the screen is dark.
  useEffect(() => {
    let wasDark = false;
    const before = () => {
      wasDark = document.documentElement.classList.contains("dark");
      if (wasDark) document.documentElement.classList.remove("dark");
    };
    const after = () => {
      if (wasDark) document.documentElement.classList.add("dark");
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const quick = useMemo(() => {
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    const lm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    const pad = (v: number) => String(v).padStart(2, "0");
    return [
      { k: "today", f: today, t: today },
      { k: "yesterday", f: dhakaKey(1), t: dhakaKey(1) },
      { k: "d7", f: dhakaKey(6), t: today },
      { k: "month", f: `${today.slice(0, 7)}-01`, t: today },
      { k: "lastMonth", f: `${lm.y}-${pad(lm.m)}-01`, t: lastDayOfMonth(lm.y, lm.m) },
      { k: "year", f: `${y}-01-01`, t: today },
      { k: "lastYear", f: `${y - 1}-01-01`, t: `${y - 1}-12-31` },
    ] as const;
  }, [today]);

  const money = (v: number) => formatMoney(Math.round(v), locale);
  const count = (v: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(v);
  const dayLabel = (key: string, group: Group) => slotLabel(key, group, locale);

  async function removeExpense(id: string) {
    const reason = window.prompt(t("admin.report.spending.removeReason"));
    if (!reason?.trim()) return;
    const res = await api("/api/admin/expenses", { id, reason }, "PATCH");
    if (!res.ok) return setError(res.error);
    setNotice(t("admin.report.spending.removed"));
    void load();
  }

  const view = useMemo(() => {
    if (!data) return null;
    const h = headline(data, side);
    const channels = SIDE_CHANNELS[side];
    const places = SIDE_PLACES[side];
    const expenses = data.expenses.rows.filter((e) => places.includes(e.place));
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    const supplierRows = data.suppliers.rows.filter((s) => !supplierId || s.id === supplierId);
    const purchases = data.suppliers.purchases.filter((p) => !supplierId || p.supplier_id === supplierId);
    const payments = data.suppliers.payments.filter((p) => !supplierId || p.supplier_id === supplierId);
    const products = data.products
      .map((p) => {
        const parts = [channels.includes("web") ? p.web : null, channels.includes("shop") ? p.shop : null].filter(Boolean) as { qty: number; sales: number; cost: number }[];
        return { key: p.key, title: p.title, qty: parts.reduce((s, x) => s + x.qty, 0), sales: parts.reduce((s, x) => s + x.sales, 0), cost: parts.reduce((s, x) => s + x.cost, 0) };
      })
      .filter((p) => p.qty > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 15);
    return { h, channels, expenses, byCategory: [...byCategory].sort((a, b) => b[1] - a[1]), supplierRows, purchases, payments, products };
  }, [data, side, supplierId]);

  function exportCsv() {
    if (!data || !view) return;
    const T = (k: Parameters<typeof t>[0]) => t(k);
    const rows: (string | number)[][] = [];
    rows.push([T("admin.report.printTitle")], [t("admin.report.period", { from: data.from, to: data.to })], [T(`admin.report.side.${side}`)], []);
    rows.push([T("admin.report.kpi.sales"), Math.round(view.h.sales)], [T("admin.report.kpi.cost"), Math.round(view.h.cost)], [T("admin.report.kpi.gross"), Math.round(view.h.gross)], [T("admin.report.kpi.spent"), Math.round(view.h.spent)], [T(view.h.profit >= 0 ? "admin.report.kpi.profit" : "admin.report.kpi.loss"), Math.round(view.h.profit)], []);
    rows.push([T("admin.report.col.channel"), T("admin.report.col.orders"), T("admin.report.col.sales"), T("admin.report.col.returns"), T("admin.report.col.net"), T("admin.report.col.cost"), T("admin.report.col.profit")]);
    for (const c of view.channels) {
      const m = data.totals[c];
      rows.push([T(`admin.report.channels.${c}`), m.count, Math.round(m.sales), Math.round(m.refunds), Math.round(net(m)), Math.round(m.cost), Math.round(profit(m))]);
    }
    rows.push([]);
    rows.push([T("admin.report.col.period"), T("admin.report.col.net"), T("admin.report.col.cost"), T("admin.report.col.spent"), T("admin.report.col.profit"), T("admin.report.col.bought"), T("admin.report.col.paid")]);
    for (const s of data.slots) {
      const m = sumMoney(view.channels.map((c) => s[c]));
      const spent = slotSpent(s, side);
      rows.push([s.key, Math.round(net(m)), Math.round(m.cost), Math.round(spent), Math.round(profit(m) - spent), Math.round(s.bought), Math.round(s.paid)]);
    }
    rows.push([], [T("admin.report.spending.title")], [T("admin.report.col.date"), T("admin.report.col.category"), T("admin.report.col.amount"), T("admin.report.col.method"), T("admin.report.col.place"), T("admin.report.col.note")]);
    for (const e of view.expenses) rows.push([e.spent_on, T(`admin.report.cat.${e.category as ExpenseCategory}`), e.amount, T(`admin.report.method.${e.method as ExpenseMethod}`), T(`admin.report.place.${e.place}`), e.note ?? ""]);
    rows.push([], [T("admin.report.suppliers.title")], [T("admin.report.col.supplier"), T("admin.report.col.bought"), T("admin.report.col.paid"), T("admin.report.col.due")]);
    for (const s of view.supplierRows) rows.push([s.name, Math.round(s.bought), Math.round(s.paid), Math.round(s.due)]);
    rows.push([], [T("admin.report.suppliers.purchases")], [T("admin.report.col.date"), T("admin.report.col.supplier"), T("admin.report.col.kind"), T("admin.report.col.ref"), T("admin.report.col.amount")]);
    for (const p of view.purchases) rows.push([p.date, p.supplier || "—", T(`admin.report.suppliers.kind.${p.kind}`), p.ref, Math.round(p.amount)]);
    downloadCsv(`report-${data.from}-${data.to}.csv`, rows);
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? "border-accent-gold bg-accent-gold text-white" : "border-border-light text-on-surface hover:border-accent-gold"}`;

  return (
    <div className="space-y-5 max-w-7xl mx-auto print:max-w-none print:space-y-3 print:text-[11px]">
      {/* Title + actions */}
      <div className="print:hidden flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-primary">{t("admin.report.title")}</h1>
          <p className="text-sm text-text-muted">{t("admin.report.intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAdding((a) => !a)} className={btnPrimary} disabled={data ? !data.expenses.ready : true}>
            <Plus className="w-4 h-4" />
            {t("admin.report.spending.add")}
          </button>
          <button type="button" onClick={() => window.print()} className={btnGhost} disabled={!data}>
            <Printer className="w-4 h-4" />
            {t("admin.report.print")}
          </button>
          <button type="button" onClick={exportCsv} className={btnGhost} disabled={!data}>
            <Download className="w-4 h-4" />
            {t("admin.report.csv")}
          </button>
          <button type="button" onClick={() => void load()} className={btnGhost} aria-label={t("admin.report.reload")} title={t("admin.report.reload")}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block border-b border-black pb-2">
        <p className="text-lg font-bold">{t("admin.report.printTitle")}</p>
        <p>
          {t("admin.report.period", { from: dayLabel(from, "day"), to: dayLabel(to, "day") })} · {t(`admin.report.side.${side}`)}
          {supplierId && data ? ` · ${data.suppliers.rows.find((s) => s.id === supplierId)?.name ?? ""}` : ""}
        </p>
        <p className="text-xs">{t("admin.report.printedAt", { at: new Date().toLocaleString(locale === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) })}</p>
      </div>

      {/* Filters */}
      <section className={`${panel} print:hidden p-3 sm:p-4 space-y-3`}>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q.k} type="button" onClick={() => setParams({ from: q.f, to: q.t })} className={chip(from === q.f && to === q.t)}>
              {t(`admin.report.quick.${q.k}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-text-muted">
            {t("admin.report.from")}
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setParams({ from: e.target.value })} className="block mt-0.5 rounded-lg border border-border-light bg-surface-card px-2 py-1 text-sm text-on-surface" />
          </label>
          <label className="text-xs text-text-muted">
            {t("admin.report.to")}
            <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setParams({ to: e.target.value })} className="block mt-0.5 rounded-lg border border-border-light bg-surface-card px-2 py-1 text-sm text-on-surface" />
          </label>
          <div className="text-xs text-text-muted">
            {t("admin.report.groupLabel")}
            <div className="mt-0.5 flex gap-1">
              {GROUPS.map((g) => (
                <button key={g} type="button" onClick={() => setParams({ group: g === "auto" ? "" : g })} className={chip(groupParam === g)}>
                  {t(`admin.report.group.${g}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-text-muted">
            {t("admin.report.sideLabel")}
            <div className="mt-0.5 flex flex-wrap gap-1">
              {SIDES.map((s) => (
                <button key={s} type="button" onClick={() => setParams({ side: s === "all" ? "" : s })} className={chip(side === s)}>
                  {t(`admin.report.side.${s}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {adding && data && <ExpenseForm today={today} showrooms={data.showrooms} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice(t("admin.report.spending.saved")); void load(); }} />}
      {notice && <p className="print:hidden rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{notice}</p>}
      {error && <p className="print:hidden rounded-lg border border-badge-discount/30 bg-badge-discount/10 px-3 py-2 text-sm text-badge-discount">{t("admin.report.error")} {error}</p>}

      {!data || !view ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
          <p className="text-center text-sm text-text-muted">{t("admin.report.loading")}</p>
        </div>
      ) : (
        <div className={`space-y-5 print:space-y-3 ${loading ? "opacity-60" : ""}`}>
          {/* Headline */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 print:grid-cols-5 print:gap-2">
            <Kpi label={t("admin.report.kpi.sales")} hint={t("admin.report.kpi.salesHint")} value={money(view.h.sales)} icon={ShoppingBag} tone="blue" />
            <Kpi label={t("admin.report.kpi.cost")} hint={t("admin.report.kpi.costHint")} value={money(view.h.cost)} icon={PackagePlus} tone="amber" />
            <Kpi label={t("admin.report.kpi.gross")} hint={t("admin.report.kpi.margin", { p: count(marginPct(view.h.money)) })} value={money(view.h.gross)} icon={Scale} tone="purple" />
            <Kpi label={t("admin.report.kpi.spent")} hint={t("admin.report.kpi.spentHint")} value={money(view.h.spent)} icon={Wallet} tone="red" />
            <Kpi
              label={t(view.h.profit >= 0 ? "admin.report.kpi.profit" : "admin.report.kpi.loss")}
              hint={view.h.sales > 0 ? t("admin.report.kpi.margin", { p: count(Math.round((view.h.profit / view.h.sales) * 100)) }) : ""}
              value={money(Math.abs(view.h.profit))}
              icon={view.h.profit >= 0 ? TrendingUp : TrendingDown}
              tone={view.h.profit >= 0 ? "green" : "red"}
              strong
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 print:grid-cols-5 print:gap-2">
            <Small label={t("admin.report.kpi.received")} value={money(view.h.received)} icon={Banknote} />
            <Small label={t("admin.report.kpi.toCollect")} hint={t("admin.report.kpi.toCollectHint")} value={money(view.h.toCollect)} icon={HandCoins} />
            <Small label={t("admin.report.kpi.bought")} value={money(data.slots.reduce((s, x) => s + x.bought, 0))} icon={PackagePlus} />
            <Small label={t("admin.report.kpi.paid")} value={money(data.slots.reduce((s, x) => s + x.paid, 0))} icon={Landmark} />
            <Small label={t("admin.report.kpi.due")} value={money(data.suppliers.due_now)} icon={Wallet} />
          </div>

          {(view.h.noCostPieces > 0 || view.h.noMaking > 0 || !data.expenses.ready || side !== "all" || data.cancelled.count > 0 || (data.notDelivered?.count ?? 0) > 0) && (
            <div className="space-y-1.5 text-sm">
              {view.h.noCostPieces > 0 && <Warn>{t("admin.report.warnNoCost", { n: count(view.h.noCostPieces) })}</Warn>}
              {view.h.noMaking > 0 && <Warn>{t("admin.report.warnNoMaking", { n: count(view.h.noMaking) })}</Warn>}
              {!data.expenses.ready && <Warn>{t("admin.report.spending.notReady")}</Warn>}
              {side !== "all" && <p className="text-xs text-text-muted">{t("admin.report.sharedNote")}</p>}
              {data.cancelled.count > 0 && side !== "shop" && <p className="text-xs text-text-muted">{t("admin.report.cancelled", { n: count(data.cancelled.count), amount: money(data.cancelled.amount) })}</p>}
              {(data.notDelivered?.count ?? 0) > 0 && side !== "shop" && <p className="text-xs text-text-muted">{t("admin.report.notDelivered", { n: count(data.notDelivered.count), amount: money(data.notDelivered.amount) })}</p>}
            </div>
          )}

          {/* By channel */}
          <Section title={t("admin.report.channels.title")}>
            <Table
              head={[t("admin.report.col.channel"), t("admin.report.col.orders"), t("admin.report.col.sales"), t("admin.report.col.returns"), t("admin.report.col.net"), t("admin.report.col.cost"), t("admin.report.col.profit"), t("admin.report.col.margin")]}
              rows={[
                ...view.channels.flatMap((c: Channel) => {
                  const m = data.totals[c];
                  const row = channelRow(t(`admin.report.channels.${c}`), m, money, count);
                  if (c !== "shop" || data.branches.length < 2) return [row];
                  return [row, ...data.branches.map((b) => channelRow(`— ${b.name}`, b, money, count, true))];
                }),
                { ...channelRow(t("admin.report.channels.total"), view.h.money, money, count), total: true },
              ]}
            />
          </Section>

          {/* By day / month / year */}
          <Section title={t(data.group === "year" ? "admin.report.periodTitleYear" : data.group === "month" ? "admin.report.periodTitleMonth" : "admin.report.periodTitle")}>
            <PeriodTable data={data} side={side} money={money} label={(k) => dayLabel(k, data.group)} />
          </Section>

          {/* Spendings */}
          <Section title={t("admin.report.spending.title")}>
            {!data.expenses.ready ? (
              <p className="text-sm text-text-muted">{t("admin.report.spending.notReady")}</p>
            ) : view.expenses.length === 0 ? (
              <p className="text-sm text-text-muted">{t("admin.report.spending.none")}</p>
            ) : (
              <div className="grid lg:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-1">{t("admin.report.spending.byCategory")}</h3>
                  <Table
                    head={[t("admin.report.col.category"), t("admin.report.col.amount")]}
                    rows={[
                      ...view.byCategory.map(([c, a]) => ({ cells: [t(`admin.report.cat.${c as ExpenseCategory}`), money(a)] })),
                      { cells: [t("admin.report.channels.total"), money(view.h.spent)], total: true },
                    ]}
                  />
                </div>
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-semibold text-text-muted mb-1">{t("admin.report.spending.list")}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-light text-left text-xs text-text-muted">
                          <th className="py-1.5 pr-2 font-semibold">{t("admin.report.col.date")}</th>
                          <th className="py-1.5 pr-2 font-semibold">{t("admin.report.col.category")}</th>
                          <th className="py-1.5 pr-2 font-semibold">{t("admin.report.col.note")}</th>
                          <th className="py-1.5 pr-2 font-semibold">{t("admin.report.col.place")}</th>
                          <th className="py-1.5 pr-2 font-semibold">{t("admin.report.col.method")}</th>
                          <th className="py-1.5 pr-2 font-semibold text-right">{t("admin.report.col.amount")}</th>
                          <th className="print:hidden" />
                        </tr>
                      </thead>
                      <tbody>
                        {view.expenses.map((e) => (
                          <tr key={e.id} className="border-b border-border-light last:border-b-0 break-inside-avoid">
                            <td className="py-1.5 pr-2 whitespace-nowrap text-text-muted">{dayLabel(e.spent_on, "day")}</td>
                            <td className="py-1.5 pr-2 text-on-surface">{t(`admin.report.cat.${e.category as ExpenseCategory}`)}</td>
                            <td className="py-1.5 pr-2 text-on-surface-variant">
                              {e.note}
                              {e.by && <span className="block text-[11px] text-text-muted">{e.by}</span>}
                            </td>
                            <td className="py-1.5 pr-2 text-text-muted">
                              {t(`admin.report.place.${e.place as ExpensePlace}`)}
                              {e.showroom_id && <span className="block text-[11px]">{data.showrooms.find((s) => s.id === e.showroom_id)?.name}</span>}
                            </td>
                            <td className="py-1.5 pr-2 text-text-muted">{t(`admin.report.method.${e.method as ExpenseMethod}`)}</td>
                            <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-on-surface">{money(e.amount)}</td>
                            <td className="print:hidden py-1.5 text-right">
                              <button type="button" onClick={() => void removeExpense(e.id)} className="p-1 rounded text-text-muted hover:text-badge-discount" title={t("admin.report.spending.remove")} aria-label={t("admin.report.spending.remove")}>
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Suppliers */}
          <Section
            title={t("admin.report.suppliers.title")}
            hint={t("admin.report.suppliers.intro")}
            action={
              data.suppliers.rows.length > 0 && (
                <select value={supplierId} onChange={(e) => setParams({ supplier: e.target.value })} className={`${field} print:hidden w-auto max-w-[16rem]`}>
                  <option value="">{t("admin.report.suppliers.all")}</option>
                  {data.suppliers.rows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )
            }
          >
            {view.supplierRows.length === 0 && view.purchases.length === 0 ? (
              <p className="text-sm text-text-muted">{t("admin.report.suppliers.none")}</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-text-muted mb-1">{t("admin.report.suppliers.perSupplier")}</h3>
                  <Table
                    head={[t("admin.report.col.supplier"), t("admin.report.col.bought"), t("admin.report.col.paid"), t("admin.report.col.due")]}
                    rows={[
                      ...view.supplierRows.map((s) => ({
                        cells: [
                          <Link key="n" href={`${base}/suppliers/${s.id}`} className="font-medium text-on-surface hover:text-accent-gold hover:underline print:no-underline">
                            {s.name}
                          </Link>,
                          money(s.bought),
                          money(s.paid),
                          <span key="d" className={s.due > 0.5 ? "font-semibold text-red-700" : ""}>{money(s.due)}</span>,
                        ],
                      })),
                      {
                        cells: [
                          t("admin.report.channels.total"),
                          money(view.supplierRows.reduce((a, s) => a + s.bought, 0)),
                          money(view.supplierRows.reduce((a, s) => a + s.paid, 0)),
                          money(view.supplierRows.reduce((a, s) => a + s.due, 0)),
                        ],
                        total: true,
                      },
                    ]}
                  />
                  {!supplierId && data.suppliers.unassigned > 0 && <p className="mt-1 text-xs text-text-muted">{t("admin.report.suppliers.unassigned", { amount: money(data.suppliers.unassigned) })}</p>}
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted mb-1">{t("admin.report.suppliers.purchases")}</h3>
                    {view.purchases.length === 0 ? (
                      <p className="text-sm text-text-muted">{t("admin.report.suppliers.none")}</p>
                    ) : (
                      <Table
                        head={[t("admin.report.col.date"), t("admin.report.col.supplier"), t("admin.report.col.kind"), t("admin.report.col.amount")]}
                        rows={view.purchases.slice(0, 300).map((p) => ({
                          cells: [
                            dayLabel(p.date, "day"),
                            <span key="s">
                              {p.supplier || "—"}
                              {p.ref && <span className="block text-[11px] text-text-muted">{p.ref}</span>}
                            </span>,
                            t(`admin.report.suppliers.kind.${p.kind}`),
                            money(p.amount),
                          ],
                        }))}
                      />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-text-muted mb-1">{t("admin.report.suppliers.payments")}</h3>
                    {view.payments.length === 0 ? (
                      <p className="text-sm text-text-muted">{t("admin.report.suppliers.noPayments")}</p>
                    ) : (
                      <Table
                        head={[t("admin.report.col.date"), t("admin.report.col.supplier"), t("admin.report.col.method"), t("admin.report.col.amount")]}
                        rows={view.payments.slice(0, 300).map((p) => ({ cells: [dayLabel(p.date, "day"), p.supplier || "—", methodName(p.method, t), money(p.amount)] }))}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Best sellers */}
          {
            <Section title={t("admin.report.top.title")}>
              {view.products.length === 0 ? (
                <p className="text-sm text-text-muted">{t("admin.report.top.none")}</p>
              ) : (
                <Table
                  head={[t("admin.report.col.product"), t("admin.report.col.pieces"), t("admin.report.col.sales"), t("admin.report.col.cost"), t("admin.report.col.profit")]}
                  rows={view.products.map((p) => ({ cells: [p.title, count(p.qty), money(p.sales), money(p.cost), money(p.sales - p.cost)] }))}
                />
              )}
            </Section>
          }
        </div>
      )}
    </div>
  );
}

function methodName(method: string, t: ReturnType<typeof useT>["t"]) {
  const known = ["cash", "bkash", "nagad", "bank", "card", "other"];
  return known.includes(method) ? t(`admin.report.method.${method as ExpenseMethod}`) : method;
}

function slotLabel(key: string, group: Group, locale: Locale) {
  const loc = locale === "bn" ? "bn-BD" : "en-GB";
  if (group === "year") return new Intl.NumberFormat(loc, { useGrouping: false }).format(Number(key));
  if (group === "month") return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(loc, { month: "short", year: "numeric", timeZone: "UTC" });
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

interface Row {
  cells: React.ReactNode[];
  total?: boolean;
  sub?: boolean;
}

function channelRow(name: string, m: Money, money: (v: number) => string, count: (v: number) => string, sub = false): Row {
  const p = profit(m);
  return {
    sub,
    cells: [name, count(m.count), money(m.sales), m.refunds ? money(m.refunds) : "—", money(net(m)), money(m.cost), <span key="p" className={p < 0 ? "text-red-700" : ""}>{money(p)}</span>, net(m) > 0 ? `${count(marginPct(m))}%` : "—"],
  };
}

function Table({ head, rows }: { head: string[]; rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-light text-xs text-text-muted">
            {head.map((h, i) => (
              <th key={i} className={`py-1.5 pr-3 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`break-inside-avoid ${r.total ? "border-t-2 border-border-light font-bold text-primary" : "border-b border-border-light last:border-b-0"} ${r.sub ? "text-xs text-text-muted" : ""}`}>
              {r.cells.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j === 0 ? "text-left" : "text-right tabular-nums whitespace-nowrap"} ${!r.total && !r.sub ? "text-on-surface" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodTable({ data, side, money, label }: { data: BusinessReport; side: Side; money: (v: number) => string; label: (key: string) => string }) {
  const { t } = useT();
  const channels = SIDE_CHANNELS[side];
  const rows = data.slots.map((s) => {
    const web = channels.includes("web") ? net(s.web) : 0;
    const shop = channels.includes("shop") ? net(s.shop) : 0;
    const custom = (channels.includes("customOnline") ? net(s.customOnline) : 0) + (channels.includes("customShop") ? net(s.customShop) : 0);
    const m = sumMoney(channels.map((c) => s[c]));
    const spent = slotSpent(s, side);
    return { key: s.key, web, shop, custom, net: net(m), cost: m.cost, spent, profit: profit(m) - spent, bought: s.bought };
  });
  const max = Math.max(1, ...rows.map((r) => r.net));
  const total = rows.reduce((a, r) => ({ ...a, web: a.web + r.web, shop: a.shop + r.shop, custom: a.custom + r.custom, net: a.net + r.net, cost: a.cost + r.cost, spent: a.spent + r.spent, profit: a.profit + r.profit, bought: a.bought + r.bought }), { key: "", web: 0, shop: 0, custom: 0, net: 0, cost: 0, spent: 0, profit: 0, bought: 0 });
  if (rows.every((r) => !r.net && !r.spent && !r.bought)) return <p className="text-sm text-text-muted">{t("admin.report.noSales")}</p>;
  const showWeb = channels.includes("web");
  const showShop = channels.includes("shop");
  const cols = [t("admin.report.col.period"), ...(showWeb ? [t("admin.report.col.website")] : []), ...(showShop ? [t("admin.report.col.shop")] : []), t("admin.report.col.custom"), t("admin.report.col.net"), t("admin.report.col.cost"), t("admin.report.col.spent"), t("admin.report.col.profit"), t("admin.report.col.bought")];
  const line = (r: (typeof rows)[number], isTotal = false) => [
    isTotal ? t("admin.report.channels.total") : label(r.key),
    ...(showWeb ? [money(r.web)] : []),
    ...(showShop ? [money(r.shop)] : []),
    money(r.custom),
    isTotal ? (
      money(r.net)
    ) : (
      <span key="n" className="inline-flex items-center justify-end gap-2">
        <span className="hidden sm:inline-block h-1.5 rounded-full bg-accent-gold/70 print:hidden" style={{ width: `${Math.round((Math.max(0, r.net) / max) * 64)}px` }} />
        {money(r.net)}
      </span>
    ),
    money(r.cost),
    money(r.spent),
    <span key="p" className={r.profit < 0 ? "text-red-700" : r.profit > 0 ? "text-emerald-700" : ""}>{money(r.profit)}</span>,
    money(r.bought),
  ];
  return <Table head={cols} rows={[...rows.map((r) => ({ cells: line(r) })), { cells: line(total, true), total: true }]} />;
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${panel} p-4 sm:p-5 print:border-0 print:p-0 print:rounded-none break-inside-avoid-page`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3 print:mb-1">
        <div>
          <h2 className="text-base font-bold text-primary">{title}</h2>
          {hint && <p className="text-xs text-text-muted print:hidden">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, hint, value, icon: I, tone, strong }: { label: string; hint?: string; value: string; icon: Icon; tone: Tone; strong?: boolean }) {
  return (
    <div className={`${panel} p-3 sm:p-4 flex items-start gap-3 print:p-2 print:rounded-lg ${strong ? (tone === "red" ? "border-red-300" : "border-emerald-300") : ""}`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 print:hidden ${tones[tone]}`}>
        <I className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className={`text-lg sm:text-xl font-bold truncate ${strong ? (tone === "red" ? "text-red-700" : "text-emerald-700") : "text-primary"}`}>{value}</p>
        {hint && <p className="text-[11px] text-text-muted leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

function Small({ label, hint, value, icon: I }: { label: string; hint?: string; value: string; icon: Icon }) {
  return (
    <div className="rounded-xl bg-surface-subtle px-3 py-2.5 print:border print:border-gray-300 print:py-1.5">
      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <I className="w-3.5 h-3.5 print:hidden" />
        {label}
      </p>
      <p className="text-base font-bold text-primary">{value}</p>
      {hint && <p className="text-[11px] text-text-muted leading-tight">{hint}</p>}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-100 text-amber-700 px-3 py-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </p>
  );
}
