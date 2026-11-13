"use client";

import { use, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { useT } from "@/i18n/client";
import { config } from "@/lib/config";
import { taka } from "@/lib/pos/types";
import { STATUS_LABEL } from "@/components/admin/custom-orders/labels";
import { api, btnPrimary, dateTime } from "@/components/admin/pos/api";
import { QrCode } from "@/components/admin/pos/Codes";
import type { CounterOrder } from "@/components/admin/pos/CustomTab";

/**
 * Receipt for a custom jersey order taken at the counter (roadmap 4.3):
 * order number, expected date, what is paid and what is left, and a QR.
 * The QR is the customer's own order page, so they can follow the order on
 * their phone, and the POS finds the order when staff scan it.
 */
export default function CustomReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useT();
  const [order, setOrder] = useState<CounterOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ orders: CounterOrder[] }>(`/api/admin/pos/custom?id=${encodeURIComponent(id)}`).then((res) => {
      if (!res.ok) return setError(res.error);
      if (!res.data.orders[0]) return setError("Order not found");
      setOrder(res.data.orders[0]);
    });
  }, [id]);

  if (error) return <p className="text-sm text-badge-discount">{error}</p>;
  if (!order) return <p className="text-sm text-text-muted">{t("shop.common.loading")}</p>;

  const due = Math.max(0, order.total - order.paid);
  const date = order.due_date ?? order.needed_by;

  const copy = (title: string) => (
    <div className="text-black text-[12px]">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="font-bold text-xl">{config.app.name}</p>
          <p>{config.business.phone}</p>
          <p className="mt-2 font-semibold">{t("shop.receipt.customTitle")}</p>
        </div>
        <div className="text-right">
          <p className="uppercase tracking-wide text-[10px] border border-black px-1.5 py-0.5 inline-block">{title}</p>
          <p className="font-bold text-lg mt-1">{order.order_number}</p>
          <p>{dateTime(order.created_at)}</p>
        </div>
      </div>
      <div className="flex justify-between gap-4 mt-3 border-t border-black pt-2">
        <dl className="flex-1">
          {[
            [t("shop.common.name"), `${order.customer_name} · ${order.customer_phone}`],
            [t("shop.receipt.item"), `${order.quantity}× ${order.sport} ${order.fabric_name ?? ""}`],
            [t("shop.common.status"), STATUS_LABEL[order.status]],
            [t("shop.receipt.expected"), date ?? t("shop.receipt.dateLater")],
            [t("shop.common.total"), order.total ? taka(order.total) : t("shop.receipt.priceLater")],
            [t("shop.custom.paid"), taka(order.paid)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt>{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 font-bold text-[14px] border-t border-black mt-1 pt-1">
            <dt>{t("shop.receipt.due")}</dt>
            <dd>{order.total ? taka(due) : "—"}</dd>
          </div>
        </dl>
        <div className="text-center">
          <QrCode value={order.link} size={96} />
          <p className="text-[10px] max-w-[110px]">{t("shop.receipt.scanToTrack")}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px]">{t("shop.receipt.customTerms")}</p>
    </div>
  );

  return (
    <div>
      <button className={`${btnPrimary} print:hidden mb-4`} onClick={() => window.print()}>
        <Printer className="w-4 h-4" /> {t("shop.common.print")}
      </button>
      <style>{`@media print { @page { size: A4; margin: 10mm; } body { background: #fff !important; } }`}</style>
      <div className="bg-white w-full max-w-[190mm] p-4 print:p-0 mx-auto print:mx-0">
        {copy(t("shop.receipt.customerCopy"))}
        <div className="my-5 border-t border-dashed border-black relative">
          <span className="absolute -top-2 left-4 bg-white px-1 text-[10px] text-black">✂ {t("shop.receipt.cut")}</span>
        </div>
        {copy(t("shop.receipt.shopCopy"))}
      </div>
    </div>
  );
}
