"use client";

import { formatTaka } from "@/lib/pricing";

/** "Add ৳300 more for free delivery" progress bar (checkout and bag). */
export function FreeDeliveryBar({ subtotal, threshold }: { subtotal: number; threshold: number }) {
  if (!threshold || subtotal <= 0) return null;
  const left = threshold - subtotal;
  const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-text-muted">
        {left > 0 ? (
          <>
            Add <strong className="text-on-surface">{formatTaka(left)}</strong> more for free delivery.
          </>
        ) : (
          <span className="text-emerald-700 font-semibold">You get free delivery.</span>
        )}
      </p>
    </div>
  );
}
