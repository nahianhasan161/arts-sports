"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus, Pencil, Phone, Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, field } from "@/components/admin/pos/api";
import { Sheet, SupplierForm } from "@/components/admin/purchases/SupplierForm";
import { PurchaseList } from "@/components/admin/purchases/PurchaseList";
import { PaymentLine, undoPayment } from "@/components/admin/purchases/PurchaseDetail";
import { AuditList } from "@/components/admin/purchases/History";
import { methodKey } from "@/lib/pos/purchase-types";
import { purchaseNo, SUPPLIER_PAY_METHODS, type AuditEntry, type PurchaseRow, type SupplierBalance, type SupplierFull, type SupplierPayment, type SupplierPayMethod } from "@/lib/pos/purchase-types";

interface Detail {
  supplier: SupplierFull;
  balance: SupplierBalance | null;
  purchases: PurchaseRow[];
  payments: SupplierPayment[];
  history: AuditEntry[];
  stock: { variant_id: string; quantity: number; unit_cost: number | null; title: string; label: string; code: string }[];
}

/** Everything about one supplier: details, what we bought, paid and owe. */
export default function SupplierDetailPage() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const base = pathname.replace(/\/suppliers\/.*$/, "");
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const res = await api<Detail>(`/api/admin/inventory/suppliers?id=${encodeURIComponent(id)}`);
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!data) return <p className={`text-sm ${error ? "text-badge-discount" : "text-text-muted"}`}>{error ?? t("shop.common.loading")}</p>;
  const s = data.supplier;
  const b = data.balance;
  const due = b?.due ?? s.opening_due;

  async function remove() {
    if (!window.confirm(t("shop.supplier.confirmDelete", { name: s.name }))) return;
    const res = await api<{ deactivated?: boolean }>("/api/admin/inventory/suppliers", { action: "delete", id: s.id });
    if (!res.ok) return setError(res.error);
    if (res.data.deactivated) {
      setNotice(t("shop.supplier.deactivated", { name: s.name }));
      void load();
    } else router.push(`${base}/suppliers`);
  }

  const info: [string, React.ReactNode][] = (
    [
      [t("shop.supplier.contactPerson"), s.contact_person],
      [t("shop.supplier.phone"), s.phone && <a href={`tel:${s.phone}`} className="underline">{s.phone}</a>],
      [t("shop.supplier.altPhone"), s.alt_phone && <a href={`tel:${s.alt_phone}`} className="underline">{s.alt_phone}</a>],
      [t("shop.supplier.email"), s.email && <a href={`mailto:${s.email}`} className="underline">{s.email}</a>],
      [t("shop.supplier.address"), s.address],
      [t("shop.supplier.paymentInfo"), s.payment_info && <span className="whitespace-pre-line">{s.payment_info}</span>],
      [t("shop.supplier.leadDays"), t("shop.suppliers.days", { n: s.lead_days })],
      [t("shop.supplier.openingDue"), s.opening_due ? taka(s.opening_due) : null],
      [t("shop.supplier.notes"), s.notes && <span className="whitespace-pre-line">{s.notes}</span>],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`${base}/suppliers`} className="text-sm text-text-muted inline-flex items-center gap-1 hover:underline self-start">
        <ArrowLeft className="w-4 h-4" /> {t("shop.supplier.back")}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-2">{s.name}</h1>
        {!s.is_active && <span className="text-xs px-2 py-0.5 rounded bg-surface-subtle border border-border-light">{t("shop.supplier.inactive")}</span>}
        <div className="flex gap-2 ml-auto flex-wrap">
          <Link href={`${base}/purchases?supplier=${s.id}`} className={btnPrimary}>
            <PackagePlus className="w-4 h-4" /> {t("shop.supplier.newPurchase")}
          </Link>
          {s.phone && (
            <a href={`tel:${s.phone}`} className={btnGhost}>
              <Phone className="w-4 h-4" /> {t("shop.supplier.call")}
            </a>
          )}
          <button className={btnGhost} onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" /> {t("shop.supplier.edit")}
          </button>
          <button className={`${btnGhost} text-badge-discount`} onClick={remove}>
            <Trash2 className="w-4 h-4" /> {t("shop.supplier.delete")}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3">{error}</p>}
      {notice && <p className="text-sm text-green-800 bg-green-50 dark:bg-green-900/30 dark:text-green-200 rounded p-3">{notice}</p>}

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["bought", b?.bought ?? 0, b ? t("shop.supplier.purchases", { n: b.purchases }) : ""],
            ["paid", b?.paid ?? 0, ""],
            ["due", due, ""],
          ] as const
        ).map(([key, amount, sub]) => (
          <div key={key} className={`${card} p-3`}>
            <p className="text-xs text-text-muted">{t(`shop.supplier.${key}`)}</p>
            <p className={`text-lg sm:text-2xl font-bold ${key === "due" && amount > 0 ? "text-badge-discount" : key === "paid" ? "text-green-700" : ""}`}>{taka(amount)}</p>
            {sub && <p className="text-[11px] text-text-muted">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {info.length > 0 && (
            <dl className={`${card} p-3 grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-sm`}>
              {info.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-text-muted text-xs sm:text-sm">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t("shop.supplier.history")}</h2>
            <PurchaseList rows={data.purchases} showSupplier={false} onChanged={() => void load()} />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t("shop.supplier.paymentsTitle")}</h2>
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-sm">
                <tbody>
                  {data.payments.length === 0 && (
                    <tr>
                      <td className="p-3 text-text-muted">{t("shop.purchase.noPayments")}</td>
                    </tr>
                  )}
                  {data.payments.map((p) => {
                    const against = data.purchases.find((r) => r.id === p.receipt_id);
                    return (
                      <tr key={p.id} className="border-t border-border-light first:border-0">
                        <td className="p-2 text-xs">
                          <PaymentLine
                            pay={p}
                            extra={against && <span className="text-text-muted"> · {purchaseNo(against)}</span>}
                            onUndo={async () => {
                              const r = await undoPayment(t, p.id);
                              if (r.error) setError(r.error);
                              if (r.ok) {
                                setNotice(t("shop.history.undone"));
                                void load();
                              }
                            }}
                          />
                          {p.voided_at && <p className="text-[11px] text-amber-700 dark:text-amber-400">{t("shop.history.undoneBy", { name: p.voided_by || "—", reason: p.void_reason ?? "" })}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t("shop.history.title")}</h2>
            <div className={`${card} p-3`}>
              <AuditList entries={data.history ?? []} />
            </div>
          </section>

          {data.stock.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">{t("shop.supplier.stockTitle")}</h2>
              <div className={`${card} overflow-x-auto`}>
                <table className="w-full text-sm">
                  <tbody>
                    {data.stock.map((r) => (
                      <tr key={r.variant_id} className="border-t border-border-light first:border-0">
                        <td className="p-2">
                          {r.title} <span className="text-text-muted">{r.label}</span>
                        </td>
                        <td className="p-2 font-mono text-xs text-text-muted">{r.code}</td>
                        <td className="p-2 text-right font-semibold">{r.quantity}</td>
                        <td className="p-2 text-right text-text-muted">{r.unit_cost === null ? "" : taka(r.unit_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <PayForm
          supplierId={s.id}
          due={due}
          open={data.purchases.filter((p) => p.due > 0)}
          onPaid={() => {
            setNotice(t("shop.supplier.paySaved"));
            void load();
          }}
        />
      </div>

      {editing && (
        <Sheet title={t("shop.supplier.edit")} onClose={() => setEditing(false)}>
          <SupplierForm
            supplier={s}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              void load();
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

/** Money to the supplier: against the whole due, or one purchase. */
function PayForm({ supplierId, due, open, onPaid }: { supplierId: string; due: number; open: PurchaseRow[]; onPaid: () => void }) {
  const { t } = useT();
  const [receiptId, setReceiptId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SupplierPayMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [fromDrawer, setFromDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = receiptId ? open.find((p) => p.id === receiptId)?.due ?? 0 : Math.max(0, due);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api("/api/admin/purchases", { action: "pay", supplier_id: supplierId, receipt_id: receiptId, amount: Number(amount), method, reference, note, from_drawer: fromDrawer && method === "cash" });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setAmount("");
    setReference("");
    setNote("");
    setReceiptId("");
    setFromDrawer(false);
    onPaid();
  }

  return (
    <form onSubmit={pay} className={`${card} p-3 flex flex-col gap-2 lg:sticky lg:top-4`}>
      <h2 className="font-semibold">{t("shop.supplier.payTitle")}</h2>
      <p className="text-xs text-text-muted">{t("shop.supplier.payHint")}</p>
      <select value={receiptId} onChange={(e) => setReceiptId(e.target.value)} className={field}>
        <option value="">
          {t("shop.supplier.againstAll")} ({taka(Math.max(0, due))})
        </option>
        {open.map((p) => (
          <option key={p.id} value={p.id}>
            {purchaseNo(p)} · {t("shop.purchase.due")} {taka(p.due)}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} text-right`} inputMode="decimal" placeholder={t("shop.common.amount")} required />
        {target > 0 && (
          <button type="button" className={`${btnGhost} shrink-0 !px-2 text-xs`} onClick={() => setAmount(String(target))}>
            {taka(target)}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {SUPPLIER_PAY_METHODS.map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} className={`px-2.5 py-1 rounded text-xs font-semibold border ${method === m ? "bg-primary text-white border-primary" : "border-border-light"}`}>
            {t(methodKey(m))}
          </button>
        ))}
      </div>
      {method === "cash" ? (
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={fromDrawer} onChange={(e) => setFromDrawer(e.target.checked)} />
          {t("shop.purchase.fromDrawer")}
        </label>
      ) : (
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("shop.purchase.payReference")} className={field} />
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.common.note")} className={field} />
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      <button className={btnPrimary} disabled={busy || !(Number(amount) > 0)}>
        {busy ? t("shop.common.saving") : t("shop.supplier.pay")}
      </button>
    </form>
  );
}
