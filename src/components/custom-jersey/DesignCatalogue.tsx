"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HoverLink as Link } from "@/components/ui/HoverLink";
import { ArrowRight, ChevronLeft, ChevronRight, Images, Shirt, Sparkles, X } from "lucide-react";
import { AllIcon, ChipIcon } from "@/components/ui/ChipIcon";
import { SportCard } from "@/components/product/SportCard";
import { frameFor, type SportFrame } from "@/lib/sport-frames";
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

export function DesignCard({ design, categoryLabel, frame, onOpen, priority }: { design: DesignRow; frame: SportFrame; categoryLabel: string | null; onOpen: () => void; priority?: boolean }) {
  const { t } = useT();
  const count = designImages(design).length;
  const title = design.title || design.caption || t("customJersey.title");
  return (
    <SportCard
      frame={frame}
      media={
        <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={title}>
          <div className="relative aspect-[4/5] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={design.image_url}
              alt={title}
              loading={priority ? "eager" : "lazy"}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
            <div className="absolute top-1.5 inset-x-1.5 sm:top-2.5 sm:inset-x-2.5 flex items-start justify-between gap-1">
              {categoryLabel ? (
                <span className="min-w-0 truncate px-1.5 sm:px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-white text-xs font-semibold uppercase sm:tracking-wider">
                  {categoryLabel}
                </span>
              ) : (
                <span />
              )}
              {count > 1 && (
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-white text-xs font-semibold">
                  <Images className="w-3 h-3" />
                  {count}
                </span>
              )}
            </div>
          </div>
        </button>
      }
    >
      <p className="min-h-[2.5em] font-display uppercase text-sm sm:text-base font-bold leading-tight line-clamp-2">{title}</p>
      <Link
        href={orderHref(design.id)}
        className="sp-btn sp-jersey max-sm:!px-[1.8em] mt-auto flex items-center justify-between gap-2 h-11 text-xs font-bold uppercase sm:tracking-wider"
      >
        <span className="min-w-0 flex-1 text-center leading-tight">{t("home.catalogue.use")}</span>
        <ArrowRight className="hidden sm:block w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </SportCard>
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
              <button type="button" onClick={() => go(-1)} aria-label={t("home.gallery.prev")} className="sp-ico sp-football sp-lg absolute left-2 top-1/2 -translate-y-1/2">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t("home.gallery.next")} className="sp-ico sp-football sp-lg absolute right-2 top-1/2 -translate-y-1/2">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-semibold">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </div>
        <div className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              {categoryLabel && <span className="text-xs font-bold uppercase tracking-widest text-gold-ink">{categoryLabel}</span>}
              <h2 className="font-display uppercase text-2xl font-bold text-on-surface leading-tight">{title}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label={t("home.gallery.close")} className="sp-ico sp-red shrink-0">
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
            <Sparkles className="w-4 h-4 text-gold-ink shrink-0 mt-0.5" />
            {t("home.gallery.customise")}
          </p>
          <div className="mt-auto flex flex-col gap-2">
            <Link
              href={orderHref(design.id)}
              onClick={onClose}
              className="sp-btn sp-jersey h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center justify-center gap-2"
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
  className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 pt-4",
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

  const frames = useMemo(
    () => shown.map((d) => frameFor([d.category, label(d.category), d.title, d.caption].filter(Boolean).join(" "))),
    [shown, label]
  );

  const chip = (on: boolean) =>
    `sp-chip ${on ? "sp-on" : ""} shrink-0 h-9 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider`;

  return (
    <div className="flex flex-col gap-4">
      {tabs && used.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
          <button type="button" className={chip(active === null)} onClick={() => setActive(null)}>
            <AllIcon />
            {t("home.catalogue.all")}
          </button>
          {used.map((c) => (
            <button key={c.slug} type="button" className={chip(active === c.slug)} onClick={() => setActive(c.slug)}>
              <ChipIcon of={[c.slug, c.name_en, c.name_bn]} fallback={Shirt} />
              {label(c.slug)}
            </button>
          ))}
        </div>
      )}
      <ul className={className}>
        {shown.map((d, i) => (
          <li key={d.id}>
            <DesignCard design={d} frame={frames[i]} categoryLabel={label(d.category)} onOpen={() => setOpen(d)} priority={!tabs && i < 4} />
          </li>
        ))}
      </ul>
      {open && <DesignViewer design={open} categoryLabel={label(open.category)} onClose={() => setOpen(null)} />}
    </div>
  );
}
