"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Images, Sparkles, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { categoryName, designImages, OTHER_CATEGORY, type DesignCategoryRow, type DesignRow } from "@/lib/custom-jersey/designs";

/**
 * Storefront design catalogue: cards that open a photo viewer with an
 * "Order this design" button. Used on the home page, /custom-jersey and
 * /custom-jersey/gallery.
 */

export const orderHref = (id: string) => `/custom-jersey?design=${encodeURIComponent(id)}#order`;

type Cat = Pick<DesignCategoryRow, "slug" | "name_en" | "name_bn">;

function useCategoryLabel(categories: Cat[]) {
  const { locale } = useT();
  return useCallback(
    (slug: string | null) => {
      const c = slug ? categories.find((x) => x.slug === slug) : undefined;
      return c ? categoryName(c, locale) : null;
    },
    [categories, locale]
  );
}

export function DesignCard({ design, categoryLabel, onOpen, priority }: { design: DesignRow; categoryLabel: string | null; onOpen: () => void; priority?: boolean }) {
  const { t } = useT();
  const count = designImages(design).length;
  const title = design.title || design.caption || t("customJersey.title");
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-surface-container border border-border-light shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={title}>
        <div className="relative aspect-[4/5] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={design.image_url}
            alt={title}
            loading={priority ? "eager" : "lazy"}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2">
            {categoryLabel ? (
              <span className="px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-white text-[10px] font-semibold uppercase tracking-wider">
                {categoryLabel}
              </span>
            ) : (
              <span />
            )}
            {count > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-white text-[10px] font-semibold">
                <Images className="w-3 h-3" />
                {count}
              </span>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="font-display uppercase text-white text-sm sm:text-base font-bold leading-tight line-clamp-2 drop-shadow">{title}</p>
          </div>
        </div>
      </button>
      <Link
        href={orderHref(design.id)}
        className="flex items-center justify-between gap-2 px-3 h-11 bg-surface-card text-on-surface text-xs font-bold uppercase tracking-wider border-t border-border-light group-hover:bg-accent-gold group-hover:text-white transition-colors"
      >
        <span className="truncate">{t("home.catalogue.use")}</span>
        <ArrowRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}

export function DesignViewer({ design, categoryLabel, onClose }: { design: DesignRow; categoryLabel: string | null; onClose: () => void }) {
  const { t } = useT();
  const images = designImages(design);
  const [index, setIndex] = useState(0);
  const go = useCallback((step: number) => setIndex((i) => (i + step + images.length) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  const title = design.title || design.caption || t("customJersey.title");
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label={t("home.gallery.close")} />
      <div className="relative w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto bg-surface-card rounded-t-2xl sm:rounded-2xl shadow-2xl grid md:grid-cols-[1.25fr_1fr] as-rise">
        <div className="relative bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[index]} alt={title} className="w-full aspect-square md:aspect-auto md:h-full max-h-[60vh] md:max-h-[80vh] object-contain" />
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={t("home.gallery.prev")} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-neutral-900 flex items-center justify-center shadow hover:bg-white">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t("home.gallery.next")} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-neutral-900 flex items-center justify-center shadow hover:bg-white">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-semibold">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </div>
        <div className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              {categoryLabel && <span className="text-[11px] font-bold uppercase tracking-widest text-accent-gold">{categoryLabel}</span>}
              <h2 className="font-display uppercase text-2xl font-bold text-on-surface leading-tight">{title}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label={t("home.gallery.close")} className="shrink-0 w-9 h-9 rounded-full bg-surface-subtle hover:bg-surface-container flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          {design.caption && design.title && <p className="text-sm text-on-surface-variant">{design.caption}</p>}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`${i + 1}`}
                  className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${i === index ? "border-accent-gold" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <p className="flex items-start gap-2 text-sm text-on-surface-variant bg-accent-gold/10 border border-accent-gold/25 rounded-xl p-3">
            <Sparkles className="w-4 h-4 text-accent-gold shrink-0 mt-0.5" />
            {t("home.gallery.customise")}
          </p>
          <div className="mt-auto flex flex-col gap-2">
            <Link
              href={orderHref(design.id)}
              onClick={onClose}
              className="h-12 rounded-xl bg-accent-gold text-white font-display uppercase tracking-wider text-sm font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 transition"
            >
              {t("home.catalogue.use")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A grid of design cards. With `tabs`, the category chips filter the designs
 * already loaded (home page / landing); the full catalogue page filters on
 * the server instead and passes `tabs={false}`.
 */
export function DesignGrid({
  designs,
  categories,
  tabs = false,
  limit,
  className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4",
}: {
  designs: DesignRow[];
  categories: Cat[];
  tabs?: boolean;
  limit?: number;
  className?: string;
}) {
  const { t } = useT();
  const label = useCategoryLabel(categories);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<DesignRow | null>(null);

  // Only offer chips for categories that have a design in this set.
  const used = useMemo(() => {
    const slugs = new Set(designs.map((d) => d.category || OTHER_CATEGORY));
    return categories.filter((c) => slugs.has(c.slug));
  }, [designs, categories]);

  const shown = useMemo(() => {
    const list = active ? designs.filter((d) => (d.category || OTHER_CATEGORY) === active) : designs;
    return limit ? list.slice(0, limit) : list;
  }, [designs, active, limit]);

  const chip = (on: boolean) =>
    `shrink-0 h-9 px-4 rounded-full text-xs font-bold uppercase tracking-wider transition-colors border ${
      on ? "bg-primary text-primary-foreground border-primary" : "bg-surface-card text-on-surface-variant border-border-light hover:border-primary hover:text-on-surface"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {tabs && used.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
          <button type="button" className={chip(active === null)} onClick={() => setActive(null)}>
            {t("home.catalogue.all")}
          </button>
          {used.map((c) => (
            <button key={c.slug} type="button" className={chip(active === c.slug)} onClick={() => setActive(c.slug)}>
              {label(c.slug)}
            </button>
          ))}
        </div>
      )}
      <ul className={className}>
        {shown.map((d, i) => (
          <li key={d.id}>
            <DesignCard design={d} categoryLabel={label(d.category)} onOpen={() => setOpen(d)} priority={i < 4} />
          </li>
        ))}
      </ul>
      {open && <DesignViewer design={open} categoryLabel={label(open.category)} onClose={() => setOpen(null)} />}
    </div>
  );
}
