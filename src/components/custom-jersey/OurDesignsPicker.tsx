"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { categoryName, type DesignCategoryRow } from "@/lib/custom-jersey/designs";

export interface GalleryDesign {
  id: string;
  image_url: string;
  title: string | null;
  caption: string | null;
}

/** Popup listing our gallery designs (category chips + name search). Toggling a card picks/unpicks it. */
export function OurDesignsPicker({ pickedIds, canAdd, onToggle, onClose }: {
  pickedIds: Set<string>;
  canAdd: boolean;
  onToggle: (design: GalleryDesign) => void;
  onClose: () => void;
}) {
  const { t, locale } = useT();
  const [category, setCategory] = useState("");
  const [cats, setCats] = useState<DesignCategoryRow[]>([]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GalleryDesign[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ offset: String(offset), limit: "24" });
      if (category) params.set("category", category);
      if (q.trim()) params.set("q", q.trim());
      fetch(`/api/custom-jersey/designs?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json) => {
          const rows = (json.designs ?? []) as GalleryDesign[];
          setItems((prev) => (offset === 0 ? rows : [...prev, ...rows]));
          setHasMore(Boolean(json.has_more));
          if (Array.isArray(json.categories)) setCats(json.categories as DesignCategoryRow[]);
        })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, q, offset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chip = (on: boolean) => `shrink-0 h-8 px-3 rounded-full border text-xs font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border-light bg-surface-card text-on-surface"}`;
  const pick = (c: string) => { setCategory(c); setOffset(0); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("customJersey.upload.ourDesignsTitle")} className="w-full sm:max-w-3xl max-h-[90vh] flex flex-col bg-surface-card text-on-surface rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border-light">
          <h3 className="font-display uppercase font-bold text-primary text-sm tracking-wider">{t("customJersey.upload.ourDesignsTitle")}</h3>
          <button type="button" onClick={onClose} aria-label={t("customJersey.upload.ourDesignsDone")} className="w-8 h-8 rounded-full hover:bg-surface-subtle flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-2 p-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder={t("customJersey.upload.ourDesignsSearch")} className="w-full h-10 pl-9 pr-3 rounded-lg border border-border-light bg-surface-card text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button type="button" className={chip(!category)} onClick={() => pick("")}>{t("customJersey.gallery.categories.all")}</button>
            {cats.map((c) => (
              <button key={c.slug} type="button" className={chip(category === c.slug)} onClick={() => pick(c.slug)}>{categoryName(c, locale)}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {!loading && items.length === 0 ? (
            <p className="text-sm text-text-muted py-12 text-center">{t("customJersey.upload.ourDesignsEmpty")}</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((d) => {
                const on = pickedIds.has(d.id);
                const disabled = !on && !canAdd;
                return (
                  <li key={d.id}>
                    <button type="button" disabled={disabled} onClick={() => onToggle(d)} aria-pressed={on} className={`w-full text-left rounded-xl overflow-hidden border-2 bg-surface-card ${on ? "border-primary" : "border-border-light"} ${disabled ? "opacity-40" : "hover:border-primary/60"}`}>
                      <div className="relative aspect-square bg-surface-subtle">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.image_url} alt={d.title ?? d.caption ?? ""} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                        {on && <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-4 h-4" /></span>}
                      </div>
                      {(d.title || d.caption) && <p className="px-2 py-1.5 text-xs font-semibold truncate">{d.title || d.caption}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {loading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>}
          {!loading && hasMore && (
            <div className="flex justify-center pt-4">
              <button type="button" onClick={() => setOffset(items.length)} className="h-9 px-4 rounded-lg border border-border-light text-xs font-semibold hover:bg-surface-subtle">{t("customJersey.upload.ourDesignsMore")}</button>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-border-light flex justify-end">
          <button type="button" onClick={onClose} className="h-10 px-5 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-wider">{t("customJersey.upload.ourDesignsDone")}</button>
        </div>
      </div>
    </div>
  );
}
