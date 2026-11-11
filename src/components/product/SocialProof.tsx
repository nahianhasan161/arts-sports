"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Eye, Flame } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface Proof {
  enabled: boolean;
  sold_24h?: number | null;
  low_stock_max?: number;
  viewers_min?: number;
}

/**
 * Scarcity and social proof for a product page. Every figure is real:
 *  - stock comes from the selected size's stock row,
 *  - "bought in 24 hours" is counted from orders by product_social_proof(),
 *  - "watching now" is Supabase Realtime presence on this product's channel.
 * A figure below its admin-set threshold is not shown, never invented. If
 * the proof function is not there yet, only the real low-stock line shows.
 */
export function SocialProof({ productId, stock, size }: { productId: string; stock: number; size?: string }) {
  const [proof, setProof] = useState<Proof>({ enabled: true, low_stock_max: 5 });
  const [viewers, setViewers] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let alive = true;
    Promise.resolve(supabase.rpc("product_social_proof", { p_product_id: productId })).then(({ data, error }) => {
      if (alive && !error && data) setProof(data as Proof);
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || proof.enabled === false) return;
    const key = crypto.randomUUID();
    const channel = supabase.channel(`viewers:${productId}`, { config: { presence: { key } } });
    channel
      .on("presence", { event: "sync" }, () => setViewers(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [productId, proof.enabled]);

  if (proof.enabled === false) return null;

  const lowMax = proof.low_stock_max ?? 5;
  const showLow = stock > 0 && stock <= lowMax;
  const showViewers = viewers >= (proof.viewers_min ?? 3);
  const showSold = typeof proof.sold_24h === "number" && proof.sold_24h > 0;
  if (!showLow && !showViewers && !showSold) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {showLow && (
        <div className="flex items-center gap-2 text-xs text-badge-discount font-medium bg-badge-discount/10 px-3 py-1.5 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Only <strong className="font-bold">{stock}</strong> left{size ? ` in size ${size}` : ""}.
          </span>
        </div>
      )}
      {showSold && (
        <div className="flex items-center gap-2 text-xs text-primary font-medium bg-primary/5 px-3 py-1.5 rounded-lg">
          <Flame className="w-4 h-4 shrink-0" />
          <span>
            <strong className="font-bold">{proof.sold_24h}</strong> bought in the last 24 hours.
          </span>
        </div>
      )}
      {showViewers && (
        <div className="flex items-center gap-2 text-xs text-text-muted bg-surface-subtle px-3 py-1.5 rounded-lg">
          <Eye className="w-4 h-4 shrink-0" />
          <span>
            <strong className="font-bold text-primary">{viewers}</strong> people are looking at this now.
          </span>
        </div>
      )}
    </div>
  );
}
