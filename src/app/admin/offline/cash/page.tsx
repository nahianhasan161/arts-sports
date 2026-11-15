"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { api } from "@/components/admin/pos/api";
import { DayTab, type SessionInfo } from "@/components/admin/pos/DayTab";

/** The cash drawer: open it, note cash in and out, count it at closing, and see past days. */
export default function CashPage() {
  const { t } = useT();
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

  if (error) return <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3 max-w-xl mx-auto">{error}</p>;
  if (!info) return <p className="text-sm text-text-muted max-w-7xl mx-auto">{t("shop.common.loading")}</p>;
  return (
    <div className="max-w-7xl mx-auto">
      <DayTab info={info} reload={load} />
    </div>
  );
}
