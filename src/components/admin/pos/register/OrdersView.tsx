"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileText, Printer, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka, type SaleDetail } from "@/lib/pos/types";
import { REGISTER } from "@/components/admin/nav";
import { api, dateTime } from "../api";
import { Numpad, applyKey, type PadKey } from "./parts";
import { SkeletonRows } from "@/components/ui/PageSkeleton";

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
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (term: string) => {
    setRows(null);
    const res = await api<{ sales: Row[] }>(`/api/admin/pos/sales?q=${encodeURIComponent(term.trim())}`);
    setRows(res.ok ? res.data.sales : []);
    if (!res.ok) setMsg({ ok: false, text: res.error });
  }, []);

  const open = useCallback(async (id: string) => {
    setSelected(id);
    setDetail(null);
    setQty({});
    setActive(null);
    setBuffer("");
    const res = await api<SaleDetail>(`/api/admin/pos/sales/${id}`);
    if (res.ok) setDetail(res.data);
    else setMsg({ ok: false, text: res.error });
  }, []);

  useEffect(() => {
    let stop = false;
    void api<{ sales: Row[] }>("/api/admin/pos/sales?q=").then((res) => {
      if (stop) return;
      setRows(res.ok ? res.data.sales : []);
      if (!res.ok) setMsg({ ok: false, text: res.error });
    });
    return () => {
      stop = true;
    };
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => status === "all" || r.status === status), [rows, status]);

  const left = (i: SaleDetail["items"][number]) => i.quantity - (i.returned_quantity ?? 0);
  const unit = (i: SaleDetail["items"][number]) => (i.quantity ? Number(i.line_total) / i.quantity : 0);
  const refundTotal = detail ? detail.items.reduce((sum, i) => sum + unit(i) * (qty[i.id] ?? 0), 0) : 0;

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
    const res = await api<{ refund_amount?: number }>(`/api/admin/pos/sales/${selected}`, { items, refund_method: method, restock: true, reason: "" });
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
      <section className={`flex-1 min-w-0 flex flex-col border-r border-border-light ${selected ? "hidden md:flex" : "flex"}`}>
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
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? t("shop.register.allOrders") : t(`shop.sales.status.${s}`)}
              </option>
            ))}
          </select>
          <span className="hidden sm:flex items-center text-xs text-text-muted tabular-nums px-1">{shown.length}</span>
        </form>
        <div className="flex-1 overflow-y-auto">
          {rows === null ? (
            <SkeletonRows count={10} label={t("shop.common.loading")} />
          ) : shown.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">{t("shop.register.noPastSales")}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {shown.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => void open(r.id)} className={`w-full grid grid-cols-[7rem_1fr_auto_auto] sm:grid-cols-[8rem_1fr_7rem_8rem] items-center gap-3 px-3 py-3 text-left hover:bg-surface-subtle ${selected === r.id ? "bg-primary/10" : ""}`}>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Right: the chosen bill + refund */}
      <aside className={`w-full md:w-[26rem] flex-shrink-0 flex-col bg-surface-card min-h-0 ${selected ? "flex" : "hidden md:flex"}`}>
        {!selected ? (
          <p className="m-auto p-6 text-sm text-text-muted text-center">{t("shop.register.pickOrder")}</p>
        ) : !detail ? (
          <SkeletonRows count={6} label={t("shop.common.loading")} />
        ) : (
          <>
            <div className="px-3 pt-3 flex items-center gap-2">
              <button type="button" onClick={() => setSelected(null)} className="md:hidden text-sm text-primary">←</button>
              <p className="flex-1 text-center text-sm text-on-surface-variant">{canManage ? t("shop.register.selectToRefund") : t("shop.sales.needManager")}</p>
            </div>
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
              <a className={action} href={`${REGISTER}/receipt/${detail.sale.id}`} target="_blank" rel="noreferrer">
                <FileText className="w-4 h-4" /> {t("shop.register.invoice")}
              </a>
              <a className={action} href={`${REGISTER}/receipt/${detail.sale.id}?size=thermal`} target="_blank" rel="noreferrer">
                <Printer className="w-4 h-4" /> {t("shop.sales.reprint")}
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
                {msg && <p className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-badge-discount"}`}>{msg.text}</p>}
                <button type="button" disabled={busy || refundTotal <= 0} onClick={() => void refund()} className="h-14 rounded-md bg-primary text-primary-foreground text-lg font-semibold disabled:opacity-40">
                  {t("shop.sales.refund")} {refundTotal > 0 ? taka(refundTotal) : ""}
                </button>
              </div>
            )}
            {!canManage && msg && <p className="px-3 pb-2 text-sm text-badge-discount">{msg.text}</p>}
          </>
        )}
      </aside>
    </div>
  );
}
