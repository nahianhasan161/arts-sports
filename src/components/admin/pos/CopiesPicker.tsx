"use client";

import { useT } from "@/i18n/client";
import { btnGhost } from "@/components/admin/pos/api";

/** Which copies an A4 receipt prints: both (cut line between), or just one. */
export type Copies = "both" | "customer" | "shop";

export function CopiesPicker({ value, onChange }: { value: Copies; onChange: (v: Copies) => void }) {
  const { t } = useT();
  const opts: [Copies, string][] = [
    ["both", t("shop.receipt.bothCopies")],
    ["customer", t("shop.receipt.customerOnly")],
    ["shop", t("shop.receipt.shopOnly")],
  ];
  return (
    <div className="inline-flex flex-wrap gap-1" role="group">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={`${btnGhost} ${value === v ? "ring-2 ring-primary" : ""}`}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
