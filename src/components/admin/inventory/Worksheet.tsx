"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnPrimary, card, field } from "@/components/admin/pos/api";
import type { Showroom, StockRow, Supplier } from "./types";

const REASONS = ["count", "damaged", "lost", "found", "other"] as const;

/**
 * One sheet for the three things done to chosen items:
 *   receive  - goods came in (quantity + buying price, from a supplier)
 *   count    - what is really on the shelf, with a reason for the difference
 *   transfer - move between two shops or stores
 */
export function Worksheet({ mode, rows, suppliers, showrooms, showroomId, onDone }: { mode: "receive" | "count" | "transfer"; rows: StockRow[]; suppliers: Supplier[]; showrooms: Showroom[]; showroomId: string; onDone: (message: string) => void }) {
  const { t } = useT();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("count");
  const [note, setNote] = useState("");
  const [to, setTo] = useState(showrooms.find((s) => s.id !== showroomId)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!rows.length) return <p className="text-sm text-text-muted">{t("shop.stock.pickFirst")}</p>;

  const filled = rows.filter((r) => (qty[r.variant_id] ?? "") !== "");
  const totalCost = mode === "receive" ? filled.reduce((s, r) => s + (Number(qty[r.variant_id]) || 0) * (Number(cost[r.variant_id] ?? r.cost_price ?? 0) || 0), 0) : 0;

  async function save() {
    setBusy(true);
    setError(null);
    let failure: string | null = null;
    if (mode === "receive") {
      const res = await api("/api/admin/inventory", {
        action: "receive",
        showroom_id: showroomId,
        supplier_id: supplier,
        reference,
        note,
        items: filled.map((r) => ({ variant_id: r.variant_id, quantity: Number(qty[r.variant_id]), unit_cost: cost[r.variant_id] ?? (r.cost_price ?? "") })),
      });
      if (!res.ok) failure = res.error;
    } else if (mode === "count") {
      const res = await api("/api/admin/inventory", { action: "adjust", showroom_id: showroomId, reason, note, items: filled.map((r) => ({ variant_id: r.variant_id, counted: Number(qty[r.variant_id]) })) });
      if (!res.ok) failure = res.error;
    } else {
      for (const r of filled) {
        const res = await api("/api/admin/inventory", { action: "transfer", variant_id: r.variant_id, from: showroomId, to, quantity: Number(qty[r.variant_id]), note });
        if (!res.ok) {
          failure = `${r.title} ${r.label}: ${res.error}`;
          break;
        }
      }
    }
    setBusy(false);
    if (failure) return setError(failure);
    setQty({});
    setCost({});
    setNote("");
    setReference("");
    onDone(t("shop.stock.saved", { n: filled.length }));
  }

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      <p className="text-sm text-text-muted">{t(`shop.stock.hint.${mode}`)}</p>
      <div className="grid sm:grid-cols-3 gap-2">
        {mode === "receive" && (
          <>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={field}>
              <option value="">{t("shop.stock.noSupplier")}</option>
              {suppliers
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("shop.stock.reference")} className={field} />
          </>
        )}
        {mode === "count" && (
          <select value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} className={field}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`shop.stock.reason.${r}`)}
              </option>
            ))}
          </select>
        )}
        {mode === "transfer" && (
          <select value={to} onChange={(e) => setTo(e.target.value)} className={field}>
            {showrooms
              .filter((s) => s.id !== showroomId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  → {s.name}
                </option>
              ))}
          </select>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.common.note")} className={field} />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted text-left">
            <tr>
              <th className="p-2">{t("shop.stock.product")}</th>
              <th className="p-2 text-right">{t("shop.stock.onShelf")}</th>
              <th className="p-2 w-28">{t(mode === "count" ? "shop.stock.counted" : "shop.common.qty")}</th>
              {mode === "receive" && <th className="p-2 w-28">{t("shop.stock.unitCost")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const counted = qty[r.variant_id];
              const diff = mode === "count" && counted !== undefined && counted !== "" ? Number(counted) - r.quantity : 0;
              return (
                <tr key={r.variant_id} className="border-t border-border-light">
                  <td className="p-2">
                    {r.title} <span className="text-text-muted">{r.label}</span>
                  </td>
                  <td className="p-2 text-right">{r.quantity}</td>
                  <td className="p-2">
                    <input value={counted ?? ""} onChange={(e) => setQty((c) => ({ ...c, [r.variant_id]: e.target.value.replace(/[^\d]/g, "") }))} className={field} inputMode="numeric" />
                    {diff !== 0 && <span className={`text-xs font-semibold ${diff < 0 ? "text-badge-discount" : "text-green-700"}`}>{diff > 0 ? `+${diff}` : diff}</span>}
                  </td>
                  {mode === "receive" && (
                    <td className="p-2">
                      <input value={cost[r.variant_id] ?? (r.cost_price ?? "")} onChange={(e) => setCost((c) => ({ ...c, [r.variant_id]: e.target.value }))} className={field} inputMode="decimal" />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mode === "receive" && totalCost > 0 && <p className="text-sm font-semibold">{t("shop.stock.totalCost", { amount: taka(totalCost) })}</p>}
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      <button className={`${btnPrimary} self-start`} disabled={busy || !filled.length || (mode === "transfer" && !to)} onClick={save}>
        {t(`shop.stock.do.${mode}`)}
      </button>
    </div>
  );
}
