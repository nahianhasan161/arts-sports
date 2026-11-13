"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { useT } from "@/i18n/client";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { Barcode } from "@/components/admin/pos/Codes";
import type { StockRow } from "./types";

/**
 * Barcode labels (Code 128) for an A4 sticker sheet, 3 across and 8 down.
 * The code printed is the variant's barcode, or its SKU when it has no
 * barcode; "Give barcodes" makes one for every chosen item that has neither.
 */
export function Labels({ rows, onChanged }: { rows: StockRow[]; onChanged: (message: string) => void }) {
  const { t } = useT();
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (!rows.length) return <p className="text-sm text-text-muted">{t("shop.stock.pickFirst")}</p>;

  const code = (r: StockRow) => r.barcode ?? r.sku ?? "";
  const missing = rows.filter((r) => !code(r));
  const labels = rows.filter((r) => code(r)).flatMap((r) => Array.from({ length: Math.min(200, Math.max(0, Number(copies[r.variant_id] ?? 1) || 0)) }, (_, n) => ({ row: r, key: `${r.variant_id}:${n}` })));

  async function generate() {
    const res = await api<{ made: number }>("/api/admin/inventory", { action: "barcodes", variant_ids: missing.map((r) => r.variant_id) });
    if (!res.ok) return setError(res.error);
    setError(null);
    onChanged(t("shop.labels.generated", { n: res.data.made }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="print:hidden flex flex-col gap-3 max-w-3xl">
        <p className="text-sm text-text-muted">{t("shop.labels.hint")}</p>
        {missing.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3 flex items-center justify-between gap-3">
            <span>{t("shop.labels.noCode", { n: missing.length })}</span>
            <button className={btnGhost} onClick={generate}>
              {t("shop.labels.generate")}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.variant_id} className="flex items-center gap-2 text-sm">
              <input value={copies[r.variant_id] ?? "1"} onChange={(e) => setCopies((c) => ({ ...c, [r.variant_id]: e.target.value.replace(/[^\d]/g, "") }))} className={`${field} !w-16`} inputMode="numeric" disabled={!code(r)} />
              <span>
                {r.title} <span className="text-text-muted">{r.label}</span> <code className="text-xs text-text-muted">{code(r) || "—"}</code>
              </span>
              <button className="text-xs underline text-text-muted" onClick={() => setCopies((c) => ({ ...c, [r.variant_id]: String(r.quantity) }))} disabled={!code(r)}>
                {t("shop.labels.asStock", { n: r.quantity })}
              </button>
            </li>
          ))}
        </ul>
        <button className={`${btnPrimary} self-start`} disabled={!labels.length} onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> {t("shop.labels.print", { n: labels.length })}
        </button>
      </div>

      <style>{`@media print { @page { size: A4; margin: 8mm; } body { background: #fff !important; } }`}</style>
      <div className="grid grid-cols-3 gap-x-[3mm] gap-y-0 bg-white max-w-[194mm]">
        {labels.map(({ row, key }) => (
          <div key={key} className="h-[35mm] px-[3mm] py-[2mm] flex flex-col items-center justify-center text-black text-center overflow-hidden break-inside-avoid border border-dashed border-gray-200 print:border-0">
            <p className="text-[9px] font-semibold leading-tight line-clamp-2 w-full">
              {row.title} {row.label && `· ${row.label}`}
            </p>
            <Barcode value={code(row)} height={36} className="w-full h-[14mm] my-[1mm]" />
            <p className="text-[9px] font-mono leading-none">{code(row)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
