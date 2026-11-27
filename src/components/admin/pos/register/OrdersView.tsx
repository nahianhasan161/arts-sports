"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileText, ReceiptText, Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka, type SaleDetail } from "@/lib/pos/types";
import { REGISTER } from "@/components/admin/nav";
import { api, dateTime } from "../api";
import { Numpad, applyKey, type PadKey } from "./parts";
import { SkeletonRows } from "@/components/ui/PageSkeleton";
import { DateRangeInputs, PeriodSelect, dateRange, periodRange, type Period } from "@/components/admin/filters/period";

interface Row {
  id: string;
  receipt_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  refunded_total?: number;
  status: string;
  created_at: string;
}

const METHODS = ["cash", "card", "bkash", "nagad", "other"] as const;
const STATUSES = ["all", "completed", "partially_refunded", "refunded"] as const;

/** The register's "Orders" screen: past bills on the left, the chosen bill and a refund pad on the right. */
export function OrdersView({ canManage, onCopy }: { canManage: boolean; onCopy: (id: string) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [period, setPeriod] = useState<Period | "custom">("all");
  const [days, setDays] = useState({ from: "", to: "" });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  // Part refund: empty = give back the full value; otherwise what the customer actually gets.
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const salesUrl = useCallback(
    (term: string) => {
      const { from, to } = period === "custom" ? dateRange(days.from, days.to) : periodRange(period);
      const p = new URLSearchParams({ q: term.trim() });
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (status !== "all") p.set("status", status);
      return `/api/admin/pos/sales?${p}`;
    },
    [period, days, status],
  );

  const load = useCallback(
    async (term: string) => {
      setRows(null);
      const res = await api<{ sales: Row[] }>(salesUrl(term));
      setRows(res.ok ? res.data.sales : []);
      if (!res.ok) setMsg({ ok: false, text: res.error });
    },
    [salesUrl],
  );

  function close() {
    setSelected(null);
    setDetail(null);
    setQty({});
    setActive(null);
    setBuffer("");
    setAmount("");
    setReason("");
  }

  const open = useCallback(async (id: string) => {
    setSelected(id);
    setDetail(null);
    setQty({});
    setActive(null);
    setBuffer("");
    setAmount("");
    setReason("");
    const res = await api<SaleDetail>(`/api/admin/pos/sales/${id}`);
    if (res.ok) setDetail(res.data);
    else setMsg({ ok: false, text: res.error });
  }, []);

  // Date/status changes reload from the server (the search box reloads on Enter).
  useEffect(() => {
    let stop = false;
    void api<{ sales: Row[] }>(salesUrl(q)).then((res) => {
      if (stop) return;
      setRows(res.ok ? res.data.sales : []);
      if (!res.ok) setMsg({ ok: false, text: res.error });
    });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesUrl]);

  const shown = useMemo(() => (rows ?? []).filter((r) => status === "all" || r.status === status), [rows, status]);
  const shownTotal = useMemo(() => shown.reduce((sum, r) => sum + Number(r.total || 0) - Number(r.refunded_total || 0), 0), [shown]);

  const left = (i: SaleDetail["items"][number]) => i.quantity - (i.returned_quantity ?? 0);
  const unit = (i: SaleDetail["items"][number]) => (i.quantity ? Number(i.line_total) / i.quantity : 0);
  // Same sum as pos_return_sale: each line's price less its share of the bill discount, capped at what is left.
  const fullRefund = useMemo(() => {
    if (!detail) return 0;
    const lines = detail.items.reduce((sum, i) => sum + Number(i.line_total || 0), 0);
    const factor = lines > 0 ? Number(detail.sale.total) / lines : 0;
    const sum = detail.items.reduce((acc, i) => acc + Math.round(unit(i) * (qty[i.id] ?? 0) * factor * 100) / 100, 0);
    return Math.max(0, Math.min(sum, Number(detail.sale.total) - Number(detail.sale.refunded_total || 0)));
  }, [detail, qty]);
  const picked = Object.values(qty).some((n) => n > 0);
  const asked = amount.trim() === "" ? null : Number(amount);
  const amountBad = asked !== null && (!Number.isFinite(asked) || asked < 0 || asked > fullRefund + 0.001);
  const refundTotal = asked === null || amountBad ? fullRefund : asked;

  function press(key: PadKey) {
    if (!detail || !active) return;
    const item = detail.items.find((i) => i.id === active);
    if (!item) return;
    const next = applyKey(buffer, key).replace(".", "");
    setBuffer(next);
    setQty((cur) => ({ ...cur, [active]: Math.min(left(item), Number(next) || 0) }));
  }

  function pick(id: string) {
    if (!detail) return;
    const item = detail.items.find((i) => i.id === id);
    if (!item || left(item) <= 0) return;
    setActive(id);
    setBuffer("");
    // First tap takes the whole remaining quantity, like the tills people know.
    setQty((cur) => (cur[id] ? cur : { ...cur, [id]: left(item) }));
  }

  async function refund() {
    if (!detail || !selected) return;
    const items = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([sale_item_id, quantity]) => ({ sale_item_id, quantity }));
    if (!items.length) return;
    setBusy(true);
    setMsg(null);
    if (amountBad) return;
    const body: Record<string, unknown> = { items, refund_method: method, restock: true, reason: reason.trim() };
    if (asked !== null && asked < fullRefund) body.refund_amount = asked;
    const res = await api<{ refund_amount?: number }>(`/api/admin/pos/sales/${selected}`, body);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: t("shop.sales.returned", { amount: taka(res.data.refund_amount ?? refundTotal) }) });
    void open(selected);
    void load(q);
  }

  const badge = (s: string) =>
    s === "refunded" ? "bg-badge-discount/15 text-badge-discount" : s === "partially_refunded" ? "bg-accent-gold/20 text-on-surface" : "bg-green-600/15 text-green-700 dark:text-green-400";
  const action = "h-11 flex-1 rounded-md border border-border-light bg-surface-card text-sm font-medium text-on-surface hover:bg-surface-subtle flex items-center justify-center gap-1.5 disabled:opacity-40";

  return (
    <div className="flex-1 flex min-h-0 flex-col md:flex-row">
      {/* Left: the list */}
      <section className={`flex-1 min-w-0 flex flex-col ${selected ? "hidden md:flex md:border-r md:border-border-light" : "flex"}`}>
        <form
          className="flex gap-2 p-2 border-b border-border-light"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.register.searchOrders")} autoFocus className="w-full h-10 rounded-md bg-surface-card border border-border-light pl-9 pr-3 text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-primary" />
          </div>
          <PeriodSelect custom value={period} onChange={setPeriod} className="h-10 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface" />
          {period === "custom" && (
            <DateRangeInputs from={days.from} to={days.to} onChange={(from, to) => setDays({ from, to })} className="h-10 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface" />
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? t("shop.register.allOrders") : t(`shop.sales.status.${s}`)}
              </option>
            ))}
          </select>
          <span className="hidden sm:flex flex-col justify-center text-xs text-text-muted tabular-nums px-1 text-right leading-tight">
            <span>{shown.length}</span>
            <span className="font-semibold text-on-surface">{taka(shownTotal)}</span>
          </span>
        </form>
        <div className="flex-1 overflow-y-auto">
          {rows === null ? (
            <SkeletonRows count={10} label={t("shop.common.loading")} />
          ) : shown.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">{t("shop.register.noPastSales")}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {shown.map((r) => (
                <li key={r.id} className={`flex items-stretch hover:bg-surface-subtle ${selected === r.id ? "bg-primary/10" : ""}`}>
                  <button type="button" onClick={() => void open(r.id)} className="flex-1 min-w-0 grid grid-cols-[7rem_1fr_auto_auto] sm:grid-cols-[8rem_1fr_7rem_8rem] items-center gap-3 pl-3 pr-1 py-3 text-left">
                    <span className="text-xs text-text-muted">{dateTime(r.created_at)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-on-surface truncate">{r.receipt_no}</span>
                      <span className="block text-xs text-text-muted truncate">{r.customer_name || r.customer_phone || t("shop.sales.walkIn")}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-on-surface text-right">{taka(r.total)}</span>
                    <span className="text-right">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${badge(r.status)}`}>{t(`shop.sales.status.${r.status as (typeof STATUSES)[1]}`)}</span>
                    </span>
                  </button>
                  {/* Shortcut: put this bill's items into a new bill without opening it. */}
                  <button type="button" onClick={() => onCopy(r.id)} className="w-12 flex-shrink-0 flex items-center justify-center text-text-muted hover:text-primary" aria-label={`${t("shop.register.copyToBill")} ${r.receipt_no}`} title={t("shop.register.copyToBill")}>
                    <Copy className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Right: the chosen bill + refund */}
      {selected && (
      <aside className="w-full md:w-[26rem] flex-shrink-0 flex flex-col bg-surface-card min-h-0">
        <div className="px-3 pt-2 flex items-center gap-2">
          <p className="flex-1 min-w-0 truncate text-sm font-semibold text-on-surface">{detail?.sale.receipt_no ?? ""}</p>
          <button type="button" onClick={close} className="h-9 w-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-subtle" aria-label={t("shop.sales.close")} title={t("shop.sales.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {!detail ? (
          <SkeletonRows count={6} label={t("shop.common.loading")} />
        ) : (
          <>
            <p className="px-3 text-center text-sm text-on-surface-variant">{canManage ? t("shop.register.selectToRefund") : t("shop.sales.needManager")}</p>
            <ul className="flex-1 overflow-y-auto px-2 py-2">
              {detail.items.map((i) => {
                const n = qty[i.id] ?? 0;
                const gone = left(i) <= 0;
                return (
                  <li key={i.id}>
                    <button type="button" disabled={!canManage || gone} onClick={() => pick(i.id)} className={`w-full text-left rounded-md px-2 py-2 flex gap-2 ${active === i.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-surface-subtle"} disabled:hover:bg-transparent`}>
                      <b className="tabular-nums text-on-surface">{i.quantity}</b>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm truncate ${gone ? "text-text-muted line-through" : "text-on-surface"}`}>
                          {i.title}
                          {i.variant_label ? ` · ${i.variant_label}` : ""}
                        </span>
                        {i.returned_quantity > 0 && <span className="block text-xs text-text-muted">{t("shop.sales.returnedQty", { n: i.returned_quantity })}</span>}
                        {n > 0 && <span className="block text-xs font-semibold text-badge-discount">{t("shop.sales.refund")}: {n} / {left(i)}</span>}
                      </span>
                      <b className="text-sm tabular-nums text-on-surface">{taka(i.line_total)}</b>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="px-3 py-2 border-t border-border-light text-sm">
              {Number(detail.sale.refunded_total) > 0 && (
                <p className="flex justify-between text-xs text-text-muted">
                  <span>{t("shop.sales.status.refunded")}</span>
                  <span className="tabular-nums">−{taka(detail.sale.refunded_total)}</span>
                </p>
              )}
              <p className="flex justify-between font-bold text-on-surface">
                <span>{t("shop.register.total")}</span>
                <span className="text-lg tabular-nums">{taka(detail.sale.total)}</span>
              </p>
            </div>

            <div className="px-2 pb-2 grid grid-cols-3 gap-1.5">
              <button type="button" className={action} onClick={() => onCopy(detail.sale.id)}>
                <Copy className="w-4 h-4" /> {t("shop.register.copyToBill")}
              </button>
              {/* Invoice = full A4 page with the bill-to details; receipt = the small roll-printer slip. */}
              <a className={action} href={`${REGISTER}/receipt/${detail.sale.id}?doc=invoice`} target="_blank" rel="noreferrer" title={t("shop.register.invoiceHint")}>
                <FileText className="w-4 h-4" /> {t("shop.register.invoice")}
              </a>
              <a className={action} href={`${REGISTER}/receipt/${detail.sale.id}?size=thermal`} target="_blank" rel="noreferrer" title={t("shop.register.receiptHint")}>
                <ReceiptText className="w-4 h-4" /> {t("shop.register.receipt")}
              </a>
            </div>

            {canManage && (
              <div className="px-2 pb-2 flex flex-col gap-2">
                <Numpad onKey={press} disabled={!active} />
                <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="h-10 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface">
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t("shop.sales.refundBy", { method: t(`shop.method.${m}`) })}
                    </option>
                  ))}
                </select>
                {picked && (
                  <div className="rounded-md border border-border-light p-2 flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-sm text-on-surface">
                      <span className="flex-1">{t("shop.sales.giveBack")}</span>
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        placeholder={String(Math.round(fullRefund * 100) / 100)}
                        aria-invalid={amountBad}
                        className={`w-32 h-10 rounded-md bg-surface-card border px-2 text-right text-base tabular-nums text-on-surface placeholder:text-text-muted focus:outline-none ${amountBad ? "border-badge-discount" : "border-border-light focus:border-primary"}`}
                      />
                    </label>
                    <p className={`text-xs ${amountBad ? "text-badge-discount" : "text-text-muted"}`}>
                      {amountBad
                        ? t("shop.sales.giveBackTooMuch", { amount: taka(fullRefund) })
                        : asked !== null && asked < fullRefund
                          ? t("shop.sales.kept", { full: taka(fullRefund), kept: taka(fullRefund - asked) })
                          : t("shop.sales.giveBackHint", { amount: taka(fullRefund) })}
                    </p>
                    {asked !== null && asked < fullRefund && (
                      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("shop.sales.partReason")} className="h-9 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-primary" />
                    )}
                  </div>
                )}
                {msg && <p className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-badge-discount"}`}>{msg.text}</p>}
                <button type="button" disabled={busy || !picked || amountBad} onClick={() => void refund()} className="h-14 rounded-md bg-primary text-primary-foreground text-lg font-semibold disabled:opacity-40">
                  {t("shop.sales.refund")} {refundTotal > 0 ? taka(refundTotal) : ""}
                </button>
              </div>
            )}
            {!canManage && msg && <p className="px-3 pb-2 text-sm text-badge-discount">{msg.text}</p>}
          </>
        )}
      </aside>
      )}
    </div>
  );
}
