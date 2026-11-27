"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Link2, Plus, Printer, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { STATUS_LABEL } from "@/components/admin/custom-orders/labels";
import type { CustomOrderStatus } from "@/lib/custom-jersey/types";
import { OrderCardsSkeleton } from "./OrderCardsSkeleton";
import { api, btnGhost, btnPrimary, card, field } from "./api";
import { NewCustomOrder } from "./NewCustomOrder";

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
  /** One line per design ("Design 1 · 6 pcs · Mesh · pants 4"); empty on one-design orders. */
  designs?: { title: string; pieces: number; pants: number; fabric: string | null; jersey: boolean }[];
}

const METHODS = ["cash", "card", "bkash", "nagad"] as const;


/** Custom jersey at the counter (roadmap 4.3): start an order, find one by scan or phone, take money, hand it over. */
export function CustomTab({ hideNew = false }: { hideNew?: boolean } = {}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<CounterOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<Record<string, { amount: string; method: (typeof METHODS)[number]; trx: string }>>({});
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Latest-orders list (empty search) loads a page at a time as you scroll.
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listed, setListed] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);

  async function copyLink(o: CounterOrder) {
    try {
      await navigator.clipboard.writeText(o.link);
      setCopied(o.id);
      setTimeout(() => setCopied((c) => (c === o.id ? null : c)), 1500);
    } catch {
      window.prompt(t("shop.custom.copyLink"), o.link);
    }
  }

  // Empty search = the latest orders, so an order just taken shows up straight away.
  async function search(term = q) {
    setLoading(true);
    const res = await api<{ orders: CounterOrder[]; more?: boolean }>(`/api/admin/pos/custom?q=${encodeURIComponent(term)}`);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setOrders(res.data.orders);
    setMore(!!res.data.more);
    setListed(term.trim());
  }

  async function loadMore() {
    if (loadingMore || !more || listed || !orders) return;
    setLoadingMore(true);
    const res = await api<{ orders: CounterOrder[]; more?: boolean }>(`/api/admin/pos/custom?q=&offset=${orders.length}`);
    setLoadingMore(false);
    if (!res.ok) return setError(res.error);
    const seen = new Set(orders.map((o) => o.id));
    setOrders([...orders, ...res.data.orders.filter((o) => !seen.has(o.id))]);
    setMore(!!res.data.more);
  }

  // Load the next page when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || listed) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  });

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const res = await api("/api/admin/pos/custom", body);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPay({});
    await search();
  }

  useEffect(() => {
    let alive = true;
    void api<{ orders: CounterOrder[]; more?: boolean }>("/api/admin/pos/custom?q=").then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.ok) {
        setOrders(res.data.orders);
        setMore(!!res.data.more);
      } else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {hideNew ? null : creating ? (
        <NewCustomOrder
          onCancel={() => setCreating(false)}
          onDone={(number) => {
            setCreating(false);
            setQ(number);
            void search(number);
          }}
        />
      ) : (
        <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-sm text-on-surface-variant max-w-md">{t("shop.custom.newHint")}</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> {t("shop.custom.newOrder")}
            </button>
            <a className={btnGhost} href="/custom-jersey?shop=1" target="_blank" rel="noreferrer" title={t("shop.custom.fullFormHint")}>
              <ExternalLink className="w-4 h-4" /> {t("shop.custom.fullForm")}
            </a>
          </div>
        </div>
      )}

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
      {!listed && !!orders?.length && <h3 className="text-sm font-semibold text-on-surface-variant">{t("shop.custom.recent")}</h3>}
      {loading && <OrderCardsSkeleton />}
      {!loading && orders?.length === 0 && <p className="text-sm text-text-muted">{t("shop.common.none")}</p>}

      {!loading && orders?.map((o) => {
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
                <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                  <a className={`${btnGhost} !py-1 text-xs`} href={o.link} target="_blank" rel="noreferrer" title={t("shop.custom.openLinkHint")}>
                    <ExternalLink className="w-3.5 h-3.5" /> {t("shop.custom.openLink")}
                  </a>
                  <button type="button" className={`${btnGhost} !py-1 text-xs`} onClick={() => void copyLink(o)}>
                    {copied === o.id ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />} {t(copied === o.id ? "shop.custom.copied" : "shop.custom.copyLink")}
                  </button>
                  <a className={`${btnGhost} !py-1 text-xs`} href={`/admin/offline/pos/custom-receipt/${o.id}`} target="_blank" rel="noreferrer">
                    <Printer className="w-3.5 h-3.5" /> {t("shop.custom.printReceipt")}
                  </a>
                </div>
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

      {!loading && more && !listed && (
        <div ref={sentinel} className="flex flex-col gap-4">
          {loadingMore ? (
            <OrderCardsSkeleton count={2} />
          ) : (
            <button type="button" className={`${btnGhost} self-center`} onClick={() => void loadMore()}>
              {t("shop.custom.loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
