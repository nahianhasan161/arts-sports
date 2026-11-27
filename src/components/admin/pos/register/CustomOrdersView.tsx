"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Link2, PackageCheck, Printer, Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { COUNTER_STEPS, STATUSES, type CustomOrderStatus } from "@/lib/custom-jersey/types";
import { SkeletonRows } from "@/components/ui/PageSkeleton";
import type { CounterOrder } from "../CustomTab";
import { api, dateTime } from "../api";
import { Numpad, applyKey, type PadKey } from "./parts";

const METHODS = ["cash", "card", "bkash", "nagad"] as const;
const FILTERS = ["all", "open", ...STATUSES] as const;
type Filter = (typeof FILTERS)[number];
/** The progress bar: production steps, then handed over. */
const isStep = (s: CustomOrderStatus) => (COUNTER_STEPS as readonly string[]).includes(s);

function badge(s: CustomOrderStatus) {
  if (s === "delivered") return "bg-green-600/15 text-green-700 dark:text-green-400";
  if (s === "ready") return "bg-primary/15 text-primary";
  if (s === "rejected" || s === "cancelled") return "bg-badge-discount/15 text-badge-discount";
  if (isStep(s)) return "bg-accent-gold/20 text-on-surface";
  return "bg-surface-subtle text-on-surface-variant";
}

/**
 * Custom jersey orders in the register's "Orders" layout: the list on the left
 * (search, status filter), the chosen order on the right with its status steps,
 * payment pad and hand-over. The counter moves production steps (queue … ready);
 * review, mockup and reject stay on the online board.
 */
export function CustomOrdersView() {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<CounterOrder[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listed, setListed] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [trx, setTrx] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const url = useCallback(
    (term: string, offset = 0) => {
      const p = new URLSearchParams({ q: term.trim() });
      if (filter !== "all") p.set("status", filter);
      if (offset) p.set("offset", String(offset));
      return `/api/admin/pos/custom?${p}`;
    },
    [filter],
  );

  const load = useCallback(
    async (term: string) => {
      setRows(null);
      const res = await api<{ orders: CounterOrder[]; more?: boolean }>(url(term));
      setRows(res.ok ? res.data.orders : []);
      setMore(res.ok && !!res.data.more);
      setListed(term.trim());
      if (!res.ok) setMsg({ ok: false, text: res.error });
    },
    [url],
  );

  // The filter reloads from the server (the search box reloads on Enter).
  useEffect(() => {
    let stop = false;
    void api<{ orders: CounterOrder[]; more?: boolean }>(url(q)).then((res) => {
      if (stop) return;
      setRows(res.ok ? res.data.orders : []);
      setMore(res.ok && !!res.data.more);
      setListed(q.trim());
      if (!res.ok) setMsg({ ok: false, text: res.error });
    });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  async function loadMore() {
    if (loadingMore || !more || listed || !rows) return;
    setLoadingMore(true);
    const res = await api<{ orders: CounterOrder[]; more?: boolean }>(url("", rows.length));
    setLoadingMore(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    const seen = new Set(rows.map((o) => o.id));
    setRows([...rows, ...res.data.orders.filter((o) => !seen.has(o.id))]);
    setMore(!!res.data.more);
  }

  // Next page when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || listed) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  });

  const order = useMemo(() => rows?.find((o) => o.id === selected) ?? null, [rows, selected]);
  const left = order ? Math.max(0, order.total - order.paid) : 0;
  const shownDue = useMemo(() => (rows ?? []).reduce((sum, o) => sum + Math.max(0, o.total - o.paid), 0), [rows]);

  function open(o: CounterOrder) {
    setSelected(o.id);
    setAmount(o.payable ? String(o.payable) : "");
    setMethod("cash");
    setTrx("");
    setMsg(null);
    setCopied(false);
  }

  /** Re-read one order after a change, in place in the list. */
  async function refresh(id: string) {
    const res = await api<{ orders: CounterOrder[] }>(`/api/admin/pos/custom?id=${encodeURIComponent(id)}`);
    if (!res.ok || !res.data.orders[0]) return;
    const fresh = res.data.orders[0];
    setRows((cur) => (cur ?? []).map((o) => (o.id === id ? fresh : o)));
    setAmount(fresh.payable ? String(fresh.payable) : "");
  }

  async function act(body: Record<string, unknown>, done: string) {
    if (!order) return;
    setBusy(true);
    setMsg(null);
    const res = await api("/api/admin/pos/custom", { id: order.id, ...body });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return void refresh(order.id);
    }
    setMsg({ ok: true, text: done });
    setTrx("");
    await refresh(order.id);
  }

  async function copyLink() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(t("shop.custom.copyLink"), order.link);
    }
  }

  function press(key: PadKey) {
    setAmount((cur) => applyKey(cur, key));
  }

  const statusText = (s: CustomOrderStatus) => t(`customJersey.status.${s}`);
  const at = order ? COUNTER_STEPS.indexOf(order.status as (typeof COUNTER_STEPS)[number]) : -1;
  const action = "h-11 flex-1 rounded-md border border-border-light bg-surface-card text-sm font-medium text-on-surface hover:bg-surface-subtle flex items-center justify-center gap-1.5 disabled:opacity-40";
  const input = "h-10 rounded-md bg-surface-card border border-border-light px-2 text-sm text-on-surface";

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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.custom.searchPlaceholder")} autoFocus className="w-full h-10 rounded-md bg-surface-card border border-border-light pl-9 pr-3 text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-primary" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className={input} aria-label={t("shop.custom.status")}>
            {FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? t("shop.custom.allStatuses") : s === "open" ? t("shop.custom.openOnly") : statusText(s)}
              </option>
            ))}
          </select>
          <span className="hidden sm:flex flex-col justify-center text-xs text-text-muted tabular-nums px-1 text-right leading-tight">
            <span>{rows?.length ?? 0}</span>
            <span className="font-semibold text-badge-discount" title={t("shop.custom.due")}>{taka(shownDue)}</span>
          </span>
        </form>
        <div className="flex-1 overflow-y-auto">
          {rows === null ? (
            <SkeletonRows count={10} label={t("shop.common.loading")} />
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">{t("shop.common.none")}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {rows.map((o) => {
                const due = Math.max(0, o.total - o.paid);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => open(o)} className={`w-full grid grid-cols-[1fr_auto] sm:grid-cols-[8rem_1fr_7rem_9rem] items-center gap-3 px-3 py-3 text-left hover:bg-surface-subtle ${selected === o.id ? "bg-primary/10" : ""}`}>
                      <span className="hidden sm:block text-xs text-text-muted">{dateTime(o.created_at)}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-on-surface truncate">{o.order_number} · {t("shop.custom.pcs", { n: o.quantity })}</span>
                        <span className="block text-xs text-text-muted truncate">{o.customer_name} · {o.customer_phone}</span>
                      </span>
                      <span className="hidden sm:block text-right tabular-nums">
                        <span className="block text-sm font-semibold text-on-surface">{o.total ? taka(o.total) : "—"}</span>
                        {due > 0 && o.total > 0 && <span className="block text-xs text-badge-discount">{taka(due)}</span>}
                      </span>
                      <span className="text-right">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${badge(o.status)}`}>{statusText(o.status)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {rows !== null && more && !listed && (
            <div ref={sentinel} className="p-3 flex justify-center">
              {loadingMore ? (
                <SkeletonRows count={2} label={t("shop.common.loading")} />
              ) : (
                <button type="button" className="h-10 px-4 rounded-md border border-border-light text-sm text-on-surface-variant hover:bg-surface-subtle" onClick={() => void loadMore()}>
                  {t("shop.custom.loadMore")}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Right: the chosen order */}
      {order && (
        <aside className="w-full md:w-[26rem] flex-shrink-0 flex flex-col bg-surface-card min-h-0 overflow-y-auto">
          <div className="px-3 pt-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-on-surface">{order.order_number}</p>
              <p className="truncate text-xs text-text-muted">{order.customer_name} · {order.customer_phone}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="h-9 w-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-subtle" aria-label={t("shop.sales.close")} title={t("shop.sales.close")}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-3 py-2 text-xs text-text-muted">
            {order.quantity}× {order.sport}
            {order.fabric_name ? ` · ${order.fabric_name}` : ""}
            {order.due_date || order.needed_by ? ` · ${t("shop.custom.dueDate", { date: (order.due_date ?? order.needed_by) as string })}` : ""}
            {!!order.designs?.length && (
              <ul className="mt-1">
                {order.designs.map((d, i) => (
                  <li key={i}>
                    {d.title} · {t("shop.custom.pcs", { n: d.pieces })}{d.fabric ? ` · ${d.fabric}` : ""}{d.pants ? ` · pants ${d.pants}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Status: where it is; staff pick any production step */}
          <div className="px-3 pb-3 border-b border-border-light">
            <p className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs text-text-muted">{t("shop.custom.status")}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge(order.status)}`}>{statusText(order.status)}</span>
            </p>
            {isStep(order.status) ? (
              <>
                <p className="text-xs text-text-muted mb-1.5">{t("shop.custom.pickStatus")}</p>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("shop.custom.status")}>
                  {COUNTER_STEPS.map((s, i) => {
                    const current = s === order.status;
                    const done = i < at;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={current}
                        disabled={busy || current}
                        onClick={() => void act({ action: "move", to: s, from: order.status }, t("shop.custom.moved", { status: statusText(s) }))}
                        className={`min-h-11 rounded-md border px-2 py-1.5 text-sm font-medium flex items-center justify-center gap-1 text-center leading-tight ${
                          current
                            ? "border-primary bg-primary text-primary-foreground"
                            : done
                              ? "border-border-light bg-surface-subtle text-text-muted hover:text-on-surface disabled:opacity-40"
                              : "border-border-light bg-surface-card text-on-surface hover:bg-surface-subtle disabled:opacity-40"
                        }`}
                      >
                        {current && <Check className="w-4 h-4 shrink-0" />}
                        {statusText(s)}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              order.status !== "delivered" && <p className="text-xs text-text-muted">{t("shop.custom.statusOnBoard")}</p>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-2 p-3 text-sm text-center">
            <div className="rounded bg-surface-subtle p-2">
              <dt className="text-xs text-text-muted">{t("shop.common.total")}</dt>
              <dd className="font-bold tabular-nums">{order.total ? taka(order.total) : "—"}</dd>
            </div>
            <div className="rounded bg-surface-subtle p-2">
              <dt className="text-xs text-text-muted">{t("shop.custom.paid")}</dt>
              <dd className="font-bold tabular-nums text-green-700 dark:text-green-400">{taka(order.paid)}</dd>
            </div>
            <div className="rounded bg-surface-subtle p-2">
              <dt className="text-xs text-text-muted">{t("shop.custom.due")}</dt>
              <dd className={`font-bold tabular-nums ${left > 0 ? "text-badge-discount" : ""}`}>{order.total ? taka(left) : "—"}</dd>
            </div>
          </dl>

          <div className="px-2 pb-2 grid grid-cols-3 gap-1.5">
            <a className={action} href={order.link} target="_blank" rel="noreferrer" title={t("shop.custom.openLinkHint")}>
              <ExternalLink className="w-4 h-4" /> {t("shop.custom.openLink")}
            </a>
            <button type="button" className={action} onClick={() => void copyLink()}>
              {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />} {t(copied ? "shop.custom.copied" : "shop.custom.copyLink")}
            </button>
            <a className={action} href={`/admin/offline/pos/custom-receipt/${order.id}`} target="_blank" rel="noreferrer">
              <Printer className="w-4 h-4" /> {t("shop.custom.printReceipt")}
            </a>
          </div>

          <div className="px-2 pb-2 flex flex-col gap-2 mt-auto">
            {msg && <p className={`px-1 text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-badge-discount"}`}>{msg.text}</p>}
            {!order.can_pay ? (
              order.status !== "delivered" && <p className="px-1 text-xs text-text-muted">{t("shop.custom.notPayable")}</p>
            ) : left > 0 ? (
              <>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={t("shop.common.amount")} className="h-12 rounded-md bg-surface-card border border-border-light px-3 text-right text-xl font-bold tabular-nums text-on-surface" />
                <Numpad onKey={press} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])} className={input}>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`shop.method.${m}`)}
                      </option>
                    ))}
                  </select>
                  <input value={trx} onChange={(e) => setTrx(e.target.value)} placeholder={t("shop.pos.reference")} disabled={method === "cash"} className={`${input} disabled:opacity-50`} />
                </div>
                <button type="button" disabled={busy || !(Number(amount) > 0)} onClick={() => void act({ action: "payment", amount: Number(amount), method, trx_id: trx }, t("shop.custom.paymentTaken", { amount: taka(Number(amount)) }))} className="h-14 rounded-md bg-primary text-primary-foreground text-lg font-semibold disabled:opacity-40">
                  {t(order.kind === "advance" ? "shop.custom.takeAdvance" : "shop.custom.takeBalance")} {Number(amount) > 0 ? taka(Number(amount)) : ""}
                </button>
              </>
            ) : (
              order.status === "ready" && (
                <button type="button" disabled={busy} onClick={() => void act({ action: "handover" }, statusText("delivered"))} className="h-14 rounded-md bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                  <PackageCheck className="w-5 h-5" /> {t("shop.custom.handover")}
                </button>
              )
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
