"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, card, dateTime, field } from "@/components/admin/pos/api";
import { DateRangeInputs, dhakaDay, matchPeriod, periodDays, shiftDays, type Period } from "@/components/admin/filters/period";
import type { FabricMove, FabricMoveKind, FabricTotals, FabricWithStock } from "@/lib/custom-jersey/fabric-stock";
import type { SupplierOption } from "@/components/admin/pickers";

const KINDS: FabricMoveKind[] = ["purchase", "used", "wastage", "adjust"];
const QUICK: Period[] = ["today", "7d", "30d", "month", "all"];
const kgFmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(n) || 0);

interface Page {
  moves: FabricMove[];
  totals?: FabricTotals;
  has_more?: boolean;
  needs_migration?: boolean;
}

/**
 * Every fabric entry (bought, used, wasted, corrected), like the order history:
 * a date range with quick picks and ◀ ▶, filters by type, fabric and supplier,
 * a search in the notes, totals for what is shown, grouped by day, CSV download.
 */
export function FabricHistory({ fabrics, suppliers, name, reloadKey, onUndo }: {
  fabrics: FabricWithStock[];
  suppliers: SupplierOption[];
  name: (f: { name_en: string; name_bn: string | null }) => string;
  reloadKey: number;
  onUndo: (m: FabricMove) => Promise<void>;
}) {
  const { t } = useT();
  const [range, setRange] = useState(() => periodDays("30d"));
  const [kind, setKind] = useState<FabricMoveKind | "">("");
  const [fabricId, setFabricId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [voided, setVoided] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search waits for a pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const query = useCallback(
    (offset: number) => {
      const qs = new URLSearchParams();
      if (range.from) qs.set("from", range.from);
      if (range.to) qs.set("to", range.to);
      if (kind) qs.set("kind", kind);
      if (fabricId) qs.set("fabric_id", fabricId);
      if (supplierId) qs.set("supplier_id", supplierId);
      if (q) qs.set("q", q);
      if (voided) qs.set("voided", "1");
      if (offset) qs.set("offset", String(offset));
      return `/api/admin/fabric-stock?${qs}`;
    },
    [range, kind, fabricId, supplierId, q, voided]
  );

  useEffect(() => {
    let alive = true;
    void api<Page>(query(0)).then((res) => {
      if (!alive) return;
      if (!res.ok) return setError(res.error);
      setError(null);
      setPage(res.data);
    });
    return () => {
      alive = false;
    };
  }, [query, reloadKey]);

  async function more() {
    if (!page) return;
    setLoadingMore(true);
    const res = await api<Page>(query(page.moves.length));
    setLoadingMore(false);
    if (!res.ok) return setError(res.error);
    setPage({ ...page, moves: [...page.moves, ...res.data.moves], has_more: res.data.has_more });
  }

  const fabricName = (id: string) => {
    const f = fabrics.find((x) => x.id === id);
    return f ? name(f) : "—";
  };
  const supplierName = (id: string | null) => (id ? suppliers.find((s) => s.id === id)?.name ?? "" : "");

  const days = useMemo(() => {
    const out: { day: string; moves: FabricMove[] }[] = [];
    for (const m of page?.moves ?? []) {
      const last = out[out.length - 1];
      if (last && last.day === m.move_date) last.moves.push(m);
      else out.push({ day: m.move_date, moves: [m] });
    }
    return out;
  }, [page]);

  function csv() {
    const rows = [
      ["date", "entered", "type", "reason", "fabric", "kg", "pieces", "cost_per_kg", "total_cost", "supplier", "order", "note", "staff", "undone"],
      ...(page?.moves ?? []).map((m) => [
        m.move_date,
        m.created_at,
        m.kind,
        m.reason ?? "",
        fabricName(m.fabric_id),
        String(m.kg),
        m.pieces ?? "",
        m.cost_per_kg ?? "",
        m.total_cost ?? "",
        supplierName(m.supplier_id),
        m.order_number ?? "",
        m.note ?? "",
        m.staff ?? "",
        m.voided_at ? m.void_reason ?? "yes" : "",
      ]),
    ];
    const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fabric-history-${range.from || "all"}-${range.to || dhakaDay(0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const active = matchPeriod(range.from, range.to);
  const chip = (on: boolean) => `h-8 px-3 rounded-full border text-xs font-semibold ${on ? "border-primary bg-primary/10 text-on-surface" : "border-border-light bg-surface-card text-on-surface-variant hover:bg-surface-subtle"}`;
  const tot = page?.totals;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg uppercase font-bold text-primary">{t("shop.fabricStock.history")}</h2>
        <button type="button" className={`${btnGhost} ml-auto !text-xs`} onClick={csv} disabled={!page?.moves.length}>
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      <div className={`${card} p-3 flex flex-col gap-2.5`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK.map((p) => (
            <button key={p} type="button" className={chip(active === p)} onClick={() => setRange(periodDays(p))}>
              {t(`shop.filters.periods.${p}`)}
            </button>
          ))}
          <span className="inline-flex items-center gap-1 ml-auto">
            <button type="button" className="p-1.5 rounded border border-border-light hover:bg-surface-subtle disabled:opacity-40" disabled={!range.from || !range.to} onClick={() => setRange(shiftDays(range.from, range.to, -1))} aria-label={t("shop.fabricStock.earlier")}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <DateRangeInputs from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} className={`${field} !w-auto !py-1 text-xs`} />
            <button type="button" className="p-1.5 rounded border border-border-light hover:bg-surface-subtle disabled:opacity-40" disabled={!range.from || !range.to || range.to >= dhakaDay(0)} onClick={() => setRange(shiftDays(range.from, range.to, 1))} aria-label={t("shop.fabricStock.later")}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as FabricMoveKind | "")} aria-label={t("shop.fabricStock.allKinds")}>
            <option value="">{t("shop.fabricStock.allKinds")}</option>
            {KINDS.map((k) => <option key={k} value={k}>{t(`shop.fabricStock.kinds.${k}`)}</option>)}
          </select>
          <select className={field} value={fabricId} onChange={(e) => setFabricId(e.target.value)} aria-label={t("shop.fabricStock.allFabrics")}>
            <option value="">{t("shop.fabricStock.allFabrics")}</option>
            {fabrics.map((f) => <option key={f.id} value={f.id}>{name(f)}</option>)}
          </select>
          <select className={field} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label={t("shop.fabricStock.allSuppliers")}>
            <option value="">{t("shop.fabricStock.allSuppliers")}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input className={`${field} pl-8 w-full`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("shop.fabricStock.searchNote")} />
          </label>
        </div>
        <label className="text-xs flex items-center gap-1.5 text-on-surface-variant">
          <input type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} /> {t("shop.fabricStock.showUndone")}
        </label>
      </div>

      {page?.needs_migration && (
        <p className="text-xs text-on-surface-variant bg-surface-subtle rounded-lg px-3 py-2">{t("shop.fabricStock.needsMigration")}</p>
      )}
      {error && <p className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2" role="alert"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</p>}

      {tot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className={`${card} p-2`}><div className="text-text-muted">{t("shop.fabricStock.bought")}</div><div className="font-semibold tabular-nums">{kgFmt(tot.bought_kg)} kg</div><div className="text-text-muted tabular-nums">{taka(tot.bought_cost)}</div></div>
          <div className={`${card} p-2`}><div className="text-text-muted">{t("shop.fabricStock.used")}</div><div className="font-semibold tabular-nums">{kgFmt(tot.used_kg)} kg</div></div>
          <div className={`${card} p-2`}><div className="text-text-muted">{t("shop.fabricStock.wasted")}</div><div className="font-semibold tabular-nums text-badge-discount">{kgFmt(tot.wasted_kg)} kg</div></div>
          <div className={`${card} p-2`}><div className="text-text-muted">{t("shop.fabricStock.entries")}</div><div className="font-semibold tabular-nums">{tot.count}</div><div className="text-text-muted tabular-nums">{tot.adjust_kg ? `${t("shop.fabricStock.kinds.adjust")} ${tot.adjust_kg > 0 ? "+" : "−"}${kgFmt(Math.abs(tot.adjust_kg))} kg` : " "}</div></div>
        </div>
      )}

      {!page ? (
        !error && <p className="text-sm text-text-muted">…</p>
      ) : days.length === 0 ? (
        <p className={`${card} p-3 text-sm text-text-muted`}>{t("shop.fabricStock.empty")}</p>
      ) : (
        days.map(({ day, moves }) => (
          <div key={day} className={`${card} overflow-hidden`}>
            <div className="px-3 py-1.5 bg-surface-subtle text-xs font-semibold text-on-surface-variant flex justify-between">
              <span>{new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="tabular-nums">{moves.length}</span>
            </div>
            <div className="divide-y divide-border-light">
              {moves.map((m) => {
                const supplier = supplierName(m.supplier_id);
                return (
                  <div key={m.id} className={`p-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1 ${m.voided_at ? "opacity-50" : ""}`}>
                    <span className="font-semibold">{t(`shop.fabricStock.kinds.${m.kind}`)}{m.reason ? ` · ${t(`shop.fabricStock.reasons.${m.reason}`)}` : ""}</span>
                    <span className={m.voided_at ? "line-through" : ""}>{fabricName(m.fabric_id)}</span>
                    <span className={`tabular-nums font-semibold ${m.kg > 0 ? "text-green-600 dark:text-green-400" : "text-badge-discount"} ${m.voided_at ? "line-through" : ""}`}>{m.kg > 0 ? "+" : "−"}{kgFmt(Math.abs(m.kg))} kg</span>
                    {m.pieces ? <span className="text-text-muted">{m.pieces} {t("shop.fabricStock.pieces")}</span> : null}
                    {m.kind === "purchase" && m.cost_per_kg !== null && <span className="text-text-muted">{taka(m.cost_per_kg)}/kg · {taka(m.total_cost ?? 0)}</span>}
                    {supplier && <span className="text-text-muted">{supplier}</span>}
                    {m.order_number && <span className="text-text-muted">{m.order_number}</span>}
                    {m.note && <span className="text-text-muted italic">{m.note}</span>}
                    <span className="text-xs text-text-muted">
                      {m.staff ? `${t("shop.fabricStock.by", { name: m.staff })} · ` : ""}
                      {t("shop.fabricStock.entered", { time: dateTime(m.created_at) })}
                    </span>
                    {m.voided_at ? (
                      <span className="text-xs text-badge-discount ml-auto">{t("shop.fabricStock.undone", { reason: m.void_reason ?? "" })}</span>
                    ) : (
                      <button className="text-xs underline underline-offset-2 ml-auto text-text-muted hover:text-badge-discount" onClick={() => void onUndo(m)}>{t("shop.fabricStock.undo")}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
      {page?.has_more && (
        <button type="button" className={`${btnGhost} self-center`} onClick={more} disabled={loadingMore}>
          {loadingMore ? "…" : t("shop.fabricStock.loadMore")}
        </button>
      )}
    </section>
  );
}
