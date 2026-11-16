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
        </table>
      </div>
      {open && <PurchaseDetail id={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </>
  );
}
