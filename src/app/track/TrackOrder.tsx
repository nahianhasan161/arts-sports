"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, ExternalLink, Loader2 } from "lucide-react";
import { formatTaka } from "@/lib/pricing";

interface Tracked {
  id: string;
  status: string;
  confirmation_status: string;
  payment_plan: string;
  total_amount: number;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  area: string;
  courier: string | null;
  courier_status: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  items: { title: string; size: string | null; color: string | null; quantity: number }[];
}

const STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "With the courier" },
  { key: "delivered", label: "Delivered" },
] as const;

function stepIndex(o: Tracked): number {
  if (o.status === "delivered") return 3;
  if (o.status === "shipped" || o.courier_status) return 2;
  if (o.confirmation_status === "confirmed" || o.status === "processing") return 1;
  return 0;
}

const inputCls = "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-card text-sm focus:outline-none focus:ring-1 focus:ring-primary";

export function TrackOrder() {
  const params = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Tracked | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setOrder(null);
        setError(json.error ?? "Could not find that order.");
      } else setOrder(json.order);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const current = order ? stepIndex(order) : -1;
  const cancelled = order?.status === "cancelled" || order?.status === "returned";

  return (
    <div className="flex flex-col gap-space-lg">
      <form onSubmit={submit} className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
        <div>
          <label htmlFor="tr-order" className="block text-xs font-semibold mb-1">Order number</label>
          <input id="tr-order" className={inputCls} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="ORD-XXXXXXXXXX" required />
        </div>
        <div>
          <label htmlFor="tr-phone" className="block text-xs font-semibold mb-1">Phone number</label>
          <input id="tr-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="01XXXXXXXXX" required />
        </div>
        <button type="submit" disabled={loading} className="h-10 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Track
        </button>
        {error && (
          <p className="text-xs text-badge-discount flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}
      </form>

      {order && (
        <div className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-4">
          <div className="flex justify-between items-baseline">
            <span className="font-display font-bold text-primary">{order.id}</span>
            <span className="text-xs text-text-muted">{new Date(order.created_at).toLocaleDateString("en-GB")}</span>
          </div>

          {cancelled ? (
            <p className="text-sm font-semibold text-badge-discount">This order was {order.status}.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      i <= current ? "bg-emerald-600 text-white" : "bg-surface-subtle text-text-muted"
                    }`}
                  >
                    {i <= current ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className={i <= current ? "font-semibold" : "text-text-muted"}>{s.label}</span>
                  {s.key === "confirmed" && i > current && order.confirmation_status === "needs_call" && (
                    <span className="text-[11px] text-amber-700">we will call you</span>
                  )}
                </li>
              ))}
            </ol>
          )}

          {order.courier && (
            <div className="text-xs bg-surface-subtle rounded-lg p-3 flex flex-col gap-1">
              <span>
                Courier: <strong>{order.courier}</strong>
                {order.tracking_code ? ` · ${order.tracking_code}` : ""}
              </span>
              {order.tracking_url && (
                <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold inline-flex items-center gap-1">
                  Open courier tracking <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <ul className="text-xs flex flex-col gap-1 border-t border-border-light pt-3">
            {order.items.map((i, idx) => (
              <li key={idx}>
                {i.quantity} × {i.title}
                {[i.size, i.color].filter(Boolean).length ? ` (${[i.size, i.color].filter(Boolean).join(", ")})` : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm font-bold text-primary">Total {formatTaka(order.total_amount)}</p>
        </div>
      )}
    </div>
  );
}
