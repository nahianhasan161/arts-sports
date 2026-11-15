"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, Store, ArrowRight } from "lucide-react";
import { useT } from "@/i18n/client";
import { OFFLINE, ONLINE } from "@/components/admin/nav";
import { useAdminAccess } from "@/components/admin/access";

/** /admin: choose an app. Someone with only one app goes straight to it. */
export default function AdminHome() {
  const router = useRouter();
  const { t } = useT();
  const { hasOnline, hasOffline, userName } = useAdminAccess();
  const only = hasOnline && !hasOffline ? ONLINE : hasOffline && !hasOnline ? OFFLINE : null;
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (only) return router.replace(only);
      try {
        setLast(localStorage.getItem("admin-workspace"));
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [only, router]);

  if (only) return <div className="h-screen bg-surface" />;

  const apps = [
    { id: "online", href: ONLINE, icon: ShoppingBag, name: t("admin.shell.online"), hint: t("admin.shell.onlineHint"), tone: "bg-blue-100 text-blue-700" },
    { id: "offline", href: OFFLINE, icon: Store, name: t("admin.shell.store"), hint: t("admin.shell.storeHint"), tone: "bg-emerald-100 text-emerald-700" },
  ];

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <p className="text-sm text-text-muted">{t("admin.dash.hello")}{userName ? `, ${userName}` : ""}</p>
        <h1 className="font-display text-2xl font-bold text-primary mb-6">{t("admin.shell.choose")}</h1>
        <div className="grid sm:grid-cols-2 gap-4">
          {apps.map((a) => (
            <Link key={a.id} href={a.href} className={`group rounded-2xl border bg-surface-card p-6 flex flex-col gap-4 hover:border-accent-gold transition-colors ${last === a.id ? "border-accent-gold" : "border-border-light"}`}>
              <span className={`w-14 h-14 rounded-2xl flex items-center justify-center ${a.tone}`}>
                <a.icon className="w-7 h-7" />
              </span>
              <span>
                <span className="block text-lg font-bold text-primary">{a.name}</span>
                <span className="block text-sm text-text-muted mt-1">{a.hint}</span>
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent-gold">
                {t("admin.dash.open")}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
