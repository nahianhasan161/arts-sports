"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { FileText } from "lucide-react";
import { useT } from "@/i18n/client";
import { itemSummary, type ItemEstimate } from "@/lib/custom-jersey/items";
import { sizeSummary } from "@/lib/custom-jersey/pricing";
import type { CustomOrderDetail } from "@/lib/custom-jersey/types";
import { Lightbox } from "@/components/admin/pos/register/DesignRefs";

/**
 * The designs of an order (custom_orders.items), one card each: what it is made of,
 * its pictures (a gallery design shows all its pictures; tap to browse them big),
 * its note, and its sizes and pants. Used by the staff drawer and the customer's page.
 */
export function OrderDesigns({ order, fileHref }: { order: Pick<CustomOrderDetail, "items" | "files" | "roster" | "estimate_breakdown">; fileHref: (i: number) => string }) {
  const { t, locale } = useT();
  const [view, setView] = useState<{ items: { src: string; title: string }[]; index: number } | null>(null);
  const priced = (Array.isArray(order.estimate_breakdown?.items) ? order.estimate_breakdown.items : []) as ItemEstimate[];

  return (
    <div className="flex flex-col gap-3">
      {order.items.map((item) => {
        const est = priced.find((x) => x.id === item.id);
        const rows = order.roster.filter((r) => r.item_id === item.id);
        const files = item.files.map((i) => ({ i, f: order.files[i] })).filter((x) => x.f);
        // Pictures that can be shown here: public ones (gallery / catalogue), every picture of a gallery design.
        const pics = files.flatMap(({ f }) => (/^https:\/\//.test(f.path) ? (f.images?.length ? f.images : [f.path]).map((src) => ({ src, title: f.note || f.name })) : []));
        const others = files.filter(({ f }) => !/^https:\/\//.test(f.path));
        const pants = rows.filter((r) => !item.jersey || r.pant_size).length;
        return (
          <div key={item.id} className="rounded-lg border border-border-light p-3 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">{item.title}</h4>
              <span className="text-xs text-text-muted tabular-nums">
                {t("shop.customReg.pcs", { n: rows.length })}
                {pants > 0 && item.jersey ? ` · ${t("shop.customReg.pants", { n: pants })}` : ""}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {itemSummary(item, est, locale, t as (k: string) => string)}
              {item.pant?.fabric_name ? ` (${item.pant.fabric_name})` : ""}
            </p>
            {pics.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {pics.map((p, i) => (
                  <button key={`${p.src}-${i}`} type="button" onClick={() => setView({ items: pics, index: i })} className="shrink-0 w-16 h-16 rounded border border-border-light overflow-hidden bg-surface-subtle" title={p.title}>
                    <img src={p.src} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {others.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {others.map(({ i, f }) => (
                  <li key={i} className="text-xs">
                    <a href={fileHref(i)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                      <FileText className="w-3.5 h-3.5" /> {f.name}
                    </a>
                    {f.note && <span className="text-text-muted"> · {f.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {pics.some((p) => p.title) && (
              <ul className="text-[11px] text-text-muted">
                {files.filter(({ f }) => f.note && /^https:\/\//.test(f.path)).map(({ i, f }) => <li key={i}>{f.note}</li>)}
              </ul>
            )}
            {item.notes && <p className="text-xs whitespace-pre-line bg-surface-subtle rounded p-2">{item.notes}</p>}
            {rows.length > 0 && <p className="text-xs tabular-nums">{sizeSummary(rows).map(([s, n]) => `${s}: ${n}`).join(" · ")}</p>}
          </div>
        );
      })}
      <Lightbox items={view?.items ?? []} index={view?.index ?? null} setIndex={(i) => setView((v) => (v && i !== null ? { ...v, index: i } : null))} />
    </div>
  );
}
