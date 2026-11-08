"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
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

/** The customer's orders, with one-click reorder and tracking. */
export function MyOrders() {
  const router = useRouter();
  const { addLines } = useCartStore();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/orders?limit=10", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => setOrders(json.data ?? []))
      .catch(() => setOrders([]));
  }, []);

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
              <Link href={`/track?order=${encodeURIComponent(o.id)}`} className="h-8 px-3 inline-flex items-center rounded-lg border border-border-light font-bold uppercase text-[11px]">
                Track
              </Link>
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => void reorder(o)}
                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-primary text-white font-bold uppercase text-[11px] disabled:opacity-60"
              >
                {busy === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Order again
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
