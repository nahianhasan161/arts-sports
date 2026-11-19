"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Images } from "lucide-react";
import { useT } from "@/i18n/client";
import { categoryName, OTHER_CATEGORY, type DesignCategoryRow, type DesignRow } from "@/lib/custom-jersey/designs";
import { useCatalog } from "@/lib/pos/catalog-store";
import { api } from "../api";

const PAGE = 24;

/**
 * Our design gallery as register tiles (in place of a "sport" choice, which
 * confused customers picking a jersey made for another sport). Tap a design
 * to put it on the slip; tap again to take it off.
 */
export function GalleryStrip({ picked, onToggle, onMore }: { picked: Set<string>; onToggle: (d: DesignRow) => void; onMore: () => void }) {
  const { t, locale } = useT();
  const device = useCatalog();
  const [category, setCategory] = useState("");
  const [server, setServer] = useState<{ designs: DesignRow[]; categories: DesignCategoryRow[]; more: boolean } | null>(null);
  const [shown, setShown] = useState(PAGE);

  // No copy on this device yet: ask the server (first page of this category).
  useEffect(() => {
    if (device?.designs) return;
    let alive = true;
    const qs = new URLSearchParams({ limit: String(PAGE * 2), offset: "0" });
    if (category) qs.set("category", category);
    void api<{ designs: DesignRow[]; has_more?: boolean; categories?: DesignCategoryRow[] }>(`/api/admin/pos/designs?${qs}`).then((res) => {
      if (!alive || !res.ok) return;
      setServer((s) => ({ designs: res.data.designs, categories: res.data.categories ?? s?.categories ?? [], more: Boolean(res.data.has_more) }));
    });
    return () => {
      alive = false;
    };
  }, [device?.designs, category]);

  const cats = device?.designCategories ?? server?.categories ?? [];
  const designs = useMemo(() => {
    if (!device?.designs) return server?.designs ?? [];
    return device.designs.filter((d) => !category || (category === OTHER_CATEGORY ? !d.category || d.category === OTHER_CATEGORY : d.category === category));
  }, [device?.designs, server?.designs, category]);
  const list = designs.filter((d) => d.image_url).slice(0, shown);
  const more = designs.length > shown || Boolean(!device?.designs && server?.more);

  const chip = (on: boolean) =>
    `shrink-0 h-10 px-4 rounded-md text-sm font-medium text-on-surface transition ${on ? "bg-accent-gold/70 ring-2 ring-accent-gold" : "bg-accent-gold/30 hover:bg-accent-gold/45"}`;

  return (
    <div className="flex flex-col gap-2">
      {cats.length > 0 && (
        <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar pb-1">
          <button type="button" className={chip(!category)} onClick={() => { setCategory(""); setShown(PAGE); }}>
            {t("shop.customReg.galleryAll")}
          </button>
          {cats.map((c) => (
            <button key={c.slug} type="button" className={chip(category === c.slug)} onClick={() => { setCategory(c.slug); setShown(PAGE); }}>
              {categoryName(c, locale)}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-text-muted bg-surface-subtle rounded-md p-3">{t("shop.customReg.galleryEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
          {list.map((d) => {
            const on = picked.has(d.id);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onToggle(d)}
                  title={d.title || d.caption || ""}
                  className={`relative w-full aspect-square rounded-md border overflow-hidden bg-surface-subtle transition active:scale-[0.98] ${on ? "border-accent-gold ring-2 ring-accent-gold" : "border-border-light hover:border-accent-gold"}`}
                >
                  <img src={d.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  {(d.title || d.caption) && (
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[11px] leading-tight px-1.5 py-1 truncate text-left">{d.title || d.caption}</span>
                  )}
                  {on && <CheckCircle2 className="absolute top-1 right-1 w-5 h-5 text-accent-gold bg-surface-card rounded-full" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {more && designs.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-10 px-4 rounded-md border border-border-light bg-surface-card text-sm font-semibold text-on-surface hover:border-accent-gold">
            {t("shop.customReg.galleryMore")}
          </button>
        )}
        <button type="button" onClick={onMore} className="h-10 px-4 rounded-md border border-dashed border-accent-gold/60 text-sm font-semibold text-accent-gold hover:bg-accent-gold/10 inline-flex items-center gap-1.5">
          <Images className="w-4 h-4" /> {t("shop.customReg.gallerySearch")}
        </button>
      </div>
    </div>
  );
}
