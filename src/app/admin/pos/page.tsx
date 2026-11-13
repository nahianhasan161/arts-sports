"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { api } from "@/components/admin/pos/api";
import { SellTab } from "@/components/admin/pos/SellTab";
import { SalesTab } from "@/components/admin/pos/SalesTab";
import { CustomTab } from "@/components/admin/pos/CustomTab";
import { DayTab, type SessionInfo } from "@/components/admin/pos/DayTab";

const TABS = ["sell", "sales", "custom", "day"] as const;
type Tab = (typeof TABS)[number];

/** The shop counter (roadmap 4.1–4.3). Needs the `pos.use` permission. */
export default function PosPage() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("sell");
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A scanned receipt QR opens /admin/pos?receipt=<sale id>.
  const [receipt, setReceipt] = useState("");

  const load = useCallback(async () => {
    const res = await api<SessionInfo>("/api/admin/pos/session");
    if (!res.ok) return setError(res.error);
    setError(null);
    setInfo(res.data);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      const id = new URLSearchParams(window.location.search).get("receipt");
      if (id) {
        setReceipt(id);
        setTab("sales");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3 max-w-xl">{error}</p>;
  if (!info) return <p className="text-sm text-text-muted">{t("shop.common.loading")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((id) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === id ? "bg-primary text-primary-foreground" : "bg-surface-card border border-border-light"}`}>
            {t(`shop.pos.tabs.${id}`)}
            {id === "day" && !info.session && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-badge-discount" />}
          </button>
        ))}
      </div>

      {tab === "sell" && <SellTab sessionOpen={Boolean(info.session)} showroomId={info.session?.showroom_id ?? info.showrooms[0]?.id ?? ""} maxDiscount={info.max_discount_percent} canManage={info.can_manage} onGoToDay={() => setTab("day")} />}
      {tab === "sales" && <SalesTab canManage={info.can_manage} initialQuery={receipt} />}
      {tab === "custom" && <CustomTab />}
      {tab === "day" && <DayTab info={info} reload={load} />}
    </div>
  );
}
