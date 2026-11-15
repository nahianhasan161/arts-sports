"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { api } from "@/components/admin/pos/api";
import { SalesTab } from "@/components/admin/pos/SalesTab";

/** Past bills: find, reprint, take goods back. A scanned receipt QR opens this page with ?receipt=<sale id>. */
export default function ShopOrdersPage() {
  const { t } = useT();
  const [ready, setReady] = useState<{ canManage: boolean; receipt: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const receipt = new URLSearchParams(window.location.search).get("receipt") ?? "";
    void api<{ can_manage: boolean }>("/api/admin/pos/session").then((res) => {
      if (alive) setReady({ canManage: res.ok && res.data.can_manage, receipt });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <p className="text-sm text-text-muted max-w-7xl mx-auto">{t("shop.common.loading")}</p>;
  return (
    <div className="max-w-7xl mx-auto">
      <SalesTab canManage={ready.canManage} initialQuery={ready.receipt} />
    </div>
  );
}
