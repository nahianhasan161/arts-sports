"use client";

import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";

/** "Add ৳300 more for free delivery" progress bar (checkout and bag). */
export function FreeDeliveryBar({ subtotal, threshold }: { subtotal: number; threshold: number }) {
  const { t, locale } = useT();
  if (!threshold || subtotal <= 0) return null;
  const left = threshold - subtotal;
  const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 rounded-full bg-surface-subtle overflow-hidden">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-text-muted">
        {left > 0 ? (
          t("buy.cart.freeLeft", { amount: formatMoney(left, locale) })
        ) : (
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{t("buy.cart.freeDone")}</span>
        )}
      </p>
    </div>
  );
}
