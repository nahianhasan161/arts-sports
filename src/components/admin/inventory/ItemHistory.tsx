"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { api, card, dateTime } from "@/components/admin/pos/api";
import { Sheet } from "@/components/admin/purchases/SupplierForm";
import { AuditList } from "@/components/admin/purchases/History";
import type { AuditEntry } from "@/lib/pos/purchase-types";

const REASONS = ["pos_sale", "pos_return", "stock_in", "stock_in_fix", "adjust_count", "adjust_damaged", "adjust_lost", "adjust_found", "adjust_other", "transfer_in", "transfer_out"] as const;

interface Move {
  delta: number;
  reason: string;
  note: string | null;
  place: string;
  staff: string;
  created_at: string;
}

/** One item: every stock change and every price change, with who did it and why. */
export function ItemHistory({ variantId, onClose }: { variantId: string; onClose: () => void }) {
  const { t } = useT();
  const [data, setData] = useState<{ item: { title: string; label: string; code: string }; movements: Move[]; changes: AuditEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api<NonNullable<typeof data>>(`/api/admin/inventory?history=${encodeURIComponent(variantId)}`).then((res) => {
      if (!live) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [variantId]);

  return (
    <Sheet title={data ? t("shop.history.itemTitle", { item: `${data.item.title} ${data.item.label}`.trim() }) : t("shop.common.loading")} onClose={onClose}>
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      {!data && !error && <p className="text-sm text-text-muted">{t("shop.common.loading")}</p>}
      {data && (
        <div className="flex flex-col gap-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold text-text-muted mb-1">{t("shop.history.priceChanges")}</h3>
            <AuditList entries={data.changes} />
          </section>
          <section>
            <h3 className="text-xs font-semibold text-text-muted mb-1">{t("shop.history.stockMoves")}</h3>
            <div className={`${card} overflow-x-auto max-h-80`}>
              <table className="w-full text-xs">
                <tbody>
                  {data.movements.length === 0 && (
                    <tr>
                      <td className="p-2 text-text-muted">{t("shop.history.none")}</td>
                    </tr>
                  )}
                  {data.movements.map((m, n) => (
                    <tr key={n} className="border-t border-border-light first:border-0">
                      <td className="p-2 whitespace-nowrap text-text-muted">{dateTime(m.created_at)}</td>
                      <td className={`p-2 text-right font-bold ${m.delta < 0 ? "text-badge-discount" : "text-green-700"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                      <td className="p-2">
                        {(REASONS as readonly string[]).includes(m.reason) ? t(`shop.stock.why.${m.reason as (typeof REASONS)[number]}`) : m.reason}
                        {m.place && <span className="text-text-muted"> · {m.place}</span>}
                        {m.note && <span className="block text-text-muted">{m.note}</span>}
                      </td>
                      <td className="p-2 font-semibold">{m.staff || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
