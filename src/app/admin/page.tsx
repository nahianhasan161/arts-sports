"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Banknote, Store, Clock, RotateCcw, Shirt, MessageSquareText, Boxes, PackagePlus, ScanBarcode, LifeBuoy, CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { api } from "@/components/admin/pos/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, TaskRow, QuickLink, WeekBars, panel, num } from "@/components/admin/dashboard/parts";

interface Overview {
  orders_today: number;
  sales_today: number;
  shop_today: number;
  pending_orders: number;
  pending_returns: number;
  new_custom: number;
  pending_reviews: number;
  low_stock: number;
  products: number;
  week: { day: string; website: number; shop: number }[];
  recent: { id: string; customer_name: string | null; total_amount: number; status: string; created_at: string }[];
}

const statusTone: Record<string, string> = {
  delivered: "bg-green-100 text-green-700",
  shipped: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-700",
};

/** The website dashboard: today's numbers, then what is waiting, then shortcuts. */
export default function AdminDashboard() {
  const { t, locale } = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void api<Overview>("/api/admin/overview").then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="rounded-xl bg-badge-discount/10 border border-badge-discount/30 p-4 text-sm text-badge-discount">{t("admin.dash.error")}</p>;

  if (!data) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const tasks = [
    { n: data.pending_orders, key: "admin.dash.pendingOrders", href: "/admin/orders", icon: ShoppingCart, tone: "blue" },
    { n: data.new_custom, key: "admin.dash.newCustom", href: "/admin/custom-orders", icon: Shirt, tone: "purple" },
    { n: data.pending_returns, key: "admin.dash.pendingReturns", href: "/admin/returns", icon: RotateCcw, tone: "amber" },
    { n: data.pending_reviews, key: "admin.dash.pendingReviews", href: "/admin/reviews", icon: MessageSquareText, tone: "green" },
    { n: data.low_stock, key: "admin.dash.lowStock", href: "/admin/inventory", icon: Boxes, tone: "red" },
  ] as const;
  const waiting = tasks.filter((x) => x.n > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label={t("admin.dash.ordersToday")} value={num(data.orders_today, locale)} icon={ShoppingCart} tone="blue" href="/admin/orders" />
        <Stat label={t("admin.dash.salesToday")} value={formatMoney(Math.round(data.sales_today), locale)} icon={Banknote} tone="green" href="/admin/payments" />
        <Stat label={t("admin.dash.shopToday")} value={formatMoney(Math.round(data.shop_today), locale)} icon={Store} tone="purple" href="/admin/store" />
        <Stat label={t("admin.dash.toProcess")} value={num(data.pending_orders, locale)} icon={Clock} tone="amber" href="/admin/orders" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <section className={`${panel} p-4 sm:p-5 lg:col-span-3`}>
          <h2 className="text-base font-bold text-primary mb-2">{t("admin.dash.attention")}</h2>
          {waiting.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-4 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              {t("admin.dash.allClear")}
            </p>
          ) : (
            <div className="divide-y divide-border-light">
              {waiting.map((x) => (
                <TaskRow key={x.key} text={t(x.key, { n: num(x.n, locale) })} href={x.href} icon={x.icon} tone={x.tone} action={t("admin.dash.open")} />
              ))}
            </div>
          )}
        </section>

        <section className={`${panel} p-4 sm:p-5 lg:col-span-2`}>
          <h2 className="text-base font-bold text-primary mb-3">{t("admin.dash.quick")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickLink label={t("admin.dash.addProduct")} href="/admin/products" icon={PackagePlus} />
            <QuickLink label={t("admin.dash.seeOrders")} href="/admin/orders" icon={ShoppingCart} />
            <QuickLink label={t("admin.dash.openPos")} href="/admin/pos" icon={ScanBarcode} />
            <QuickLink label={t("admin.dash.stockIn")} href="/admin/inventory" icon={Boxes} />
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <section className={`${panel} p-4 sm:p-5 lg:col-span-2`}>
          <h2 className="text-base font-bold text-primary">{t("admin.dash.week")}</h2>
          <p className="text-xs text-text-muted mb-4">{t("admin.dash.weekHint")}</p>
          <WeekBars week={data.week} locale={locale} labels={{ website: t("admin.dash.website"), shop: t("admin.dash.shop") }} />
        </section>

        <section className={`${panel} p-4 sm:p-5 lg:col-span-3`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-primary">{t("admin.dash.recent")}</h2>
            <Link href="/admin/orders" className="text-sm font-semibold text-accent-gold hover:underline">
              {t("admin.dash.viewAll")}
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("admin.dash.noOrders")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left text-xs text-text-muted">
                    <th className="pb-2 font-semibold">{t("admin.dash.customer")}</th>
                    <th className="pb-2 font-semibold text-right">{t("admin.dash.amount")}</th>
                    <th className="pb-2 pl-4 font-semibold">{t("admin.dash.status")}</th>
                    <th className="pb-2 font-semibold">{t("admin.dash.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((o) => (
                    <tr key={o.id} className="border-b border-border-light last:border-b-0">
                      <td className="py-2.5 pr-2">
                        <p className="font-medium text-on-surface">{o.customer_name || "—"}</p>
                        <p className="text-[11px] text-text-muted">#{o.id.slice(0, 8)}</p>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-on-surface">{formatMoney(Number(o.total_amount ?? 0), locale)}</td>
                      <td className="py-2.5 pl-4">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone[o.status] ?? "bg-orange-100 text-orange-700"}`}>{o.status}</span>
                      </td>
                      <td className="py-2.5 text-text-muted whitespace-nowrap">{new Date(o.created_at).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-accent-gold/40 bg-accent-gold-soft p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <LifeBuoy className="w-8 h-8 text-accent-gold flex-shrink-0" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-primary">{t("admin.dash.firstSteps")}</h2>
          <p className="text-sm text-on-surface-variant">{t("admin.dash.firstStepsText")}</p>
        </div>
        <Link href="/admin/help" className="inline-flex items-center justify-center rounded-lg bg-accent-gold px-4 py-2.5 text-sm font-bold text-white hover:opacity-90">
          {t("admin.dash.openGuide")}
        </Link>
      </section>
    </div>
  );
}
