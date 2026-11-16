"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, field } from "@/components/admin/pos/api";
import type { Showroom, StockRow } from "@/components/admin/inventory/types";
import { purchaseNo, SUPPLIER_PAY_METHODS, type SupplierBalance, type SupplierFull, type SupplierPayMethod } from "@/lib/pos/purchase-types";
import { Sheet, SupplierForm } from "./SupplierForm";
import { methodKey } from "@/lib/pos/purchase-types";

interface Line {
  variant_id: string;
  title: string;
  label: string;
  code: string;
  in_shop: number;
  qty: string;
  cost: string;
}

const n = (v: string) => Number(v) || 0;
const today = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // Dhaka date

/**
 * Buying from a supplier, laid out like the register: choose the supplier,
 * scan or search the goods, enter quantity and buying price, then what was
 * paid. Saving raises the stock (supplier_purchase -> inventory_receive).
 */
export function PurchaseScreen() {
  const { t } = useT();
  const pathname = usePathname();
  const suppliersHref = pathname.replace(/\/purchases.*$/, "/suppliers");

  const [suppliers, setSuppliers] = useState<SupplierFull[]>([]);
  const [balances, setBalances] = useState<Map<string, SupplierBalance>>(new Map());
  const [supplierId, setSupplierId] = useState("");
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [showroomId, setShowroomId] = useState("");
  const [adding, setAdding] = useState(false);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);

  const [lines, setLines] = useState<Line[]>([]);
  const [reference, setReference] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [discount, setDiscount] = useState("");
  const [extra, setExtra] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<SupplierPayMethod>("cash");
  const [payRef, setPayRef] = useState("");
  const [fromDrawer, setFromDrawer] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; no: string; supplierId: string } | null>(null);

  const loadSuppliers = useCallback(async (select?: string) => {
    const res = await api<{ suppliers: SupplierFull[]; balances: SupplierBalance[]; balances_error: string | null }>("/api/admin/inventory/suppliers");
    if (!res.ok) return setError(res.error);
    setSuppliers(res.data.suppliers);
    setBalances(new Map(res.data.balances.map((b) => [b.supplier_id, b])));
    if (res.data.balances_error) setError(res.data.balances_error);
    if (select) setSupplierId(select);
  }, []);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("supplier") ?? undefined;
    const timer = setTimeout(() => void loadSuppliers(wanted), 0);
    // The shop list comes with an (empty) stock search.
    void api<{ showrooms: Showroom[]; showroom_id: string }>("/api/admin/inventory?ids=none").then((res) => {
      if (!res.ok) return;
      setShowrooms(res.data.showrooms);
      setShowroomId((c) => c || res.data.showroom_id);
    });
    return () => clearTimeout(timer);
  }, [loadSuppliers]);

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const balance = supplier ? balances.get(supplier.id) : undefined;

  // ---- search / scan ------------------------------------------------------
  const search = useCallback(
    async (term: string, submitted: boolean) => {
      const mine = ++request.current;
      if (!term) {
        setResults([]);
        return;
      }
      setSearching(true);
      const res = await api<{ rows: StockRow[] }>(`/api/admin/inventory?q=${encodeURIComponent(term)}&showroom_id=${encodeURIComponent(showroomId)}`);
      if (mine !== request.current) return;
      setSearching(false);
      if (!res.ok) return setError(res.error);
      const rows = res.data.rows.filter((r) => r.is_active || r.quantity > 0);
      // A scanner types the code and presses Enter: an exact barcode/SKU goes straight in.
      const exact = rows.filter((r) => r.barcode === term || r.sku === term);
      if (submitted && exact.length === 1) {
        add(exact[0]);
        setQ("");
        setResults([]);
        return;
      }
      setResults(rows.slice(0, 40));
    },
    [showroomId]
  );

  useEffect(() => {
    const term = q.trim();
    const timer = setTimeout(() => void search(term, false), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, search]);

  function add(r: StockRow) {
    setDone(null);
    setLines((current) => {
      const at = current.findIndex((l) => l.variant_id === r.variant_id);
      if (at >= 0) {
        const next = [...current];
        next[at] = { ...next[at], qty: String(n(next[at].qty) + 1) };
        return next;
      }
      return [{ variant_id: r.variant_id, title: r.title, label: r.label, code: r.barcode ?? r.sku ?? "", in_shop: r.quantity, qty: "1", cost: r.cost_price === null ? "" : String(r.cost_price) }, ...current];
    });
    searchRef.current?.focus();
  }

  const setLine = (id: string, patch: Partial<Line>) => setLines((c) => c.map((l) => (l.variant_id === id ? { ...l, ...patch } : l)));

  // ---- the bill (shown only; SQL works out the saved totals) --------------
  const subtotal = useMemo(() => lines.reduce((s, l) => s + n(l.qty) * n(l.cost), 0), [lines]);
  const payable = Math.max(0, subtotal - n(discount) + n(extra));
  const left = payable - n(paid);
  const missingCost = lines.filter((l) => l.cost.trim() === "").length;
  const pieces = lines.reduce((s, l) => s + n(l.qty), 0);

  async function save() {
    if (!supplierId) return setError(t("shop.purchase.chooseSupplier"));
    setBusy(true);
    setError(null);
    const res = await api<{ id: string }>("/api/admin/purchases", {
      action: "create",
      supplier_id: supplierId,
      showroom_id: showroomId,
      reference,
      invoice_date: invoiceDate,
      note,
      items: lines.filter((l) => n(l.qty) > 0).map((l) => ({ variant_id: l.variant_id, quantity: n(l.qty), unit_cost: l.cost.trim() })),
      discount: n(discount),
      extra_cost: n(extra),
      paid: n(paid),
      method,
      pay_reference: payRef,
      from_drawer: fromDrawer && method === "cash",
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const detail = await api<{ purchase: { receipt_no: number | null; id: string } }>(`/api/admin/purchases?id=${encodeURIComponent(res.data.id)}`);
    setDone({ id: res.data.id, no: detail.ok ? purchaseNo(detail.data.purchase) : "", supplierId });
    setLines([]);
    setReference("");
    setDiscount("");
    setExtra("");
    setPaid("");
    setPayRef("");
    setNote("");
    setFromDrawer(false);
    void loadSuppliers();
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
      {/* Left: supplier, search, the goods */}
      <div className="flex flex-col gap-3 min-w-0">
        <div className={`${card} p-3 flex flex-col gap-2`}>
          <div className="flex gap-2">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field} aria-label={t("shop.purchase.supplier")}>
              <option value="">{t("shop.purchase.chooseSupplier")}</option>
              {suppliers
                .filter((s) => s.is_active || s.id === supplierId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </option>
                ))}
            </select>
            <button className={`${btnGhost} shrink-0`} onClick={() => setAdding(true)}>
              <Plus className="w-4 h-4" /> {t("shop.purchase.newSupplier")}
            </button>
          </div>
          {supplier && (
            <div className="text-xs text-text-muted flex flex-wrap gap-x-3 gap-y-1">
              {supplier.contact_person && <span>{supplier.contact_person}</span>}
              {supplier.phone && <a href={`tel:${supplier.phone}`} className="underline">{supplier.phone}</a>}
              {supplier.address && <span>{supplier.address}</span>}
              {balance && (
                <span className={`font-semibold ${balance.due > 0 ? "text-badge-discount" : "text-green-700"}`}>
                  {balance.due > 0 ? t("shop.purchase.owe", { amount: taka(balance.due) }) : balance.due < 0 ? t("shop.purchase.advance", { amount: taka(-balance.due) }) : t("shop.purchase.settled")}
                </span>
              )}
              <Link href={`${suppliersHref}/${supplier.id}`} className="underline ml-auto">
                {t("shop.purchase.openSupplier")}
              </Link>
            </div>
          )}
        </div>

        <div className="relative">
          <ScanBarcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search(q.trim(), true);
              }
            }}
            placeholder={t("shop.purchase.searchPlaceholder")}
            className={`${field} pl-9 !py-2.5`}
            autoFocus
          />
          {q.trim() && (
            <div className={`${card} absolute z-20 left-0 right-0 mt-1 max-h-80 overflow-y-auto shadow-lg`}>
              {searching && results.length === 0 && <p className="p-3 text-sm text-text-muted">{t("shop.common.loading")}</p>}
              {!searching && results.length === 0 && <p className="p-3 text-sm text-text-muted">{t("shop.purchase.noResults")}</p>}
              {results.map((r) => (
                <button
                  key={r.variant_id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-subtle border-t border-border-light first:border-0 flex justify-between gap-2"
                  onClick={() => {
                    add(r);
                    setQ("");
                  }}
                >
                  <span>
                    {r.title} <span className="text-text-muted">{r.label}</span>
                    <span className="block font-mono text-[11px] text-text-muted">{r.barcode ?? r.sku ?? ""}</span>
                  </span>
                  <span className="text-xs text-text-muted text-right shrink-0">
                    {t("shop.purchase.inShop", { n: r.quantity })}
                    {r.cost_price !== null && <span className="block">{taka(r.cost_price)}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {done && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg p-3 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200 text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">{t("shop.purchase.saved", { no: done.no })}</span>
            <Link href={`${suppliersHref}/${done.supplierId}`} className="underline">
              {t("shop.purchase.openSupplier")}
            </Link>
          </div>
        )}

        <div className={`${card} overflow-x-auto`}>
          {lines.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-muted">{t("shop.purchase.emptyBill")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-text-muted text-left">
                <tr>
                  <th className="p-2">{t("shop.purchase.product")}</th>
                  <th className="p-2 w-24">{t("shop.purchase.qty")}</th>
                  <th className="p-2 w-28">{t("shop.purchase.unitCost")}</th>
                  <th className="p-2 text-right">{t("shop.purchase.lineTotal")}</th>
                  <th className="p-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.variant_id} className="border-t border-border-light">
                    <td className="p-2">
                      {l.title} <span className="text-text-muted">{l.label}</span>
                      <span className="block text-[11px] text-text-muted">
                        {l.code && <span className="font-mono">{l.code} · </span>}
                        {t("shop.purchase.inShop", { n: l.in_shop })}
                      </span>
                    </td>
                    <td className="p-2">
                      <input value={l.qty} onChange={(e) => setLine(l.variant_id, { qty: e.target.value.replace(/[^\d]/g, "") })} className={field} inputMode="numeric" />
                    </td>
                    <td className="p-2">
                      <input value={l.cost} onChange={(e) => setLine(l.variant_id, { cost: e.target.value.replace(/[^\d.]/g, "") })} className={`${field} ${l.cost.trim() === "" ? "border-amber-500" : ""}`} inputMode="decimal" placeholder="৳" />
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">{l.cost.trim() === "" ? "—" : taka(n(l.qty) * n(l.cost))}</td>
                    <td className="p-2">
                      <button className="text-text-muted hover:text-badge-discount" onClick={() => setLines((c) => c.filter((x) => x.variant_id !== l.variant_id))} aria-label={t("shop.common.remove")}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {missingCost > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("shop.purchase.noCost", { n: missingCost })}</p>}
      </div>

      {/* Right: the bill and the payment */}
      <aside className={`${card} p-3 flex flex-col gap-2 lg:sticky lg:top-4`}>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-text-muted flex flex-col gap-1 col-span-2">
            {t("shop.purchase.reference")}
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
          </label>
          <label className="text-xs text-text-muted flex flex-col gap-1">
            {t("shop.purchase.invoiceDate")}
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={field} />
          </label>
          {showrooms.length > 1 ? (
            <label className="text-xs text-text-muted flex flex-col gap-1">
              {t("shop.purchase.branch")}
              <select value={showroomId} onChange={(e) => setShowroomId(e.target.value)} className={field}>
                {showrooms.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span />
          )}
        </div>

        <dl className="grid grid-cols-[1fr_auto] gap-y-2 items-center text-sm border-t border-border-light pt-2">
          <dt>
            {t("shop.purchase.subtotal")}
            {lines.length > 0 && <span className="block text-[11px] text-text-muted">{t("shop.purchase.pieces", { lines: lines.length, n: pieces })}</span>}
          </dt>
          <dd className="text-right font-semibold">{taka(subtotal)}</dd>
          <dt>{t("shop.purchase.discount")}</dt>
          <dd>
            <input value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} !w-28 text-right`} inputMode="decimal" placeholder="0" />
          </dd>
          <dt>{t("shop.purchase.extraCost")}</dt>
          <dd>
            <input value={extra} onChange={(e) => setExtra(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} !w-28 text-right`} inputMode="decimal" placeholder="0" />
          </dd>
          <dt className="font-bold text-base">{t("shop.purchase.payable")}</dt>
          <dd className="text-right font-bold text-base">{taka(payable)}</dd>
        </dl>

        <div className="border-t border-border-light pt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{t("shop.purchase.paidNow")}</span>
            <div className="flex gap-1">
              <button type="button" className={`${btnGhost} !px-2 !py-1 text-xs`} onClick={() => setPaid(String(payable))} disabled={!payable}>
                {taka(payable)}
              </button>
              <input value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} !w-28 text-right`} inputMode="decimal" placeholder="0" />
            </div>
          </div>
          {n(paid) > 0 && (
            <>
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
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={t("shop.purchase.payReference")} className={field} />
              )}
            </>
          )}
          {lines.length > 0 && (
            <p className={`text-sm font-semibold ${left > 0 ? "text-badge-discount" : left < 0 ? "text-amber-700 dark:text-amber-400" : "text-green-700"}`}>
              {left >= 0 ? t("shop.purchase.dueAfter", { amount: taka(left) }) : t("shop.purchase.overpaid", { amount: taka(-left) })}
            </p>
          )}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.common.note")} className={field} />
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <button className={`${btnPrimary} !py-3 text-base`} disabled={busy || !supplierId || !lines.some((l) => n(l.qty) > 0)} onClick={save}>
          {busy ? t("shop.common.saving") : t("shop.purchase.save")}
        </button>
      </aside>

      {adding && (
        <Sheet title={t("shop.purchase.newSupplier")} onClose={() => setAdding(false)}>
          <SupplierForm
            onCancel={() => setAdding(false)}
            onSaved={(id) => {
              setAdding(false);
              void loadSuppliers(id);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
