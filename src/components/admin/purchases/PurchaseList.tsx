"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { card, dateTime } from "@/components/admin/pos/api";
import { purchaseNo, type PurchaseRow } from "@/lib/pos/purchase-types";
import { PurchaseDetail } from "./PurchaseDetail";

/** A table of purchases; a row opens the full bill. */
export function PurchaseList({ rows, showSupplier = true, onChanged }: { rows: PurchaseRow[]; showSupplier?: boolean; onChanged?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
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
