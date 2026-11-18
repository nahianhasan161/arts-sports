"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PeriodSelect, inPeriod, type Period } from "@/components/admin/filters/period";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { card, dateTime, field } from "@/components/admin/pos/api";
import { purchaseNo, type PurchaseRow } from "@/lib/pos/purchase-types";
import { PurchaseDetail } from "./PurchaseDetail";

/** A table of purchases; a row opens the full bill. */
export function PurchaseList({ rows: all, showSupplier = true, onChanged }: { rows: PurchaseRow[]; showSupplier?: boolean; onChanged?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [dueOnly, setDueOnly] = useState(false);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (p) =>
        inPeriod(p.created_at, period) &&
        (!dueOnly || Number(p.due) > 0) &&
        (!term || [purchaseNo(p), p.reference, p.supplier].some((v) => (v ?? "").toString().toLowerCase().includes(term))),
    );
  }, [all, q, period, dueOnly]);
  const sum = rows.reduce(
    (a, p) => ({
      lines: a.lines + Number(p.lines || 0),
      pieces: a.pieces + Number(p.pieces || 0),
      payable: a.payable + Number(p.payable || 0),
      paid: a.paid + Number(p.paid || 0),
      due: a.due + Number(p.due || 0),
    }),
    { lines: 0, pieces: 0, payable: 0, paid: 0, due: 0 },
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.filters.search")} className={`${field} pl-9`} />
        </div>
        <PeriodSelect value={period} onChange={setPeriod} className={`${field} !w-auto`} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
          {t("shop.filters.dueOnly")}
        </label>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted text-left">
            <tr>
              <th className="p-2">{t("shop.purchase.no")}</th>
              <th className="p-2">{t("shop.purchase.date")}</th>
              {showSupplier && <th className="p-2">{t("shop.purchase.supplier")}</th>}
              <th className="p-2">{t("shop.purchase.items")}</th>
              <th className="p-2 text-right">{t("shop.purchase.payable")}</th>
              <th className="p-2 text-right">{t("shop.purchase.paid")}</th>
              <th className="p-2 text-right">{t("shop.purchase.due")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-text-muted">
                  {t("shop.common.none")}
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border-light hover:bg-surface-subtle cursor-pointer" onClick={() => setOpen(p.id)}>
                <td className="p-2 font-mono text-xs">
                  {purchaseNo(p)}
                  {p.reference && <span className="block text-text-muted">{p.reference}</span>}
                </td>
                <td className="p-2 text-xs whitespace-nowrap">{dateTime(p.created_at)}</td>
                {showSupplier && <td className="p-2">{p.supplier || "—"}</td>}
                <td className="p-2 text-xs text-text-muted">{t("shop.purchase.pieces", { lines: p.lines, n: p.pieces })}</td>
                <td className="p-2 text-right font-semibold">{taka(p.payable)}</td>
                <td className="p-2 text-right text-green-700">{taka(p.paid)}</td>
                <td className={`p-2 text-right font-semibold ${p.due > 0 ? "text-badge-discount" : "text-text-muted"}`}>{p.due > 0 ? taka(p.due) : "—"}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-border-light bg-surface-subtle font-semibold">
              <tr>
                <td className="p-2" colSpan={showSupplier ? 3 : 2}>
                  {t("shop.purchase.totalRow", { n: rows.length })}
                </td>
                <td className="p-2 text-xs text-text-muted">
                  {t("shop.purchase.pieces", { lines: sum.lines, n: sum.pieces })}
                </td>
                <td className="p-2 text-right">{taka(sum.payable)}</td>
                <td className="p-2 text-right text-green-700">{taka(sum.paid)}</td>
                <td className={`p-2 text-right ${sum.due > 0 ? "text-badge-discount" : "text-text-muted"}`}>{sum.due > 0 ? taka(sum.due) : "—"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {open && <PurchaseDetail id={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </>
  );
}
