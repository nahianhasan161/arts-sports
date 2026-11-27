"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, XCircle } from "lucide-react";
import { useCartStore } from "@/lib/store/cart-store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatTaka } from "@/lib/pricing";
import type { CartItem } from "@/types";

interface Line {
  product_id: string;
  title: string;
  size: string | null;
  color: string | null;
  quantity: number;
  image: string | null;
}

interface MyOrder {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  order_items: Line[];
}

const CLOSED = ["shipped", "delivered", "returned", "cancelled", "completed"];
const REASONS: [string, string][] = [
  ["changed_mind", "Changed my mind"],
  ["duplicate", "Ordered twice"],
  ["delivery_delay", "Takes too long"],
  ["wrong_item", "Wrong item / size"],
  ["other", "Other"],
];

/** The customer's orders, with one-click reorder and tracking. */
export function MyOrders() {
  const router = useRouter();
  const { addLines } = useCartStore();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Set<string>>(new Set());
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [reasonCat, setReasonCat] = useState("changed_mind");
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    fetch("/api/account/orders?limit=10", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => setOrders(json.data ?? []))
      .catch(() => setOrders([]));
    fetch("/api/cancellations?status=pending&limit=50", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => setPendingCancel(new Set((json.data ?? []).map((c: { order_id: string }) => c.order_id))))
      .catch(() => {});
  }, []);

  const canCancel = (o: MyOrder) => !CLOSED.includes(o.status) && !pendingCancel.has(o.id);

  const submitCancel = async (order: MyOrder) => {
    setBusy(order.id);
    setMessage(null);
    try {
      const label = REASONS.find((r) => r[0] === reasonCat)?.[1] ?? "Other";
      const res = await fetch("/api/cancellations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          type: "order",
          reason_category: reasonCat,
          reason: reasonText.trim() || label,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setMessage(json.error || "Could not send the cancel request.");
        return;
      }
      setPendingCancel((s) => new Set(s).add(order.id));
      setCancelFor(null);
      setReasonText("");
      setMessage("Cancel request sent. We will confirm it shortly.");
    } finally {
      setBusy(null);
    }
  };

  // Current prices, not the old ones: the order RPC charges today's price anyway.
  const reorder = async (order: MyOrder) => {
    setBusy(order.id);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const ids = [...new Set(order.order_items.map((l) => l.product_id))];
      const { data } = supabase
        ? await supabase
            .from("products_with_effective_pricing")
            .select("id, slug, title, images, effective_price, effective_base_price, status, stock")
            .in("id", ids)
        : { data: [] };
      const live = new Map((data ?? []).map((p) => [p.id, p]));
      const lines: CartItem[] = [];
      for (const l of order.order_items) {
        const p = live.get(l.product_id);
        if (!p || p.status !== "published") continue;
        lines.push({
          id: `${p.id}-${l.size ?? ""}-${l.color ?? ""}`,
          productId: p.id,
          slug: p.slug,
          title: p.title,
          price: Number(p.effective_price),
          original_price: Number(p.effective_base_price),
          image: (Array.isArray(p.images) ? p.images[0] : null) ?? l.image ?? "",
          size: l.size ?? "",
          color: l.color ?? "",
          quantity: l.quantity,
          maxStock: Math.max(1, Number(p.stock ?? 20)),
        });
      }
      if (lines.length === 0) {
        setMessage("These products are no longer available.");
        return;
      }
      addLines(lines);
      if (lines.length < order.order_items.length) setMessage("Some items are no longer available and were skipped.");
      router.push("/checkout");
    } finally {
      setBusy(null);
    }
  };

  if (orders === null) return null;

  return (
    <section className="bg-surface-card border border-border-light rounded-xl p-space-lg mt-space-lg">
      <h2 className="font-display text-lg font-bold text-primary uppercase mb-3">My orders</h2>
      {message && <p className="text-xs text-amber-700 mb-2">{message}</p>}
      {orders.length === 0 ? (
        <p className="text-xs text-text-muted">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-border-light">
          {orders.map((o) => (
            <li key={o.id} className="py-3 flex flex-wrap items-center gap-3 text-xs">
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold">{o.id}</p>
                <p className="text-text-muted">
                  {new Date(o.created_at).toLocaleDateString("en-GB")} · {o.order_items.length} item(s) · {formatTaka(Number(o.total_amount))} ·{" "}
                  <span className="capitalize">{o.status}</span>
                </p>
              </div>
              <Link href={`/track?order=${encodeURIComponent(o.id)}`} className="sp-btn sp-ticket h-8 inline-flex items-center font-bold uppercase text-xs">
                Track
              </Link>
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => void reorder(o)}
                className="sp-btn sp-basket h-8 inline-flex items-center gap-1.5 font-bold uppercase text-xs"
              >
                {busy === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Order again
              </button>
              {pendingCancel.has(o.id) ? (
                <span className="text-xs font-semibold text-amber-700">Cancel requested</span>
              ) : canCancel(o) && cancelFor !== o.id ? (
                <button
                  type="button"
                  onClick={() => setCancelFor(o.id)}
                  className="sp-btn sp-red h-8 inline-flex items-center gap-1.5 font-bold uppercase text-xs"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel order
                </button>
              ) : null}
              {cancelFor === o.id && (
                <div className="basis-full flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-surface-subtle p-2">
                  <select
                    value={reasonCat}
                    onChange={(e) => setReasonCat(e.target.value)}
                    className="h-8 rounded-md border border-border-light bg-surface-card px-2 text-xs"
                  >
                    {REASONS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Note (optional)"
                    className="h-8 flex-1 min-w-[140px] rounded-md border border-border-light bg-surface-card px-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy === o.id}
                    onClick={() => void submitCancel(o)}
                    className="sp-btn sp-red h-8 inline-flex items-center gap-1.5 font-bold uppercase text-xs"
                  >
                    {busy === o.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirm cancel
                  </button>
                  <button type="button" onClick={() => setCancelFor(null)} className="text-xs text-text-muted underline">
                    Keep order
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
