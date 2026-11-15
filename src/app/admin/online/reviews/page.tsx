"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Star, Trash2, X } from "lucide-react";

type Kind = "reviews" | "questions";
type Status = "pending" | "approved" | "rejected";

interface Item {
  id: string;
  status: Status;
  created_at: string;
  author_name: string;
  products: { title: string; slug: string } | null;
  // reviews
  rating?: number;
  title?: string | null;
  body?: string;
  photos?: string[];
  staff_reply?: string | null;
  // questions
  question?: string;
  answer?: string | null;
}

const SETTINGS: { key: string; label: string; hint: string; type: "number" | "switch" }[] = [
  { key: "proof_enabled", label: "Show scarcity and social proof", hint: "Master switch for everything below", type: "switch" },
  { key: "proof_low_stock_max", label: "“Only N left” when stock is at most", hint: "Uses the real stock of the chosen size", type: "number" },
  { key: "proof_recent_sales_min", label: "“N bought in 24 hours” when at least", hint: "Counted from real orders", type: "number" },
  { key: "proof_viewers_min", label: "“N looking now” when at least", hint: "Live visitors on that product page", type: "number" },
  { key: "proof_bestseller_min", label: "Bestseller badge at this many sold in 30 days", hint: "From real orders", type: "number" },
  { key: "proof_recent_popup", label: "“Someone in <district> bought…” popup", hint: "District and product only, never a name", type: "switch" },
];

export default function ReviewsAdminPage() {
  const [kind, setKind] = useState<Kind>("reviews");
  const [status, setStatus] = useState<Status | "all">("pending");
  const [items, setItems] = useState<Item[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/reviews?kind=${kind}&status=${status}`);
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Could not load. Has the Phase 2 migration been applied?");
    setError(null);
    setItems(json.items);
  }, [kind, status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/proof-settings").then((r) => r.json()).then((j) => setSettings(j.settings ?? {})).catch(() => {});
  }, []);

  async function patch(item: Item, body: Record<string, unknown>) {
    const res = await fetch("/api/admin/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id: item.id, ...body }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not save");
    else await load();
  }
  async function remove(item: Item) {
    if (!confirm("Delete permanently?")) return;
    await fetch(`/api/admin/reviews?kind=${kind}&id=${item.id}`, { method: "DELETE" });
    await load();
  }
  async function saveSettings() {
    const res = await fetch("/api/admin/proof-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not save settings");
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const field = "px-2 py-1 text-sm bg-surface-subtle rounded border border-border-light";

  return (
    <div className="p-space-base max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-xl uppercase font-bold text-primary mb-1">Reviews and questions</h1>
        <p className="text-sm text-text-muted mb-3">Only customers with a delivered order can review. Nothing shows on the site until you approve it.</p>
        {error && (
          <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        <div className="flex gap-2 flex-wrap mb-3">
          {(["reviews", "questions"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 text-xs font-display uppercase font-bold rounded border ${kind === k ? "bg-primary text-primary-foreground border-primary" : "bg-surface-card border-border-light"}`}>{k}</button>
          ))}
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")} className={`${field} ml-auto`} aria-label="Status">
            <option value="pending">Waiting</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>

        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="bg-surface-card rounded-xl border border-border-light p-4">
              <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
                <strong className="text-primary text-sm">{i.author_name}</strong>
                <span>on {i.products?.title ?? "a product"}</span>
                <span className="ml-auto">{new Date(i.created_at).toLocaleString("en-GB")} · {i.status}</span>
              </div>
              {kind === "reviews" ? (
                <>
                  <div className="flex mt-1">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-4 h-4 ${n <= (i.rating ?? 0) ? "fill-accent-gold text-accent-gold" : "text-border-light"}`} />)}</div>
                  {i.title && <p className="font-semibold text-sm mt-1">{i.title}</p>}
                  <p className="text-sm mt-1 whitespace-pre-line">{i.body}</p>
                  {!!i.photos?.length && (
                    <div className="flex gap-2 mt-2">{i.photos.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="w-16 h-16 object-cover rounded border border-border-light" />
                      </a>
                    ))}</div>
                  )}
                  <div className="flex gap-2 mt-3 items-center">
                    <input className={`${field} flex-1`} placeholder="Reply (shown under the review)" value={replies[i.id] ?? i.staff_reply ?? ""} onChange={(e) => setReplies({ ...replies, [i.id]: e.target.value })} />
                    <button onClick={() => patch(i, { staff_reply: replies[i.id] ?? i.staff_reply ?? "" })} className="text-xs font-bold uppercase px-3 py-1.5 border border-border-light rounded">Save reply</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-sm mt-1">Q: {i.question}</p>
                  <textarea className={`${field} w-full mt-2`} rows={2} placeholder="Your answer (publishes the question)" value={replies[i.id] ?? i.answer ?? ""} onChange={(e) => setReplies({ ...replies, [i.id]: e.target.value })} />
                  <button onClick={() => patch(i, { answer: replies[i.id] ?? i.answer ?? "" })} className="mt-2 text-xs font-bold uppercase px-3 py-1.5 bg-primary text-primary-foreground rounded">Answer and publish</button>
                </>
              )}
              <div className="flex gap-2 mt-3">
                {i.status !== "approved" && kind === "reviews" && (
                  <button onClick={() => patch(i, { status: "approved" })} className="inline-flex items-center gap-1 text-xs font-bold uppercase px-3 py-1.5 bg-emerald-600 text-white rounded"><Check className="w-3.5 h-3.5" /> Approve</button>
                )}
                {i.status !== "rejected" && (
                  <button onClick={() => patch(i, { status: "rejected" })} className="inline-flex items-center gap-1 text-xs font-bold uppercase px-3 py-1.5 border border-border-light rounded"><X className="w-3.5 h-3.5" /> Reject</button>
                )}
                <button onClick={() => remove(i)} aria-label="Delete" className="ml-auto text-text-muted hover:text-badge-discount"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-text-muted text-center py-8">Nothing here.</li>}
        </ul>
      </div>

      <div>
        <h2 className="font-display text-lg uppercase font-bold text-primary mb-1">Scarcity and social proof</h2>
        <p className="text-sm text-text-muted mb-3">Every number is real. A number below its limit is hidden, never made up.</p>
        <div className="bg-surface-card rounded-xl border border-border-light divide-y divide-border-light">
          {SETTINGS.map((s) => (
            <div key={s.key} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1"><p className="text-sm font-semibold">{s.label}</p><p className="text-xs text-text-muted">{s.hint}</p></div>
              {s.type === "switch" ? (
                <select className={field} value={settings[s.key] ?? "off"} onChange={(e) => setSettings({ ...settings, [s.key]: e.target.value })}>
                  <option value="on">On</option><option value="off">Off</option>
                </select>
              ) : (
                <input type="number" min={0} className={`${field} w-20`} value={settings[s.key] ?? ""} onChange={(e) => setSettings({ ...settings, [s.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
        <button onClick={saveSettings} className="mt-3 px-5 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase rounded-lg">{saved ? "Saved" : "Save settings"}</button>
      </div>
    </div>
  );
}
