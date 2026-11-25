"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AllIcon, ChipIcon } from "@/components/ui/ChipIcon";
import { useT } from "@/i18n/client";

type Cat = { id: string; slug: string; name: string; name_bn?: string | null };

/** Horizontally scrolling category chips: the shop's one category filter. */
export function CategoryStrip({ items, active, onSelect }: { items: Cat[]; active: string; onSelect: (slug: string) => void }) {
  const { t, locale } = useT();
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  const chip = (slug: string, label: string, name = label) => (
    <button
      key={slug}
      onClick={() => onSelect(slug)}
      aria-pressed={active === slug}
      className={`sp-chip ${active === slug ? "sp-on" : ""} min-h-11 inline-flex items-center gap-1.5 text-xs font-display uppercase tracking-wider font-semibold whitespace-nowrap shrink-0`}
    >
      {slug === "all" ? <AllIcon /> : <ChipIcon of={[slug, name]} />}
      {label}
    </button>
  );

  return (
    <div className="relative flex items-center gap-1 pt-2">
      <button onClick={() => nudge(-1)} aria-label={t("store.shop.ui.scrollLeft")} className="sp-ico sp-tennis sp-sm hidden md:flex shrink-0">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div ref={scroller} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth snap-x py-1 flex-1 min-w-0">
        {chip("all", t("store.shop.ui.all"))}
        {items.map((c) => chip(c.slug, (locale === "bn" && c.name_bn) || c.name, c.name))}
      </div>
      <button onClick={() => nudge(1)} aria-label={t("store.shop.ui.scrollRight")} className="sp-ico sp-tennis sp-sm hidden md:flex shrink-0">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
