"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";
import { Worksheet } from "@/components/admin/inventory/Worksheet";
import { Suppliers } from "@/components/admin/inventory/Suppliers";
import { Labels } from "@/components/admin/inventory/Labels";
import type { Showroom, StockRow, Supplier } from "@/components/admin/inventory/types";

const TABS = ["stock", "receive", "count", "transfer", "labels", "suppliers", "history"] as const;
type Tab = (typeof TABS)[number];

interface Movement {
  variant_id: string;
  delta: number;
  reason: string;
  note: string | null;
  unit_cost: number | null;
  staff: string;
  title: string;
  label: string;
  created_at: string;
}

const KNOWN_REASONS = ["pos_sale", "pos_return", "stock_in", "adjust_count", "adjust_damaged", "adjust_lost", "adjust_found", "adjust_other", "transfer_in", "transfer_out"] as const;

/** Stock (roadmap 4.4). Needs the `inventory.manage` permission. */
export default function InventoryPage() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("stock");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [showroomId, setShowroomId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [picked, setPicked] = useState<Map<string, StockRow>>(new Map());
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<{ rows: StockRow[]; showrooms: Showroom[]; showroom_id: string }>(`/api/admin/inventory?q=${encodeURIComponent(q)}&low=${lowOnly ? 1 : 0}&showroom_id=${encodeURIComponent(showroomId)}`);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setRows(res.data.rows);
    setShowrooms(res.data.showrooms);
    setShowroomId((current) => current || res.data.showroom_id);
    // Keep the chosen rows' numbers fresh after a save.
    setPicked((current) => {
      if (!current.size) return current;
      const next = new Map(current);
      for (const r of res.data.rows) if (next.has(r.variant_id)) next.set(r.variant_id, r);
      return next;
    });
  }, [q, lowOnly, showroomId]);

  const loadSuppliers = useCallback(async () => {
    const res = await api<{ suppliers: Supplier[] }>("/api/admin/inventory/suppliers");
    if (res.ok) setSuppliers(res.data.suppliers);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);
  useEffect(() => {
    const timer = setTimeout(() => void loadSuppliers(), 0);
    return () => clearTimeout(timer);
  }, [loadSuppliers]);
  useEffect(() => {
    if (tab !== "history") return;
    const timer = setTimeout(() => void api<{ movements: Movement[] }>("/api/admin/inventory?movements=all").then((res) => (res.ok ? setMovements(res.data.movements) : setError(res.error))), 0);
    return () => clearTimeout(timer);
  }, [tab]);

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const chosen = useMemo(() => [...picked.values()], [picked]);
  const lowCount = rows.filter((r) => r.low).length;

  const toggle = (r: StockRow) =>
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(r.variant_id)) next.delete(r.variant_id);
      else next.set(r.variant_id, r);
      return next;
    });

  async function done(message: string) {
    setNotice(message);
    await load();
  }

  async function saveThreshold(r: StockRow, value: string) {
    if (value === String(r.low_stock_threshold ?? "")) return;
    const res = await api("/api/admin/inventory", { action: "threshold", variant_id: r.variant_id, value });
    if (!res.ok) return setError(res.error);
    void load();
  }

  const visibleTabs = TABS.filter((id) => id !== "transfer" || showrooms.length > 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden flex flex-wrap items-center gap-2">
        {visibleTabs.map((id) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${tab === id ? "bg-primary text-primary-foreground" : "bg-surface-card border border-border-light"}`}>
            {t(`shop.stock.tabs.${id}`)}
          </button>
        ))}
        {picked.size > 0 && (
          <span className="text-xs text-text-muted ml-2">
            {t("shop.stock.selected", { n: picked.size })}{" "}
            <button className="underline" onClick={() => setPicked(new Map())}>
              {t("shop.stock.clear")}
            </button>
          </span>
        )}
        {showrooms.length > 1 && (
          <select value={showroomId} onChange={(e) => setShowroomId(e.target.value)} className={`${field} !w-auto ml-auto`}>
            {showrooms.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="print:hidden text-sm text-badge-discount bg-badge-discount/10 rounded p-3">{error}</p>}
      {notice && <p className="print:hidden text-sm text-green-800 bg-green-50 rounded p-3">{notice}</p>}

      {tab === "stock" && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.stock.searchPlaceholder")} className={`${field} pl-9`} />
            </div>
            <button className={`${lowOnly ? btnPrimary : btnGhost}`} onClick={() => setLowOnly((v) => !v)}>
              <AlertTriangle className="w-4 h-4" /> {t("shop.stock.lowOnly")} {lowCount > 0 && `(${lowCount})`}
            </button>
          </div>
          <p className="text-xs text-text-muted">{t("shop.stock.pickHint")}</p>
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="text-xs text-text-muted text-left">
                <tr>
                  <th className="p-2 w-8" />
                  <th className="p-2">{t("shop.stock.product")}</th>
                  <th className="p-2">{t("shop.stock.code")}</th>
                  <th className="p-2 text-right">{t("shop.stock.onShelf")}</th>
                  <th className="p-2 text-right">{t("shop.stock.reserved")}</th>
                  <th className="p-2">{t("shop.stock.atSupplier")}</th>
                  <th className="p-2 text-right">{t("shop.stock.cost")}</th>
                  <th className="p-2 w-20">{t("shop.stock.alertAt")}</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="p-4 text-text-muted">
                      {t("shop.common.loading")}
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-text-muted">
                      {t("shop.common.none")}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.variant_id} className={`border-t border-border-light ${picked.has(r.variant_id) ? "bg-surface-subtle" : ""} ${r.is_active ? "" : "opacity-50"}`}>
                    <td className="p-2">
                      <input type="checkbox" checked={picked.has(r.variant_id)} onChange={() => toggle(r)} />
                    </td>
                    <td className="p-2 cursor-pointer" onClick={() => toggle(r)}>
                      {r.title} <span className="text-text-muted">{r.label}</span>
                    </td>
                    <td className="p-2 font-mono text-xs text-text-muted">{r.barcode ?? r.sku ?? "—"}</td>
                    <td className={`p-2 text-right font-semibold ${r.low ? "text-badge-discount" : ""}`}>
                      {r.quantity}
                      {r.low && <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />}
                    </td>
                    <td className="p-2 text-right text-text-muted">{r.reserved || ""}</td>
                    <td className="p-2 text-xs">{r.suppliers.map((s) => `${supplierName.get(s.supplier_id) ?? "?"}: ${s.quantity}`).join(", ")}</td>
                    <td className="p-2 text-right text-text-muted">{r.cost_price === null ? "" : taka(r.cost_price)}</td>
                    <td className="p-2">
                      <input defaultValue={r.low_stock_threshold ?? ""} placeholder={String(r.threshold)} onBlur={(e) => saveThreshold(r, e.target.value.trim())} className="w-16 border border-border-light rounded px-1.5 py-1 bg-surface-subtle text-xs" inputMode="numeric" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(tab === "receive" || tab === "count" || tab === "transfer") && <Worksheet key={tab} mode={tab} rows={chosen} suppliers={suppliers} showrooms={showrooms} showroomId={showroomId} onDone={done} />}
      {tab === "labels" && <Labels rows={chosen} onChanged={done} />}
      {tab === "suppliers" && <Suppliers onChanged={() => void Promise.all([load(), loadSuppliers()])} />}

      {tab === "history" && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td className="p-4 text-text-muted">{t("shop.common.none")}</td>
                </tr>
              )}
              {movements.map((m, n) => (
                <tr key={n} className="border-t border-border-light first:border-0">
                  <td className="p-2 text-xs text-text-muted whitespace-nowrap">{dateTime(m.created_at)}</td>
                  <td className="p-2">
                    {m.title} <span className="text-text-muted">{m.label}</span>
                  </td>
                  <td className={`p-2 text-right font-bold ${m.delta < 0 ? "text-badge-discount" : "text-green-700"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className="p-2 text-xs">
                    {(KNOWN_REASONS as readonly string[]).includes(m.reason) ? t(`shop.stock.why.${m.reason as (typeof KNOWN_REASONS)[number]}`) : m.reason}
                    {m.note && <span className="text-text-muted"> · {m.note}</span>}
                  </td>
                  <td className="p-2 text-xs text-text-muted">{m.staff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
