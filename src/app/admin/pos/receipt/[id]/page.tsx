"use client";

import { use, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { useT } from "@/i18n/client";
import { config } from "@/lib/config";
import { taka, type PayMethod, type SaleDetail } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, dateTime } from "@/components/admin/pos/api";
import { QrCode } from "@/components/admin/pos/Codes";

/**
 * A shop receipt (roadmap 4.2).
 *
 * A4: two copies on one sheet, the customer's on top and the shop's below,
 * with a line to cut along. ?size=thermal gives one narrow copy for an 80mm
 * roll printer. The QR opens this sale in the POS for a return or exchange.
 */
export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useT();
  const [data, setData] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thermal, setThermal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setThermal(new URLSearchParams(window.location.search).get("size") === "thermal"), 0);
    void api<SaleDetail>(`/api/admin/pos/sales/${id}`).then((res) => (res.ok ? setData(res.data) : setError(res.error)));
    return () => clearTimeout(timer);
  }, [id]);

  if (error) return <p className="text-sm text-badge-discount">{error}</p>;
  if (!data) return <p className="text-sm text-text-muted">{t("shop.common.loading")}</p>;

  const { sale, items, payments } = data;
  const qr = `${window.location.origin}/admin/pos?receipt=${sale.id}`;
  const charges = payments.filter((p) => p.type === "charge");

  const copy = (title: string) => (
    <div className={`text-black ${thermal ? "text-[11px] leading-snug" : "text-[12px]"}`}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className={`font-bold ${thermal ? "text-base" : "text-xl"}`}>{config.app.name}</p>
          <p>{data.showroom?.name}{data.showroom?.address ? `, ${data.showroom.address}` : ""}</p>
          <p>{config.business.phone}</p>
        </div>
        <div className="text-right">
          <p className="uppercase tracking-wide text-[10px] border border-black px-1.5 py-0.5 inline-block">{title}</p>
          <p className="font-bold mt-1">{t("shop.receipt.no", { no: sale.receipt_no })}</p>
          <p>{dateTime(sale.created_at)}</p>
        </div>
      </div>
      <p className="mt-1">
        {t("shop.receipt.servedBy", { name: sale.staff })}
        {(sale.customer_name || sale.customer_phone) && ` · ${t("shop.receipt.customer", { name: [sale.customer_name, sale.customer_phone].filter(Boolean).join(" ") })}`}
      </p>

      <table className="w-full mt-2 border-t border-b border-black">
        <thead>
          <tr className="text-left border-b border-black">
            <th className="py-1 font-semibold">{t("shop.receipt.item")}</th>
            <th className="py-1 font-semibold text-center w-10">{t("shop.common.qty")}</th>
            <th className="py-1 font-semibold text-right w-16">{t("shop.common.price")}</th>
            <th className="py-1 font-semibold text-right w-20">{t("shop.common.total")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="py-0.5">
                {i.title}
                {i.variant_label ? ` (${i.variant_label})` : ""}
                {Number(i.discount) > 0 && <span className="block text-[10px]">{t("shop.receipt.discount")} −{taka(i.discount)}</span>}
              </td>
              <td className="py-0.5 text-center">{i.quantity}</td>
              <td className="py-0.5 text-right">{taka(i.unit_price)}</td>
              <td className="py-0.5 text-right">{taka(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between gap-4 mt-2">
        <div className="flex items-start gap-2">
          <QrCode value={qr} size={thermal ? 64 : 76} />
          <p className="text-[10px] max-w-[150px]">{t("shop.receipt.returnPolicy")}</p>
        </div>
        <dl className="min-w-[45%]">
          {[
            [t("shop.pos.subtotal"), taka(sale.subtotal), false],
            ...(Number(sale.coupon_discount) > 0 ? [[`${t("shop.pos.coupon")} ${sale.coupon_code ?? ""}`, `−${taka(sale.coupon_discount)}`, false]] : []),
            ...(Number(sale.discount_total) > 0 ? [[t("shop.receipt.discount"), `−${taka(sale.discount_total)}`, false]] : []),
            [t("shop.common.total"), taka(sale.total), true],
            ...charges.map((p) => [`${t("shop.sales.paidBy")} ${t(`shop.method.${p.method as PayMethod}`)}`, taka(p.method === "cash" ? Number(p.amount) + Number(sale.change_due) : p.amount), false]),
            ...(Number(sale.change_due) > 0 ? [[t("shop.receipt.change"), taka(sale.change_due), false]] : []),
            [t("shop.receipt.due"), taka(0), false],
            ...(Number(sale.refunded_total) > 0 ? [[t("shop.sales.refund"), `−${taka(sale.refunded_total)}`, false]] : []),
          ].map(([label, value, strong], n) => (
            <div key={n} className={`flex justify-between gap-3 ${strong ? "font-bold text-[14px] border-t border-black mt-0.5 pt-0.5" : ""}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-center mt-2">{t("shop.receipt.thanks")}</p>
    </div>
  );

  return (
    <div>
      <div className="print:hidden flex gap-2 mb-4">
        <button className={btnPrimary} onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> {t("shop.common.print")}
        </button>
        <button className={btnGhost} onClick={() => setThermal((v) => !v)}>
          {thermal ? t("shop.pos.printA4") : t("shop.pos.printThermal")}
        </button>
      </div>
      <style>{`@media print { @page { size: ${thermal ? "80mm auto" : "A4"}; margin: ${thermal ? "3mm" : "10mm"}; } body { background: #fff !important; } }`}</style>
      <div className={`bg-white ${thermal ? "w-[72mm] p-1" : "w-full max-w-[190mm] p-4 print:p-0"} mx-auto print:mx-0`}>
        {copy(t("shop.receipt.customerCopy"))}
        {!thermal && (
          <>
            <div className="my-5 border-t border-dashed border-black relative">
              <span className="absolute -top-2 left-4 bg-white px-1 text-[10px] text-black">✂ {t("shop.receipt.cut")}</span>
            </div>
            {copy(t("shop.receipt.shopCopy"))}
          </>
        )}
      </div>
    </div>
  );
}
