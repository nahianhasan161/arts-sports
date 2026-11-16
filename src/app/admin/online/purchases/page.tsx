"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { api } from "@/components/admin/pos/api";
import { PurchaseScreen } from "@/components/admin/purchases/PurchaseScreen";
import { PurchaseList } from "@/components/admin/purchases/PurchaseList";
import type { PurchaseRow } from "@/lib/pos/purchase-types";

const TABS = ["new", "list"] as const;

/** Buying goods from a supplier. Needs the `inventory.manage` permission. */
export default function PurchasesPage() {
  const { t } = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]>("new");
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (tab !== "list") return;
    let live = true;
    void api<{ purchases: PurchaseRow[] }>("/api/admin/purchases").then((res) => {
      if (!live) return;
      if (res.ok) setRows(res.data.purchases);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [tab, version]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((id) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${tab === id ? "bg-primary text-primary-foreground" : "bg-surface-card border border-border-light"}`}>
            {t(`shop.purchase.tabs.${id}`)}
          </button>
        ))}
      </div>
      {/* Kept mounted so a bill being typed survives a look at the list. */}
      <div className={tab === "new" ? "" : "hidden"}>
        <PurchaseScreen />
      </div>
      {tab === "list" && (error ? <p className="text-sm text-badge-discount">{error}</p> : rows ? <PurchaseList rows={rows} onChanged={() => setVersion((v) => v + 1)} /> : <p className="text-sm text-text-muted">{t("shop.common.loading")}</p>)}
    </div>
  );
}
