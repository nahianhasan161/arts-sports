"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { useUrlState } from "@/lib/url-state";
import { api } from "@/components/admin/pos/api";
import { DayTab, type SessionInfo } from "@/components/admin/pos/DayTab";
import { CashReport } from "@/components/admin/pos/CashReport";

type Tab = "drawer" | "report";

/**
 * Cash: today's drawer (open it, cash in/out, count at closing) and the money report
 * (cash / bKash / Nagad / card / bank totals, chart, every money line, past drawer days).
 */
export default function CashPage() {
  const { t } = useT();
  const [tab, setTab] = useUrlState<Tab>("tab", "drawer", { fromUrl: (s) => (s === "report" ? "report" : "drawer") });
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<SessionInfo>("/api/admin/pos/session");
    if (!res.ok) return setError(res.error);
    setError(null);
    setInfo(res.data);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const tabClass = (on: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${on ? "bg-primary text-white" : "text-on-surface hover:bg-surface-subtle"}`;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-4">
      <div className="inline-flex self-start gap-1 rounded-xl border border-border-light bg-surface-card p-1" role="tablist">
        {(["drawer", "report"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tabClass(tab === k)} onClick={() => setTab(k)}>
            {t(k === "drawer" ? "shop.cashReport.tabDrawer" : "shop.cashReport.tabReport")}
          </button>
        ))}
      </div>

      {tab === "report" ? (
        <CashReport />
      ) : error ? (
        <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3 max-w-xl">{error}</p>
      ) : !info ? (
        <PageSkeleton label={t("shop.common.loading")} />
      ) : (
        <DayTab info={info} reload={load} hideHistory />
      )}
    </div>
  );
}
