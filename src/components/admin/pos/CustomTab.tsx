"use client";

import { useState } from "react";
import { ExternalLink, Printer, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { STATUS_LABEL } from "@/components/admin/custom-orders/labels";
import type { CustomOrderStatus } from "@/lib/custom-jersey/types";
import { api, btnGhost, btnPrimary, card, field } from "./api";

export interface CounterOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  quantity: number;
  fabric_name: string | null;
  sport: string;
  status: CustomOrderStatus;
  due_date: string | null;
  needed_by: string | null;
  created_at: string;
  link: string;
  total: number;
  paid: number;
  payable: number;
  kind: "advance" | "balance";
  can_pay: boolean;
}

const METHODS = ["cash", "card", "bkash", "nagad"] as const;

/** Custom jersey at the counter (roadmap 4.3): start an order, find one by scan or phone, take money, hand it over. */
export function CustomTab() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<CounterOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<Record<string, { amount: string; method: (typeof METHODS)[number]; trx: string }>>({});
  const [busy, setBusy] = useState(false);

  async function search(term = q) {
    if (!term.trim()) return;
    const res = await api<{ orders: CounterOrder[] }>(`/api/admin/pos/custom?q=${encodeURIComponent(term)}`);
    if (!res.ok) return setError(res.error);
    setError(null);
    setOrders(res.data.orders);
  }

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const res = await api("/api/admin/pos/custom", body);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPay({});
    await search();
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-on-surface-variant max-w-md">{t("shop.custom.newHint")}</p>
        <a className={btnPrimary} href="/custom-jersey?shop=1" target="_blank" rel="noreferrer">
          <ExternalLink className="w-4 h-4" /> {t("shop.custom.newOrder")}
        </a>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.custom.searchPlaceholder")} className={`${field} pl-9`} />
        </div>
        <button className={btnPrimary}>{t("shop.common.search")}</button>
      </form>
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      {orders?.length === 0 && <p className="text-sm text-text-muted">{t("shop.common.none")}</p>}

      {orders?.map((o) => {
        const left = Math.max(0, o.total - o.paid);
        const p = pay[o.id] ?? { amount: String(o.payable || ""), method: "cash" as const, trx: "" };
        const set = (patch: Partial<typeof p>) => setPay((c) => ({ ...c, [o.id]: { ...p, ...patch } }));
        return (
          <article key={o.id} className={`${card} p-4 flex flex-col gap-3`}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-primary text-lg">{o.order_number}</h3>
                <p className="text-sm">
                  {o.customer_name} · {o.customer_phone}
                </p>
                <p className="text-xs text-text-muted">
                  {o.quantity}× {o.sport} {o.fabric_name ? `· ${o.fabric_name}` : ""} {o.due_date || o.needed_by ? `· ${t("shop.custom.dueDate", { date: (o.due_date ?? o.needed_by) as string })}` : ""}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block text-xs font-bold uppercase rounded px-2 py-1 bg-primary text-primary-foreground">{STATUS_LABEL[o.status]}</span>
                <a className={`${btnGhost} !py-1 text-xs mt-2 flex`} href={`/admin/pos/custom-receipt/${o.id}`} target="_blank" rel="noreferrer">
                  <Printer className="w-3.5 h-3.5" /> {t("shop.custom.printReceipt")}
                </a>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-2 text-sm text-center">
              <div className="rounded bg-surface-subtle p-2">
                <dt className="text-xs text-text-muted">{t("shop.common.total")}</dt>
                <dd className="font-bold">{o.total ? taka(o.total) : "—"}</dd>
              </div>
              <div className="rounded bg-surface-subtle p-2">
                <dt className="text-xs text-text-muted">{t("shop.custom.paid")}</dt>
                <dd className="font-bold text-green-700">{taka(o.paid)}</dd>
              </div>
              <div className="rounded bg-surface-subtle p-2">
                <dt className="text-xs text-text-muted">{t("shop.custom.due")}</dt>
                <dd className={`font-bold ${left > 0 ? "text-badge-discount" : ""}`}>{o.total ? taka(left) : "—"}</dd>
              </div>
            </dl>

            {!o.can_pay ? (
              <p className="text-xs text-text-muted">{t("shop.custom.notPayable")}</p>
            ) : left > 0 ? (
              <div className="grid grid-cols-[1fr_110px_1fr_auto] gap-2">
                <input value={p.amount} onChange={(e) => set({ amount: e.target.value })} placeholder={t("shop.common.amount")} className={field} inputMode="decimal" />
                <select value={p.method} onChange={(e) => set({ method: e.target.value as (typeof METHODS)[number] })} className={field}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`shop.method.${m}`)}
                    </option>
                  ))}
                </select>
                <input value={p.trx} onChange={(e) => set({ trx: e.target.value })} placeholder={t("shop.pos.reference")} className={field} disabled={p.method === "cash"} />
                <button className={btnPrimary} disabled={busy} onClick={() => act({ id: o.id, action: "payment", amount: Number(p.amount), method: p.method, trx_id: p.trx })}>
                  {t(o.kind === "advance" ? "shop.custom.takeAdvance" : "shop.custom.takeBalance")}
                </button>
              </div>
            ) : (
              o.status === "ready" && (
                <button className={btnPrimary} disabled={busy} onClick={() => act({ id: o.id, action: "handover" })}>
                  {t("shop.custom.handover")}
                </button>
              )
            )}
          </article>
        );
      })}
    </div>
  );
}
