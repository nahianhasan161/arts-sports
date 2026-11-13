"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { PAY_METHODS, taka, type PayMethod, type SaleDetail } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "./api";

interface SaleRow {
  id: string;
  receipt_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  refunded_total: number;
  status: "completed" | "partially_refunded" | "refunded";
  staff: string;
  created_at: string;
}

/** Past sales: find one by receipt number, phone or by scanning the receipt's QR, reprint it, or take goods back. */
export function SalesTab({ canManage, initialQuery }: { canManage: boolean; initialQuery: string }) {
  const { t } = useT();
  const [q, setQ] = useState(initialQuery);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [open, setOpen] = useState<SaleDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openSale = useCallback(async (id: string) => {
    const res = await api<SaleDetail>(`/api/admin/pos/sales/${id}`);
    if (!res.ok) return setError(res.error);
    setOpen(res.data);
    setQty({});
    setReason("");
    setNotice(null);
    setError(null);
  }, []);

  const load = useCallback(
    async (term: string) => {
      const res = await api<{ sales: SaleRow[] }>(`/api/admin/pos/sales?q=${encodeURIComponent(term)}`);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRows(res.data.sales);
      // A scan or an exact receipt number finds one sale: open it.
      if (term && res.data.sales.length === 1) void openSale(res.data.sales[0].id);
    },
    [openSale]
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(initialQuery), 0);
    return () => clearTimeout(timer);
  }, [load, initialQuery]);

  async function doReturn() {
    if (!open) return;
    setBusy(true);
    const res = await api<{ refund_amount: number }>(`/api/admin/pos/sales/${open.sale.id}`, {
      items: Object.entries(qty).map(([sale_item_id, quantity]) => ({ sale_item_id, quantity })),
      refund_method: method,
      reason,
      restock,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await openSale(open.sale.id);
    setNotice(t("shop.sales.returned", { amount: taka(res.data.refund_amount) }));
    void load(q);
  }

  const returning = Object.values(qty).some((n) => n > 0);

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <section className="flex flex-col gap-3">
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
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <ul className={`${card} divide-y divide-border-light`}>
          {rows.length === 0 && <li className="p-4 text-sm text-text-muted">{t("shop.common.none")}</li>}
          {rows.map((r) => (
            <li key={r.id}>
              <button className={`w-full text-left p-3 flex justify-between gap-3 text-sm hover:bg-surface-subtle ${open?.sale.id === r.id ? "bg-surface-subtle" : ""}`} onClick={() => openSale(r.id)}>
                <span>
                  <strong className="text-primary">{r.receipt_no}</strong> · {r.customer_name || r.customer_phone || t("shop.sales.walkIn")}
                  <span className="block text-xs text-text-muted">
                    {dateTime(r.created_at)} · {r.staff}
                  </span>
                </span>
                <span className="text-right">
                  <strong>{taka(r.total)}</strong>
                  {r.status !== "completed" && <span className="block text-xs text-badge-discount">{t(`shop.sales.status.${r.status}`)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <section className={`${card} p-4 flex flex-col gap-3`}>
          <div className="flex justify-between items-start gap-2">
            <div>
              <h3 className="font-display font-bold text-primary text-lg">{open.sale.receipt_no}</h3>
              <p className="text-xs text-text-muted">
                {dateTime(open.sale.created_at)} · {open.sale.staff} · {open.sale.customer_name || open.sale.customer_phone || t("shop.sales.walkIn")}
              </p>
            </div>
            <a className={btnGhost} href={`/admin/pos/receipt/${open.sale.id}`} target="_blank" rel="noreferrer">
              <Printer className="w-4 h-4" /> {t("shop.sales.reprint")}
            </a>
          </div>

          <table className="text-sm w-full">
            <tbody>
              {open.items.map((i) => {
                const left = i.quantity - i.returned_quantity;
                return (
                  <tr key={i.id} className="border-t border-border-light">
                    <td className="py-1.5">
                      {i.quantity}× {i.title}
                      {i.variant_label && <span className="text-text-muted"> · {i.variant_label}</span>}
                      {i.returned_quantity > 0 && <span className="text-badge-discount text-xs"> ({t("shop.sales.returnedQty", { n: i.returned_quantity })})</span>}
                    </td>
                    <td className="py-1.5 text-right">{taka(i.line_total)}</td>
                    {canManage && (
                      <td className="py-1.5 pl-2 w-20">
                        {left > 0 && (
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
          </dl>

          {notice && <p className="text-sm text-green-700 bg-green-50 rounded p-2">{notice}</p>}

          {canManage ? (
            open.sale.status !== "refunded" && (
              <div className="flex flex-col gap-2 border-t border-border-light pt-3">
                <h4 className="text-sm font-semibold">{t("shop.sales.returnTitle")}</h4>
                <p className="text-xs text-text-muted">{t("shop.sales.exchangeHint")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className={field}>
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
      )}
    </div>
  );
}
