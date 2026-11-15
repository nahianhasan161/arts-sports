"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, MessageCircle, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Lead {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  address: { division?: string; district?: string; thana?: string; line?: string };
  items: { title: string; size?: string; color?: string; quantity: number; price?: number }[];
  subtotal: number | null;
  attribution: { utm_source?: string; utm_campaign?: string };
  status: "new" | "no_answer" | "call_later" | "sold" | "not_interested";
  next_call_at: string | null;
  notes: string | null;
  call_count: number;
  last_called_at: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<Lead["status"], string> = {
  new: "Not called",
  no_answer: "No answer",
  call_later: "Call later",
  sold: "Sold",
  not_interested: "Not interested",
};

const FILTERS = [
  ["open", "Open"],
  ["new", "Not called"],
  ["no_answer", "No answer"],
  ["call_later", "Call later"],
  ["sold", "Sold"],
  ["not_interested", "Not interested"],
  ["all", "All"],
] as const;

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

function waLink(lead: Lead) {
  const digits = lead.phone.replace(/\D/g, "");
  const first = lead.items[0]?.title ?? "product";
  const text = `Assalamu alaikum${lead.name ? ` ${lead.name}` : ""}, Arts Sports theke bolchi. Apni "${first}" order korte giye thamiye chilen. Kono help lagbe?`;
  return `https://wa.me/88${digits.replace(/^88/, "")}?text=${encodeURIComponent(text)}`;
}

export default function LeadsPage() {
  const [filter, setFilter] = useState<string>("open");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (which: string) => {
    try {
      const res = await fetch(`/api/admin/leads?status=${which}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load leads");
      setLeads(json.leads);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("open");
  }, [load]);

  const update = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch("/api/admin/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not save");
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? json.lead : l)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary">Leads / Follow-up</h1>
        <p className="text-xs text-text-muted mt-1">
          People who typed their phone number at checkout but did not finish. Call or WhatsApp them, then set the result.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setFilter(value);
              setLoading(true);
              void load(value);
            }}
            className={`h-8 px-3 rounded-full text-[11px] font-bold uppercase border ${filter === value ? "bg-primary text-primary-foreground border-primary" : "border-border-light"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-xs text-badge-discount">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-3">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        {!loading && leads.length === 0 && (
          <p className="p-6 text-center text-xs text-text-muted bg-surface-card border border-border-light rounded-xl">No leads here.</p>
        )}
        {!loading &&
          leads.map((lead) => (
            <div key={lead.id} className="bg-surface-card border border-border-light rounded-xl p-4 text-xs grid gap-3 md:grid-cols-[1fr_1fr_260px]">
              <div className="space-y-1">
                <p className="text-sm font-bold">{lead.name || "No name"}</p>
                <p className="font-mono">{lead.phone}</p>
                <p className="text-text-muted">
                  {[lead.address?.line, lead.address?.thana, lead.address?.district].filter(Boolean).join(", ") || "No address yet"}
                </p>
                <p className="text-text-muted">
                  Left {ago(lead.updated_at)}
                  {lead.attribution?.utm_source ? ` · from ${lead.attribution.utm_source}` : ""}
                  {lead.attribution?.utm_campaign ? ` / ${lead.attribution.utm_campaign}` : ""}
                </p>
              </div>
              <div className="space-y-1">
                {lead.items.map((it, i) => (
                  <p key={i}>
                    {it.quantity} × {it.title}
                    {[it.size, it.color].filter(Boolean).length ? ` (${[it.size, it.color].filter(Boolean).join(", ")})` : ""}
                  </p>
                ))}
                {lead.subtotal != null && <p className="font-semibold">৳{Number(lead.subtotal).toLocaleString()}</p>}
                {lead.order_id && <p className="text-emerald-700 font-semibold">Order {lead.order_id}</p>}
                <p className="text-text-muted">
                  Calls: {lead.call_count}
                  {lead.last_called_at ? ` · last ${ago(lead.last_called_at)}` : ""}
                  {lead.next_call_at ? ` · call again ${new Date(lead.next_call_at).toLocaleString("en-GB")}` : ""}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={() => void update(lead.id, { called: true })}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg border border-border-light font-bold uppercase text-[11px]"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                  <a
                    href={waLink(lead)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#25D366] text-white font-bold uppercase text-[11px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                </div>
                <select
                  value={lead.status}
                  onChange={(e) => {
                    const status = e.target.value;
                    const patch: Record<string, unknown> = { status };
                    if (status === "call_later") {
                      const when = window.prompt("Call again when? (e.g. 2026-11-10 18:00)", "");
                      if (when) patch.next_call_at = new Date(when).toISOString();
                    }
                    void update(lead.id, patch);
                  }}
                  className="w-full h-8 px-2 rounded-lg border border-border-light"
                  aria-label="Call result"
                >
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <textarea
                  value={notes[lead.id] ?? lead.notes ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [lead.id]: e.target.value }))}
                  onBlur={() => notes[lead.id] !== undefined && void update(lead.id, { notes: notes[lead.id] })}
                  placeholder="Note"
                  rows={2}
                  className="w-full px-2 py-1 rounded-lg border border-border-light"
                />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
