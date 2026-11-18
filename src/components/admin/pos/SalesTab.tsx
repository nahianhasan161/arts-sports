"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, Link2, Printer, Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { PAY_METHODS, taka, type PayMethod, type SaleDetail } from "@/lib/pos/types";
import { readUrlParam, writeUrlParams } from "@/lib/url-state";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "./api";
import { DateRangeInputs, dateRange, dhakaDay, matchPeriod, periodDays, shiftDays } from "@/components/admin/filters/period";

const SALE_STATUSES = ["all", "completed", "partially_refunded", "refunded"] as const;
type SaleStatus = (typeof SALE_STATUSES)[number];
/** Quick picks shown next to the date boxes, in this order. */
const QUICK = ["today", "yesterday", "7d", "30d", "month", "all"] as const;

interface SaleRow {
  id: string;
  receipt_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  refunded_total: number;
  status: "completed" | "partially_refunded" | "refunded";
  sold_by: string | null;
  staff: string;
  created_at: string;
  /** Money taken for this bill, by method (refunds not included). */
  paid?: Record<string, number>;
  item_count?: number;
}

const DHAKA = 6 * 3_600_000;
const dayOf = (iso: string) => new Date(Date.parse(iso) + DHAKA).toISOString().slice(0, 10);
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });
const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-surface-card border-border-light text-on-surface hover:bg-surface-subtle"}`;

/** Filters as they come from the page link (so a reload or a shared link keeps them). */
function initialFilters(initialQuery: string) {
  const from = readUrlParam("from");
  const to = readUrlParam("to");
  const status = readUrlParam("status") as SaleStatus | null;
  // A scanned receipt should be found whatever day it was sold, so it searches every date.
  const range = from === "all" || initialQuery ? { from: "", to: "" } : from || to ? { from: from ?? "", to: to ?? "" } : periodDays("today");
  return {
    range,
    status: status && SALE_STATUSES.includes(status) ? status : "all",
    method: (PAY_METHODS as readonly string[]).includes(readUrlParam("method") ?? "") ? (readUrlParam("method") as PayMethod) : "",
    staff: readUrlParam("staff") ?? "",
    sale: readUrlParam("sale") ?? "",
  } as { range: { from: string; to: string }; status: SaleStatus; method: PayMethod | ""; staff: string; sale: string };
}

/** Past sales: pick the days, find one by receipt number, phone or receipt QR, see the day's totals, reprint, or take goods back. */
export function SalesTab({ canManage, initialQuery }: { canManage: boolean; initialQuery: string }) {
  const { t } = useT();
  const [init] = useState(() => initialFilters(initialQuery));
  const [q, setQ] = useState(initialQuery);
  const [range, setRange] = useState(init.range);
  const [status, setStatus] = useState<SaleStatus>(init.status);
  const [method, setMethodFilter] = useState<PayMethod | "">(init.method);
  const [staff, setStaff] = useState(init.staff);
  const [staffSeen, setStaffSeen] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SaleDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<PayMethod>("cash");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const openSale = useCallback(async (id: string) => {
    const res = await api<SaleDetail>(`/api/admin/pos/sales/${id}`);
    if (!res.ok) return setError(res.error);
    setOpen(res.data);
    setQty({});
    setReason("");
    setNotice(null);
    setError(null);
    setCopied(false);
    writeUrlParams({ sale: id });
  }, []);

  const closeSale = useCallback(() => {
    setOpen(null);
    writeUrlParams({ sale: null });
  }, []);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      const { from, to } = dateRange(range.from, range.to);
      const p = new URLSearchParams({ q: term });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (status !== "all") p.set("status", status);
      if (staff) p.set("staff", staff);
      const res = await api<{ sales: SaleRow[]; has_more?: boolean }>(`/api/admin/pos/sales?${p}`);
      setLoading(false);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRows(res.data.sales);
      setHasMore(res.data.has_more === true);
      setStaffSeen((seen) => {
        const next = { ...seen };
        for (const s of res.data.sales) if (s.sold_by && s.staff) next[s.sold_by] = s.staff;
        return next;
      });
      // A scan or an exact receipt number finds one sale: open it.
      if (term && res.data.sales.length === 1) void openSale(res.data.sales[0].id);
    },
    [openSale, range, status, staff]
  );

  // Reload when a filter changes; typing in the search box waits for Enter.
  useEffect(() => {
    const timer = setTimeout(() => void load(q), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Keep the filters in the link.
  useEffect(() => {
    const today = periodDays("today");
    const isToday = range.from === today.from && range.to === today.to;
    writeUrlParams({
      from: isToday ? null : range.from || (range.to ? null : "all"),
      to: isToday ? null : range.to || null,
      status: status === "all" ? null : status,
      method: method || null,
      staff: staff || null,
    });
  }, [range, status, method, staff]);

  // A link with ?sale= opens that bill.
  useEffect(() => {
    if (!init.sale) return;
    const timer = setTimeout(() => void openSale(init.sale), 0);
    return () => clearTimeout(timer);
  }, [init.sale, openSale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSale();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSale]);

  async function doReturn() {
    if (!open) return;
    setBusy(true);
    const res = await api<{ refund_amount: number }>(`/api/admin/pos/sales/${open.sale.id}`, {
      items: Object.entries(qty).map(([sale_item_id, quantity]) => ({ sale_item_id, quantity })),
      refund_method: refundMethod,
      reason,
      restock,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await openSale(open.sale.id);
    setNotice(t("shop.sales.returned", { amount: taka(res.data.refund_amount) }));
    void load(q);
  }

  const shown = useMemo(() => (method ? rows.filter((r) => (r.paid?.[method] ?? 0) > 0) : rows), [rows, method]);

  const summary = useMemo(() => {
    const byMethod: Record<string, number> = {};
    let gross = 0;
    let returns = 0;
    let pieces = 0;
    for (const r of shown) {
      gross += Number(r.total || 0);
      returns += Number(r.refunded_total || 0);
      pieces += Number(r.item_count || 0);
      for (const [m, a] of Object.entries(r.paid ?? {})) byMethod[m] = (byMethod[m] ?? 0) + a;
    }
    return { gross, returns, net: gross - returns, pieces, byMethod };
  }, [shown]);

  const days = useMemo(() => {
    const out: { day: string; rows: SaleRow[]; net: number }[] = [];
    for (const r of shown) {
      const day = dayOf(r.created_at);
      let g = out[out.length - 1];
      if (!g || g.day !== day) out.push((g = { day, rows: [], net: 0 }));
      g.rows.push(r);
      g.net += Number(r.total || 0) - Number(r.refunded_total || 0);
    }
    return out;
  }, [shown]);

  const active = matchPeriod(range.from, range.to);
  const today = dhakaDay();
  const canShift = Boolean(range.from && range.to);
  const laterBlocked = !canShift || range.to >= today;
  const filtered = status !== "all" || method !== "" || staff !== "" || q !== "";
  const staffList = Object.entries(staffSeen).sort((a, b) => a[1].localeCompare(b[1]));

  function clearFilters() {
    setQ("");
    setStatus("all");
    setMethodFilter("");
    setStaff("");
    setRange(periodDays("today"));
    writeUrlParams({ receipt: null });
  }

  function exportCsv() {
    const cell = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ["Receipt", "Date", "Time", "Customer", "Phone", "Staff", "Pieces", "Total", "Returned", "Net", "Status", ...PAY_METHODS];
    const lines = shown.map((r) => [
      r.receipt_no,
      dayOf(r.created_at),
      timeOf(r.created_at),
      r.customer_name,
      r.customer_phone,
      r.staff,
      r.item_count ?? "",
      r.total,
      r.refunded_total,
      Number(r.total || 0) - Number(r.refunded_total || 0),
      r.status,
      ...PAY_METHODS.map((m) => r.paid?.[m] ?? ""),
    ]);
    const csv = "﻿" + [head, ...lines].map((l) => l.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `shop-bills-${range.from || "all"}${range.to && range.to !== range.from ? `_${range.to}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printList() {
    const esc = (v: string | number | null | undefined) =>
      String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    const period = range.from ? (range.to && range.to !== range.from ? `${range.from} → ${range.to}` : range.from) : t("shop.filters.periods.all");
    const body = days
      .map((g) => {
        const rowsHtml = g.rows
          .map((r) => {
            const net = Number(r.total || 0) - Number(r.refunded_total || 0);
            const methods = PAY_METHODS.filter((m) => (r.paid?.[m] ?? 0) > 0).map((m) => t(`shop.method.${m}`)).join(", ");
            return `<tr><td>${esc(r.receipt_no)}</td><td>${esc(timeOf(r.created_at))}</td><td>${esc(r.customer_name)}<br><small>${esc(r.customer_phone)}</small></td><td>${esc(r.staff)}</td><td class="n">${esc(r.item_count ?? "")}</td><td>${esc(methods)}</td><td class="n">${esc(taka(r.total))}</td><td class="n">${r.refunded_total ? esc(`−${taka(r.refunded_total)}`) : ""}</td><td class="n"><b>${esc(taka(net))}</b></td><td>${esc(t(`shop.sales.status.${r.status}`))}</td></tr>`;
          })
          .join("");
        return `<tr class="day"><td colspan="8">${esc(dayLabel(g.day))} · ${g.rows.length}</td><td class="n" colspan="2"><b>${esc(taka(g.net))}</b></td></tr>${rowsHtml}`;
      })
      .join("");
    const methodLine = methodsUsed.map((m) => `${esc(t(`shop.method.${m}`))}: ${esc(taka(summary.byMethod[m]))}`).join(" · ");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t("shop.sales.printTitle"))} ${esc(period)}</title>
<style>
body{font-family:system-ui,"Noto Sans Bengali",sans-serif;font-size:12px;color:#111;margin:16px}
h1{font-size:18px;margin:0 0 4px}.meta{color:#555;margin-bottom:10px}
.sum{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0 12px;font-size:13px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eee}.n{text-align:right;white-space:nowrap}tr.day td{background:#f6f3ea;font-weight:600}small{color:#666}
@media print{body{margin:0}button{display:none}}
</style></head><body>
<h1>${esc(t("shop.sales.printTitle"))}</h1>
<div class="meta">${esc(period)} · ${esc(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }))}</div>
<div class="sum"><span>${esc(t("shop.sales.summary.bills"))}: <b>${shown.length}</b></span><span>${esc(t("shop.sales.summary.gross"))}: <b>${esc(taka(summary.gross))}</b></span><span>${esc(t("shop.sales.summary.returns"))}: <b>${esc(taka(summary.returns))}</b></span><span>${esc(t("shop.sales.summary.net"))}: <b>${esc(taka(summary.net))}</b></span></div>
${methodLine ? `<div class="meta">${methodLine}</div>` : ""}
<table><thead><tr><th>${esc(t("shop.sales.col.receipt"))}</th><th>${esc(t("shop.sales.col.time"))}</th><th>${esc(t("shop.sales.col.customer"))}</th><th>${esc(t("shop.sales.col.staff"))}</th><th class="n">${esc(t("shop.sales.col.pieces"))}</th><th>${esc(t("shop.sales.receivedBy"))}</th><th class="n">${esc(t("shop.sales.col.total"))}</th><th class="n">${esc(t("shop.sales.summary.returns"))}</th><th class="n">${esc(t("shop.sales.summary.net"))}</th><th>${esc(t("shop.common.status"))}</th></tr></thead>
<tbody>${body}</tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { setError(t("shop.sales.popupBlocked")); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async function copyLink() {
    if (!open) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ sale: open.sale.id, from: "all" }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  const returning = Object.values(qty).some((n) => n > 0);
  const methodsUsed = PAY_METHODS.filter((m) => (summary.byMethod[m] ?? 0) > 0);

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

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.sales.searchPlaceholder")} className={`${field} pl-9`} autoFocus />
          </div>
          <button className={btnPrimary}>{t("shop.common.search")}</button>
        </form>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="inline-flex rounded-lg border border-border-light overflow-hidden" role="group" aria-label={t("shop.common.status")}>
            {SALE_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs font-semibold border-l first:border-l-0 border-border-light ${status === s ? "bg-primary text-white" : "bg-surface-card hover:bg-surface-subtle"}`}>
                {s === "all" ? t("shop.filters.all") : t(`shop.sales.status.${s}`)}
              </button>
            ))}
          </div>
          <select value={method} onChange={(e) => setMethodFilter(e.target.value as PayMethod | "")} className={`${field} w-auto py-1.5`} aria-label={t("shop.sales.receivedBy")}>
            <option value="">{t("shop.sales.anyMethod")}</option>
            {PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`shop.method.${m}`)}
              </option>
            ))}
          </select>
          {canManage && staffList.length > 0 && (
            <select value={staff} onChange={(e) => setStaff(e.target.value)} className={`${field} w-auto py-1.5`} aria-label={t("shop.filters.staff")}>
              <option value="">{t("shop.sales.allStaff")}</option>
              {staffList.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          {(filtered || active !== "today") && (
            <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline px-1">
              {t("shop.filters.clear")}
            </button>
          )}
          <button type="button" className={`${btnGhost} ml-auto py-1.5`} onClick={printList} disabled={shown.length === 0}>
            <Printer className="w-4 h-4" /> {t("shop.sales.printList")}
          </button>
          <button type="button" className={`${btnGhost} py-1.5`} onClick={exportCsv} disabled={shown.length === 0}>
            <Download className="w-4 h-4" /> {t("shop.sales.exportCsv")}
          </button>
        </div>
      </div>

      {/* Totals for what is shown */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
        <Stat label={t("shop.sales.summary.bills")} value={String(shown.length)} sub={t("shop.sales.summary.pieces", { n: summary.pieces })} />
        <Stat label={t("shop.sales.summary.gross")} value={taka(summary.gross)} sub={shown.length ? t("shop.sales.summary.avg", { amount: taka(Math.round(summary.gross / shown.length)) }) : ""} />
        <Stat label={t("shop.sales.summary.returns")} value={summary.returns ? `−${taka(summary.returns)}` : taka(0)} tone={summary.returns ? "bad" : undefined} />
        <Stat label={t("shop.sales.summary.net")} value={taka(summary.net)} tone="strong" />
      </div>
      {methodsUsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs -mt-1">
          <span className="text-text-muted">{t("shop.sales.receivedBy")}:</span>
          {methodsUsed.map((m) => (
            <button key={m} type="button" onClick={() => setMethodFilter(method === m ? "" : m)} className={chip(method === m)}>
              {t(`shop.method.${m}`)} · {taka(summary.byMethod[m])}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-badge-discount">{error}</p>}
      {hasMore && <p className="text-xs text-text-muted bg-surface-subtle rounded-lg px-3 py-2">{t("shop.sales.moreThanShown", { n: rows.length })}</p>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] gap-4 items-start">
        {/* Bills, grouped by day */}
        <section className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {shown.length === 0 && !loading && <div className={`${card} p-6 text-center text-sm text-text-muted`}>{t("shop.sales.noneInRange")}</div>}
          {loading && shown.length === 0 && <div className={`${card} p-6 text-center text-sm text-text-muted`}>{t("shop.common.loading")}</div>}
          {days.map((g) => (
            <div key={g.day} className={`${card} overflow-hidden`}>
              <div className="flex justify-between items-center gap-2 px-3 py-2 bg-surface-subtle border-b border-border-light text-xs">
                <span className="font-semibold text-on-surface">
                  {dayLabel(g.day)}
                  {g.day === today && <span className="ml-1.5 text-primary">· {t("shop.filters.periods.today")}</span>}
                </span>
                <span className="text-text-muted">
                  {t("shop.sales.summary.bills")} {g.rows.length} · <b className="text-on-surface">{taka(g.net)}</b>
                </span>
              </div>
              <ul className="divide-y divide-border-light">
                {g.rows.map((r) => {
                  const selected = open?.sale.id === r.id;
                  const methods = PAY_METHODS.filter((m) => (r.paid?.[m] ?? 0) > 0);
                  return (
                    <li key={r.id}>
                      <button className={`w-full text-left px-3 py-2.5 flex justify-between gap-3 text-sm hover:bg-surface-subtle border-l-4 ${selected ? "bg-surface-subtle border-primary" : "border-transparent"}`} onClick={() => openSale(r.id)}>
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-2 min-w-0">
                            <strong className="text-primary shrink-0">{r.receipt_no}</strong>
                            <span className="truncate">{r.customer_name || r.customer_phone || <span className="text-text-muted">{t("shop.sales.walkIn")}</span>}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-text-muted">
                            <span>{timeOf(r.created_at)}</span>
                            {r.staff && <span>· {r.staff}</span>}
                            {r.item_count ? <span>· {t("shop.sales.pieces", { n: r.item_count })}</span> : null}
                            {methods.map((m) => (
                              <span key={m} className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-semibold text-on-surface-variant">
                                {t(`shop.method.${m}`)}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="text-right shrink-0">
                          <strong className={r.status === "refunded" ? "line-through text-text-muted" : ""}>{taka(r.total)}</strong>
                          {r.status !== "completed" && (
                            <span className="block mt-0.5 text-[11px] font-semibold text-badge-discount">
                              {r.status === "refunded" ? t("shop.sales.status.refunded") : t("shop.sales.returnedAmount", { amount: taka(r.refunded_total) })}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        {/* The open bill: a side panel on wide screens, a bottom sheet on phones */}
        {open && (
          <div className="fixed inset-0 z-40 bg-black/40 flex items-end lg:z-auto lg:bg-transparent lg:block lg:sticky lg:top-0" onClick={closeSale}>
            <section className={`${card} w-full max-h-[88vh] overflow-y-auto rounded-b-none lg:rounded-lg lg:max-h-[calc(100vh-7rem)] p-4 flex flex-col gap-3 shadow-xl lg:shadow-none`} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-primary text-lg flex items-center gap-2">
                    {open.sale.receipt_no}
                    {open.sale.status !== "completed" && <span className="text-[11px] font-body font-semibold px-2 py-0.5 rounded-full bg-badge-discount/10 text-badge-discount">{t(`shop.sales.status.${open.sale.status as "refunded"}`)}</span>}
                  </h3>
                  <p className="text-xs text-text-muted">
                    {dateTime(open.sale.created_at)} · {open.sale.staff}
                  </p>
                  <p className="text-sm mt-0.5">
                    {open.sale.customer_name || t("shop.sales.walkIn")}
                    {open.sale.customer_phone && <span className="text-text-muted"> · {open.sale.customer_phone}</span>}
                  </p>
                </div>
                <button type="button" className={`${btnGhost} px-2`} onClick={closeSale} aria-label={t("shop.sales.close")} title={t("shop.sales.close")}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <a className={btnGhost} href={`/admin/offline/pos/receipt/${open.sale.id}`} target="_blank" rel="noreferrer">
                  <Printer className="w-4 h-4" /> {t("shop.sales.reprint")}
                </a>
                <button type="button" className={btnGhost} onClick={copyLink}>
                  {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />} {copied ? t("shop.sales.copied") : t("shop.sales.copyLink")}
                </button>
              </div>

              <table className="text-sm w-full">
                <tbody>
                  {open.items.map((i) => {
                    const left = i.quantity - i.returned_quantity;
                    return (
                      <tr key={i.id} className="border-t border-border-light align-top">
                        <td className="py-1.5">
                          {i.quantity}× {i.title}
                          {i.variant_label && <span className="text-text-muted"> · {i.variant_label}</span>}
                          {i.returned_quantity > 0 && <span className="text-badge-discount text-xs"> ({t("shop.sales.returnedQty", { n: i.returned_quantity })})</span>}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">{taka(i.line_total)}</td>
                        {canManage && (
                          <td className="py-1.5 pl-2 w-20">
                            {left > 0 && open.sale.status !== "refunded" && (
                              <input type="number" min={0} max={left} value={qty[i.id] ?? ""} placeholder={t("shop.sales.returnQty")} onChange={(e) => setQty((c) => ({ ...c, [i.id]: Math.min(left, Math.max(0, Math.floor(Number(e.target.value) || 0))) }))} className="w-full border border-border-light rounded px-1.5 py-1 bg-surface-subtle text-xs" />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <dl className="text-sm flex flex-col gap-0.5 border-t border-border-light pt-2">
                {Number(open.sale.subtotal) !== Number(open.sale.total) && (
                  <div className="flex justify-between text-xs text-text-muted">
                    <dt>{t("shop.sales.subtotal")}</dt>
                    <dd>{taka(open.sale.subtotal)}</dd>
                  </div>
                )}
                {Number(open.sale.discount_total) > 0 && (
                  <div className="flex justify-between text-xs text-text-muted">
                    <dt>{t("shop.sales.discount")}</dt>
                    <dd>−{taka(open.sale.discount_total)}</dd>
                  </div>
                )}
                {Number(open.sale.coupon_discount) > 0 && (
                  <div className="flex justify-between text-xs text-text-muted">
                    <dt>{t("shop.sales.coupon", { code: open.sale.coupon_code ?? "" })}</dt>
                    <dd>−{taka(open.sale.coupon_discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between font-bold">
                  <dt>{t("shop.common.total")}</dt>
                  <dd>{taka(open.sale.total)}</dd>
                </div>
                {open.payments.map((p) => (
                  <div key={p.id} className={`flex justify-between text-xs ${p.type === "refund" ? "text-badge-discount" : "text-text-muted"}`}>
                    <dt>
                      {p.type === "refund" ? t("shop.sales.refund") : t("shop.sales.paidBy")} · {t(`shop.method.${p.method as PayMethod}`)} {p.reference && p.type === "charge" ? `(${p.reference})` : ""}
                    </dt>
                    <dd>
                      {p.type === "refund" ? "−" : ""}
                      {taka(p.amount)}
                    </dd>
                  </div>
                ))}
                {Number(open.sale.refunded_total) > 0 && (
                  <div className="flex justify-between font-semibold border-t border-border-light pt-1 mt-1">
                    <dt>{t("shop.sales.net")}</dt>
                    <dd>{taka(Number(open.sale.total) - Number(open.sale.refunded_total))}</dd>
                  </div>
                )}
              </dl>

              {open.sale.note && (
                <p className="text-xs bg-surface-subtle rounded p-2">
                  <b>{t("shop.common.note")}:</b> {open.sale.note}
                </p>
              )}

              {notice && <p className="text-sm text-primary bg-surface-subtle rounded p-2">{notice}</p>}

              {canManage ? (
                open.sale.status !== "refunded" && (
                  <div className="flex flex-col gap-2 border-t border-border-light pt-3">
                    <h4 className="text-sm font-semibold">{t("shop.sales.returnTitle")}</h4>
                    <p className="text-xs text-text-muted">{t("shop.sales.exchangeHint")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PayMethod)} className={field}>
                        {PAY_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {t("shop.sales.refundBy", { method: t(`shop.method.${m}`) })}
                          </option>
                        ))}
                      </select>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("shop.sales.reason")} className={field} />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                      {t("shop.sales.restock")}
                    </label>
                    <button className={btnPrimary} disabled={!returning || busy} onClick={doReturn}>
                      {t("shop.sales.doReturn")}
                    </button>
                  </div>
                )
              ) : (
                <p className="text-xs text-text-muted border-t border-border-light pt-2">{t("shop.sales.needManager")}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "strong" | "bad" }) {
  return (
    <div className={`${card} px-3 py-2.5 ${tone === "strong" ? "border-primary/40" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">{label}</p>
      <p className={`font-display text-xl font-bold ${tone === "bad" ? "text-badge-discount" : tone === "strong" ? "text-primary" : "text-on-surface"}`}>{value}</p>
      {sub && <p className="text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}
