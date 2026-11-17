"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Printer, Undo2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";
import { methodKey, purchaseNo, type PurchaseEdit, type PurchaseItem, type PurchaseRow, type SupplierPayment } from "@/lib/pos/purchase-types";
import { Sheet } from "./SupplierForm";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { SkeletonRows } from "@/components/ui/PageSkeleton";
import { PurchaseEdits } from "./History";

interface Data {
  purchase: PurchaseRow;
  items: PurchaseItem[];
  payments: SupplierPayment[];
  edits: PurchaseEdit[];
  names: Record<string, string>;
  created_by: string;
}

/**
 * Undo a payment, optimistically: asks why (dialog), strikes the row out at once, then
 * tells the server. On failure the row is put back and an error toast is shown.
 */
export function useUndoPayment() {
  const { t } = useT();
  const confirm = useConfirm();
  const { toast } = useToast();
  return async function undo(
    pay: SupplierPayment,
    setPayments: (fn: (rows: SupplierPayment[]) => SupplierPayment[]) => void,
  ): Promise<boolean> {
    const answer = await confirm({
      title: t("shop.history.undoTitle"),
      description: `${taka(pay.amount)} · ${t(methodKey(pay.method))}. ${t("shop.history.undoDesc")}`,
      confirmText: t("shop.history.undo"),
      danger: true,
      reason: { label: t("shop.history.undoAsk") },
    });
    if (!answer) return false;
    const before = pay;
    setPayments((rows) => rows.map((r) => (r.id === pay.id ? { ...r, voided_at: new Date().toISOString(), void_reason: answer.reason, voided_by: r.voided_by ?? "…" } : r)));
    const res = await api("/api/admin/purchases", { action: "void_payment", payment_id: pay.id, reason: answer.reason });
    if (!res.ok) {
      setPayments((rows) => rows.map((r) => (r.id === pay.id ? before : r)));
      toast(t("shop.history.undoFailed", { error: res.error }), "error");
      return false;
    }
    toast(t("shop.history.undone"), "success");
    return true;
  };
}

/** One payment line; an undone one is struck out with who and why. */
export function PaymentLine({ pay, onUndo, extra }: { pay: SupplierPayment; onUndo?: () => void; extra?: React.ReactNode }) {
  const { t } = useT();
  const voided = Boolean(pay.voided_at);
  return (
    <div className="flex justify-between gap-2">
      <span className={voided ? "line-through text-text-muted" : ""}>
        {dateTime(pay.created_at)} · {t(methodKey(pay.method))}
        {pay.from_drawer && ` (${t("shop.purchase.fromDrawerTag")})`}
        {pay.reference && ` · ${pay.reference}`}
        {extra}
        {pay.staff && <span className="text-text-muted"> · {pay.staff}</span>}
        {pay.note && <span className="block text-text-muted">{pay.note}</span>}
      </span>
      <span className="flex items-start gap-2 shrink-0">
        <strong className={voided ? "line-through text-text-muted" : ""}>{taka(pay.amount)}</strong>
        {!voided && onUndo && (
          <button type="button" className="text-text-muted hover:text-badge-discount print:hidden inline-flex items-center gap-0.5" onClick={onUndo} title={t("shop.history.undo")}>
            <Undo2 className="w-3.5 h-3.5" /> <span className="text-[11px]">{t("shop.history.undo")}</span>
          </button>
        )}
      </span>
      {voided && <span className="sr-only">{t("shop.history.undone")}</span>}
    </div>
  );
}

/** One purchase: what came in, the bill, what was paid, and every correction. Printable. */
export function PurchaseDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { t } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const undo = useUndoPayment();

  const load = useCallback(async () => {
    const res = await api<Data>(`/api/admin/purchases?id=${encodeURIComponent(id)}`);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const changed = async (message: string) => {
    setNotice(message);
    setError(null);
    await load();
    onChanged?.();
  };

  const p = data?.purchase;
  return (
    <Sheet title={p ? `${purchaseNo(p)} · ${p.supplier}` : t("shop.common.loading")} onClose={onClose}>
      {error && <p className="text-sm text-badge-discount mb-2">{error}</p>}
      {notice && <p className="text-sm text-green-800 bg-green-50 dark:bg-green-900/30 dark:text-green-200 rounded p-2 mb-2">{notice}</p>}
      {!data && !error && <SkeletonRows count={7} label={t("shop.common.loading")} className="p-0" />}
      {p && data && editing && (
        <EditPurchase
          data={data}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void changed(t("shop.history.fixed"));
          }}
        />
      )}
      {p && data && !editing && (
        <div className="purchase-print flex flex-col gap-3 text-sm">
          {/* Print only this bill, not the page behind the overlay. */}
          <style>{"@media print { body * { visibility: hidden; } .purchase-print, .purchase-print * { visibility: visible; } .purchase-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 16px; } }"}</style>
          <div className="hidden print:block">
            <h2 className="text-lg font-bold">
              {purchaseNo(p)} · {p.supplier}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>
              {t("shop.purchase.date")}: {dateTime(p.created_at)}
            </span>
            {p.invoice_date && (
              <span>
                {t("shop.purchase.invoiceDate")}: {p.invoice_date}
              </span>
            )}
            {p.reference && (
              <span>
                {t("shop.purchase.reference")}: {p.reference}
              </span>
            )}
            {p.showroom && (
              <span>
                {t("shop.purchase.branch")}: {p.showroom}
              </span>
            )}
            {data.created_by && <span>{t("shop.history.enteredBy", { name: data.created_by })}</span>}
          </div>

          <div className={`${card} overflow-x-auto`}>
            <table className="w-full">
              <thead className="text-xs text-text-muted text-left">
                <tr>
                  <th className="p-2">{t("shop.purchase.product")}</th>
                  <th className="p-2 text-right">{t("shop.purchase.qty")}</th>
                  <th className="p-2 text-right">{t("shop.purchase.unitCost")}</th>
                  <th className="p-2 text-right">{t("shop.purchase.lineTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i, n) => (
                  <tr key={n} className="border-t border-border-light">
                    <td className="p-2">
                      {i.title} <span className="text-text-muted">{i.label}</span>
                      {i.code && <span className="block font-mono text-[11px] text-text-muted">{i.code}</span>}
                    </td>
                    <td className="p-2 text-right">{i.quantity}</td>
                    <td className="p-2 text-right">{i.unit_cost === null ? "—" : taka(i.unit_cost)}</td>
                    <td className="p-2 text-right">{i.unit_cost === null ? "—" : taka(i.unit_cost * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto w-full max-w-xs grid grid-cols-2 gap-y-1">
            <dt>{t("shop.purchase.subtotal")}</dt>
            <dd className="text-right">{taka(p.subtotal)}</dd>
            {p.discount > 0 && (
              <>
                <dt>{t("shop.purchase.discount")}</dt>
                <dd className="text-right">−{taka(p.discount)}</dd>
              </>
            )}
            {p.extra_cost > 0 && (
              <>
                <dt>{t("shop.purchase.extraCost")}</dt>
                <dd className="text-right">+{taka(p.extra_cost)}</dd>
              </>
            )}
            <dt className="font-bold">{t("shop.purchase.payable")}</dt>
            <dd className="text-right font-bold">{taka(p.payable)}</dd>
            <dt>{t("shop.purchase.paid")}</dt>
            <dd className="text-right text-green-700">{taka(p.paid)}</dd>
            <dt className="font-semibold">{t("shop.purchase.due")}</dt>
            <dd className={`text-right font-semibold ${p.due > 0 ? "text-badge-discount" : ""}`}>{taka(p.due)}</dd>
          </dl>

          <div>
            <h3 className="text-xs font-semibold text-text-muted mb-1">{t("shop.purchase.payments")}</h3>
            {data.payments.length === 0 && <p className="text-xs text-text-muted">{t("shop.purchase.noPayments")}</p>}
            <ul className="text-xs flex flex-col gap-1">
              {data.payments.map((pay) => (
                <li key={pay.id}>
                  <PaymentLine
                    pay={pay}
                    onUndo={async () => {
                      const ok = await undo(pay, (fn) => setData((d) => (d ? { ...d, payments: fn(d.payments) } : d)));
                      if (ok) {
                        await load();
                        onChanged?.();
                      }
                    }}
                  />
                  {pay.voided_at && <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("shop.history.undoneBy", { name: pay.voided_by || "—", reason: pay.void_reason ?? "" })}</p>}
                </li>
              ))}
            </ul>
          </div>
          {p.note && <p className="text-xs text-text-muted">{p.note}</p>}

          {data.edits.length > 0 && (
            <div className="print:hidden">
              <h3 className="text-xs font-semibold text-text-muted mb-1">{t("shop.history.title")}</h3>
              <PurchaseEdits edits={data.edits} names={data.names} />
            </div>
          )}

          <div className="flex gap-2 print:hidden">
            <button className={btnGhost} onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> {t("shop.purchase.print")}
            </button>
            <button className={btnGhost} onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4" /> {t("shop.history.correct")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Correct a saved purchase: every field, every line, and a reason. */
function EditPurchase({ data, onCancel, onSaved }: { data: Data; onCancel: () => void; onSaved: () => void }) {
  const { t } = useT();
  const p = data.purchase;
  const [lines, setLines] = useState(() =>
    // One row per item (an old purchase may list the same item twice).
    [...data.items.reduce((m, i) => {
      const c = m.get(i.variant_id);
      m.set(i.variant_id, { ...i, quantity: (c?.quantity ?? 0) + i.quantity, qty: String((c?.quantity ?? 0) + i.quantity), cost: i.unit_cost === null ? "" : String(i.unit_cost) });
      return m;
    }, new Map<string, PurchaseItem & { qty: string; cost: string }>()).values()]
  );
  const [reference, setReference] = useState(p.reference ?? "");
  const [invoiceDate, setInvoiceDate] = useState(p.invoice_date ?? "");
  const [note, setNote] = useState(p.note ?? "");
  const [discount, setDiscount] = useState(p.discount ? String(p.discount) : "");
  const [extra, setExtra] = useState(p.extra_cost ? String(p.extra_cost) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = (v: string) => Number(v) || 0;
  const subtotal = lines.reduce((s, l) => s + (l.cost.trim() === "" ? 0 : n(l.qty) * n(l.cost)), 0);
  const set = (id: string, patch: Partial<{ qty: string; cost: string }>) => setLines((c) => c.map((l) => (l.variant_id === id ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    const res = await api("/api/admin/purchases", {
      action: "edit",
      receipt_id: p.id,
      reason,
      reference,
      invoice_date: invoiceDate,
      note,
      discount: n(discount),
      extra_cost: n(extra),
      items: lines.map((l) => ({ variant_id: l.variant_id, quantity: n(l.qty), unit_cost: l.cost.trim() === "" ? null : n(l.cost) })),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-text-muted">{t("shop.history.correctHint")}</p>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full">
          <thead className="text-xs text-text-muted text-left">
            <tr>
              <th className="p-2">{t("shop.purchase.product")}</th>
              <th className="p-2 w-24">{t("shop.purchase.qty")}</th>
              <th className="p-2 w-28">{t("shop.purchase.unitCost")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.variant_id} className={`border-t border-border-light ${n(l.qty) === 0 ? "opacity-50" : ""}`}>
                <td className="p-2">
                  {l.title} <span className="text-text-muted">{l.label}</span>
                  {n(l.qty) !== l.quantity && <span className="block text-[11px] text-amber-700 dark:text-amber-400">{l.quantity} → {n(l.qty)}</span>}
                </td>
                <td className="p-2">
                  <input value={l.qty} onChange={(e) => set(l.variant_id, { qty: e.target.value.replace(/[^\d]/g, "") })} className={field} inputMode="numeric" />
                </td>
                <td className="p-2">
                  <input value={l.cost} onChange={(e) => set(l.variant_id, { cost: e.target.value.replace(/[^\d.]/g, "") })} className={field} inputMode="decimal" placeholder="৳" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs text-text-muted flex flex-col gap-1">
          {t("shop.purchase.reference")}
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-text-muted flex flex-col gap-1">
          {t("shop.purchase.invoiceDate")}
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-text-muted flex flex-col gap-1">
          {t("shop.purchase.discount")}
          <input value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} className={field} inputMode="decimal" placeholder="0" />
        </label>
        <label className="text-xs text-text-muted flex flex-col gap-1">
          {t("shop.purchase.extraCost")}
          <input value={extra} onChange={(e) => setExtra(e.target.value.replace(/[^\d.]/g, ""))} className={field} inputMode="decimal" placeholder="0" />
        </label>
        <label className="text-xs text-text-muted flex flex-col gap-1 sm:col-span-2">
          {t("shop.common.note")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
      </div>
      <p className="text-right font-semibold">
        {t("shop.purchase.payable")}: {taka(Math.max(0, subtotal - n(discount) + n(extra)))}
      </p>
      <label className="text-xs flex flex-col gap-1 font-semibold">
        {t("shop.history.reason")}
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={field} placeholder={t("shop.history.reasonPlaceholder")} required />
      </label>
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !reason.trim()} onClick={save}>
          {busy ? t("shop.common.saving") : t("shop.history.saveFix")}
        </button>
        <button className={btnGhost} onClick={onCancel}>
          {t("shop.common.cancel")}
        </button>
      </div>
    </div>
  );
}
