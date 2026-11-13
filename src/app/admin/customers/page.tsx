"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, MessageCircle, Phone, Search, Send, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { toInternational } from "@/lib/phone";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";

const SEGMENTS = ["all", "inactive_90", "new_30", "shop", "online", "team", "vip", "consented", "blacklisted"] as const;
type Segment = (typeof SEGMENTS)[number];
const QUICK_TAGS = ["VIP", "offline", "online", "custom team"];

interface Row {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  marketing_consent: boolean;
  marketing_opt_out: boolean;
  is_blacklisted: boolean;
  online_orders: number;
  shop_sales: number;
  custom_orders: number;
  total_spent: number;
  last_purchase_at: string | null;
  created_at: string;
}

interface Detail {
  customer: Row;
  stats: { online_orders: number; shop_sales: number; custom_orders: number; total_spent: number } | null;
  history: { kind: "online" | "shop" | "custom"; id: string; ref: string; amount: number; status: string; at: string; items: string }[];
}

/** Customers from the site, the shop and custom orders in one list (roadmap 4.6). Needs `customers.view`. */
export default function CustomersPage() {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [smsReady, setSmsReady] = useState(false);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [tag, setTag] = useState("");
  const [bought, setBought] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState({ name: "", notes: "", tags: [] as string[], newTag: "" });
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageResult, setMessageResult] = useState<string | null>(null);

  const filters = `q=${encodeURIComponent(q)}&segment=${segment}&tag=${encodeURIComponent(tag)}&bought=${encodeURIComponent(bought)}`;

  const load = useCallback(async () => {
    const res = await api<{ customers: Row[]; total: number; tags: string[]; sms_ready: boolean }>(`/api/admin/customers?${filters}`);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setRows(res.data.customers);
    setTotal(res.data.total);
    setSmsReady(res.data.sms_ready);
    setTags((current) => [...new Set([...current, ...res.data.tags])].sort());
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), q || bought ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, q, bought]);

  async function open(id: string) {
    const res = await api<Detail>(`/api/admin/customers/${id}`);
    if (!res.ok) return setError(res.error);
    setDetail(res.data);
    setDraft({ name: res.data.customer.name ?? "", notes: res.data.customer.notes ?? "", tags: res.data.customer.tags, newTag: "" });
    setSaved(false);
  }

  async function patch(body: Record<string, unknown>) {
    if (!detail) return;
    const res = await api(`/api/admin/customers/${detail.customer.id}`, body, "PATCH");
    if (!res.ok) return setError(res.error);
    setError(null);
    setSaved(true);
    await open(detail.customer.id);
    setSaved(true);
    void load();
  }

  async function sendMessage() {
    const res = await api<{ sent: number; failed: number; skipped_no_consent: number }>("/api/admin/customers", { action: "message", text: message, filters });
    if (!res.ok) return setMessageResult(res.error);
    setMessageResult(t("shop.crm.messageSent", { sent: res.data.sent, failed: res.data.failed, skipped: res.data.skipped_no_consent }));
    setMessage("");
  }

  const wa = (phone: string) => `https://wa.me/${(toInternational(phone) ?? phone).replace(/\D/g, "")}`;
  const c = detail?.customer;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.crm.searchPlaceholder")} className={`${field} pl-9`} />
        </div>
        <select value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className={`${field} !w-auto`}>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {t(`shop.crm.segment.${s}`)}
            </option>
          ))}
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)} className={`${field} !w-auto`}>
          <option value="">{t("shop.crm.anyTag")}</option>
          {tags.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <input value={bought} onChange={(e) => setBought(e.target.value)} placeholder={t("shop.crm.boughtPlaceholder")} className={`${field} !w-48`} />
        <a className={btnGhost} href={`/api/admin/customers?${filters}&format=csv`}>
          <Download className="w-4 h-4" /> {t("shop.crm.export")}
        </a>
        <button className={btnGhost} onClick={() => setMessageOpen((v) => !v)}>
          <Send className="w-4 h-4" /> {t("shop.crm.messageTitle")}
        </button>
      </div>

      {messageOpen && (
        <div className={`${card} p-3 flex flex-col gap-2 max-w-2xl`}>
          <p className="text-xs text-text-muted">{t(smsReady ? "shop.crm.messageHint" : "shop.crm.noSms")}</p>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={600} placeholder={t("shop.crm.messagePlaceholder")} className={field} disabled={!smsReady} />
          <div className="flex items-center gap-3">
            <button className={btnPrimary} disabled={!smsReady || message.trim().length < 5} onClick={sendMessage}>
              {t("shop.crm.messageSend", { n: total })}
            </button>
            {messageResult && <span className="text-xs">{messageResult}</span>}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3">{error}</p>}
      <p className="text-xs text-text-muted">{t("shop.crm.count", { n: total })}</p>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted text-left">
            <tr>
              <th className="p-2">{t("shop.common.name")}</th>
              <th className="p-2">{t("shop.common.phone")}</th>
              <th className="p-2">{t("shop.crm.bought")}</th>
              <th className="p-2 text-right">{t("shop.crm.spent")}</th>
              <th className="p-2">{t("shop.crm.lastPurchase")}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-4 text-text-muted">
                  {t("shop.common.loading")}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-text-muted">
                  {t("shop.common.none")}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border-light hover:bg-surface-subtle cursor-pointer" onClick={() => open(r.id)}>
                <td className="p-2">
                  <span className={`font-semibold ${r.is_blacklisted ? "text-badge-discount" : ""}`}>{r.name || "—"}</span>
                  {r.tags.map((x) => (
                    <span key={x} className="ml-1.5 text-[10px] font-bold uppercase bg-accent-gold/20 text-primary rounded px-1.5 py-0.5">
                      {x}
                    </span>
                  ))}
                </td>
                <td className="p-2 font-mono text-xs">{r.phone}</td>
                <td className="p-2 text-xs text-text-muted">{t("shop.crm.counts", { online: r.online_orders, shop: r.shop_sales, custom: r.custom_orders })}</td>
                <td className="p-2 text-right font-semibold">{taka(r.total_spent)}</td>
                <td className="p-2 text-xs">{r.last_purchase_at ? r.last_purchase_at.slice(0, 10) : t("shop.crm.never")}</td>
                <td className="p-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <a href={`tel:${r.phone}`} className="inline-block p-1.5 text-text-muted hover:text-primary" title={t("shop.crm.call")}>
                    <Phone className="w-4 h-4" />
                  </a>
                  <a href={wa(r.phone)} target="_blank" rel="noreferrer" className="inline-block p-1.5 text-text-muted hover:text-green-700" title="WhatsApp">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && c && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
          <aside className="w-full max-w-lg h-full bg-surface overflow-y-auto p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-display text-xl font-bold text-primary">{c.name || c.phone}</h3>
                <p className="text-sm font-mono">{c.phone}</p>
                <p className="text-xs text-text-muted">
                  {t("shop.crm.since", { date: c.created_at.slice(0, 10) })} · {t("shop.crm.counts", { online: detail.stats?.online_orders ?? 0, shop: detail.stats?.shop_sales ?? 0, custom: detail.stats?.custom_orders ?? 0 })} · {taka(detail.stats?.total_spent ?? 0)}
                </p>
                {c.is_blacklisted && <p className="text-xs font-bold text-badge-discount">{t("shop.pos.blacklisted")}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="p-1 text-text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2">
              <a className={btnGhost} href={`tel:${c.phone}`}>
                <Phone className="w-4 h-4" /> {t("shop.crm.call")}
              </a>
              <a className={btnGhost} href={wa(c.phone)} target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>

            <div className={`${card} p-3 flex flex-col gap-2`}>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("shop.common.name")} className={field} />
              <div className="flex flex-wrap gap-1.5 items-center">
                {draft.tags.map((x) => (
                  <button key={x} className="text-xs font-semibold bg-accent-gold/20 text-primary rounded px-2 py-1" onClick={() => setDraft({ ...draft, tags: draft.tags.filter((y) => y !== x) })} title={t("shop.common.remove")}>
                    {x} ×
                  </button>
                ))}
                {QUICK_TAGS.filter((x) => !draft.tags.includes(x)).map((x) => (
                  <button key={x} className="text-xs border border-dashed border-border-light rounded px-2 py-1 text-text-muted" onClick={() => setDraft({ ...draft, tags: [...draft.tags, x] })}>
                    + {x}
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const x = draft.newTag.trim();
                    if (x && !draft.tags.includes(x)) setDraft({ ...draft, tags: [...draft.tags, x], newTag: "" });
                  }}
                >
                  <input value={draft.newTag} onChange={(e) => setDraft({ ...draft, newTag: e.target.value })} placeholder={t("shop.crm.addTag")} className="text-xs border border-border-light rounded px-2 py-1 bg-surface-subtle w-28" />
                </form>
              </div>
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} placeholder={t("shop.common.note")} className={field} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={c.marketing_consent && !c.marketing_opt_out} onChange={(e) => patch(e.target.checked ? { marketing_consent: true, marketing_opt_out: false } : { marketing_opt_out: true })} />
                {t("shop.crm.consent")}
              </label>
              <div className="flex items-center gap-3">
                <button className={btnPrimary} onClick={() => patch({ name: draft.name, notes: draft.notes, tags: draft.tags })}>
                  {t("shop.common.save")}
                </button>
                {saved && <span className="text-xs text-green-700">{t("shop.crm.saved")}</span>}
              </div>
            </div>

            <h4 className="text-sm font-semibold">{t("shop.crm.history")}</h4>
            <ul className={`${card} divide-y divide-border-light`}>
              {detail.history.length === 0 && <li className="p-3 text-sm text-text-muted">{t("shop.common.none")}</li>}
              {detail.history.map((h) => (
                <li key={`${h.kind}:${h.id}`} className="p-3 text-sm flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-[10px] font-bold uppercase bg-surface-subtle rounded px-1.5 py-0.5 mr-1.5">{t(`shop.crm.kind.${h.kind}`)}</span>
                    <strong>{h.ref}</strong>
                    <span className="block text-xs text-text-muted truncate">{h.items}</span>
                    <span className="block text-xs text-text-muted">
                      {dateTime(h.at)} · {h.status}
                    </span>
                  </span>
                  <strong className="whitespace-nowrap">{taka(h.amount)}</strong>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
