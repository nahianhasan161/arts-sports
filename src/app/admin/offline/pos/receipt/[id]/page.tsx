"use client";

import { use, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { useT } from "@/i18n/client";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { taka, type PayMethod, type SaleDetail } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, dateTime } from "@/components/admin/pos/api";
import { QrCode } from "@/components/admin/pos/Codes";
import { Lines, ReceiptShop } from "@/components/admin/pos/ReceiptShop";
import { useReceiptSettings } from "@/components/admin/pos/useReceiptSettings";
import { CopyImageButton } from "@/components/admin/pos/CopyImageButton";
import { CopiesPicker, type Copies } from "@/components/admin/pos/CopiesPicker";

/**
 * A shop receipt (roadmap 4.2).
 *
 * A4: two copies on one sheet, the customer's on top and the shop's below,
 * with a line to cut along. ?size=thermal gives one narrow copy for an 80mm
 * roll printer. ?doc=invoice gives a one-copy A4 invoice (bill to, numbered
 * lines, paid / due, signatures). The QR opens this sale in the POS for a
 * return or exchange.
 */
type Doc = "a4" | "thermal" | "invoice";
export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const imgRef = useRef<HTMLDivElement>(null);
  const { t } = useT();
  const [data, setData] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc>("a4");
  const thermal = doc === "thermal";
  const rs = useReceiptSettings();
  const [copies, setCopies] = useState<Copies>("both");

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      setDoc(q.get("doc") === "invoice" ? "invoice" : q.get("size") === "thermal" ? "thermal" : "a4");
    }, 0);
    void api<SaleDetail>(`/api/admin/pos/sales/${id}`).then((res) => (res.ok ? setData(res.data) : setError(res.error)));
    return () => clearTimeout(timer);
  }, [id]);

  if (error) return <p className="text-sm text-badge-discount">{error}</p>;
  if (!data || !rs) return <PageSkeleton variant="receipt" label={t("shop.common.loading")} />;

  const { sale, items, payments } = data;
  const qr = `${window.location.origin}/admin/offline/orders?receipt=${sale.id}`;
  const charges = payments.filter((p) => p.type === "charge");

  const copy = (title: string) => (
    <div className={`text-black ${thermal ? "text-[11px] leading-snug" : "text-[12px]"}`}>
      <div className="flex justify-between items-start gap-3">
        <ReceiptShop s={rs} branch={data.showroom} small={thermal} />
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
      {sale.customer_address && <p className="mt-0.5">{t("shop.receipt.address", { address: sale.customer_address })}</p>}

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
          <Lines className="text-[10px] max-w-[150px]" text={rs.terms || t("shop.receipt.returnPolicy")} />
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
      <Lines className="text-center mt-2" text={rs.footer || t("shop.receipt.thanks")} />
    </div>
  );

  const paid = charges.reduce((sum, p) => sum + Number(p.amount), 0);
  const invoice = (
    <div className="text-black text-[12px]">
      <div className="flex justify-between items-start gap-4 border-b-2 border-black pb-3">
        <ReceiptShop s={rs} branch={data.showroom} />
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-widest">{t("shop.invoice.title")}</p>
          <p className="mt-1">
            {t("shop.invoice.no")}: <b>{sale.receipt_no}</b>
          </p>
          <p>
            {t("shop.invoice.date")}: {dateTime(sale.created_at)}
          </p>
          <p>
            {t("shop.invoice.status")}: <b>{Number(sale.refunded_total) > 0 ? t(`shop.sales.status.${sale.status as "refunded"}`) : t("shop.invoice.paid")}</b>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide font-semibold">{t("shop.invoice.billTo")}</p>
          <p className="font-semibold text-[13px]">{sale.customer_name || t("shop.sales.walkIn")}</p>
          {sale.customer_phone && <p>{sale.customer_phone}</p>}
          {sale.customer_address && <p className="whitespace-pre-line">{sale.customer_address}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide font-semibold">{t("shop.invoice.servedBy")}</p>
          <p>{sale.staff}</p>
          {data.showroom?.name && <p>{data.showroom.name}</p>}
        </div>
      </div>

      <table className="w-full mt-4 border-collapse">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className="border border-black px-2 py-1 w-8 text-center">#</th>
            <th className="border border-black px-2 py-1">{t("shop.receipt.item")}</th>
            <th className="border border-black px-2 py-1 text-center w-14">{t("shop.common.qty")}</th>
            <th className="border border-black px-2 py-1 text-right w-24">{t("shop.invoice.unitPrice")}</th>
            <th className="border border-black px-2 py-1 text-right w-20">{t("shop.receipt.discount")}</th>
            <th className="border border-black px-2 py-1 text-right w-24">{t("shop.invoice.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.id} className="align-top">
              <td className="border border-black px-2 py-1 text-center">{n + 1}</td>
              <td className="border border-black px-2 py-1">
                {i.title}
                {i.variant_label ? <span className="block text-[11px]">{i.variant_label}</span> : null}
                {i.returned_quantity > 0 && <span className="block text-[11px]">{t("shop.sales.returnedQty", { n: i.returned_quantity })}</span>}
              </td>
              <td className="border border-black px-2 py-1 text-center">{i.quantity}</td>
              <td className="border border-black px-2 py-1 text-right">{taka(i.unit_price)}</td>
              <td className="border border-black px-2 py-1 text-right">{Number(i.discount) > 0 ? `−${taka(i.discount)}` : "—"}</td>
              <td className="border border-black px-2 py-1 text-right">{taka(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between gap-6 mt-3">
        <div className="flex items-start gap-2">
          <QrCode value={qr} size={76} />
          <div className="max-w-[260px]">
            <p className="text-[10px] uppercase tracking-wide font-semibold">{t("shop.invoice.paymentBy")}</p>
            {charges.length ? (
              charges.map((p) => (
                <p key={p.id}>
                  {t(`shop.method.${p.method as PayMethod}`)}: {taka(p.method === "cash" ? Number(p.amount) + Number(sale.change_due) : p.amount)}
                  {p.reference ? ` (${p.reference})` : ""}
                </p>
              ))
            ) : (
              <p>—</p>
            )}
            <Lines className="text-[10px] mt-2" text={rs.terms || t("shop.receipt.returnPolicy")} />
          </div>
        </div>
        <dl className="min-w-[40%]">
          {[
            [t("shop.pos.subtotal"), taka(sale.subtotal), false],
            ...(Number(sale.coupon_discount) > 0 ? [[`${t("shop.pos.coupon")} ${sale.coupon_code ?? ""}`, `−${taka(sale.coupon_discount)}`, false]] : []),
            ...(Number(sale.discount_total) > 0 ? [[t("shop.receipt.discount"), `−${taka(sale.discount_total)}`, false]] : []),
            [t("shop.invoice.grandTotal"), taka(sale.total), true],
            [t("shop.invoice.paidAmount"), taka(paid), false],
            ...(Number(sale.change_due) > 0 ? [[t("shop.receipt.change"), taka(sale.change_due), false]] : []),
            [t("shop.receipt.due"), taka(Math.max(0, Number(sale.total) - paid)), false],
            ...(Number(sale.refunded_total) > 0 ? [[t("shop.sales.refund"), `−${taka(sale.refunded_total)}`, false]] : []),
          ].map(([label, value, strong], n) => (
            <div key={n} className={`flex justify-between gap-3 py-0.5 ${strong ? "font-bold text-[14px] border-y border-black my-0.5" : ""}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-16 mt-14">
        <p className="border-t border-black pt-1 text-center">{t("shop.invoice.customerSign")}</p>
        <p className="border-t border-black pt-1 text-center">{t("shop.invoice.shopSign")}</p>
      </div>
      <Lines className="text-center mt-4" text={rs.footer || t("shop.receipt.thanks")} />
    </div>
  );

  const docBtn = (d: Doc, label: string) => (
    <button className={`${btnGhost} ${doc === d ? "ring-2 ring-primary" : ""}`} onClick={() => setDoc(d)} aria-pressed={doc === d}>
      {label}
    </button>
  );

  return (
    <div>
      <div className="print:hidden flex flex-wrap gap-2 mb-4">
        <button className={btnPrimary} onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> {t("shop.common.print")}
        </button>
        {docBtn("invoice", t("shop.register.invoice"))}
        {docBtn("a4", t("shop.pos.printA4"))}
        {docBtn("thermal", t("shop.pos.printThermal"))}
        {doc === "a4" && <CopiesPicker value={copies} onChange={setCopies} />}
        <CopyImageButton target={imgRef} fileName={`receipt-${id}`} className={btnGhost} />
        <CopyImageButton mode="download" target={imgRef} fileName={`receipt-${id}`} className={btnGhost} />
      </div>
      <style>{`@media print { @page { size: ${thermal ? "80mm auto" : "A4"}; margin: ${thermal ? "3mm" : "10mm"}; } body { background: #fff !important; } }`}</style>
      <div className={`bg-white ${thermal ? "w-[72mm] p-1" : "w-full max-w-[190mm] p-4 print:p-0"} mx-auto print:mx-0`}>
        {(doc !== "a4" || copies !== "shop") && (
          <div ref={imgRef} className="bg-white">{doc === "invoice" ? invoice : copy(t("shop.receipt.customerCopy"))}</div>
        )}
        {doc === "a4" && copies === "both" && (
          <div className="my-5 border-t border-dashed border-black relative">
            <span className="absolute -top-2 left-4 bg-white px-1 text-[10px] text-black">✂ {t("shop.receipt.cut")}</span>
          </div>
        )}
        {doc === "a4" && copies !== "customer" && (
          <div ref={copies === "shop" ? imgRef : undefined} className="bg-white">{copy(t("shop.receipt.shopCopy"))}</div>
        )}
      </div>
    </div>
  );
}
