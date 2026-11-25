import type { Metadata } from "next";
import Link from "next/link";
import { Shirt } from "lucide-react";
import { cookies } from "next/headers";
import { AllIcon, ChipIcon } from "@/components/ui/ChipIcon";
import { SportCard } from "@/components/product/SportCard";
import { assignFrames } from "@/lib/sport-frames";
import { getT, resolveLocale, LOCALE_COOKIE } from "@/i18n";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { categoryName, designImages, type DesignRow } from "@/lib/custom-jersey/designs";
import { listDesigns, loadDesignCategories } from "@/lib/custom-jersey/designs-server";

export const metadata: Metadata = {
  title: "Custom jerseys we made",
  description: "Photos of custom team jerseys made by Arts Sports.",
  alternates: { canonical: "/custom-jersey/gallery" },
};

export const dynamic = "force-dynamic";

export default async function CustomGalleryPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = getT(locale);
  const c = (await searchParams).c;
  const db = isServiceSupabaseConfigured() ? getServiceSupabase() : null;
  const categories = db ? await loadDesignCategories(db) : [];
  const category = categories.find((x) => x.slug === c)?.slug;
  const items: DesignRow[] = db ? (await listDesigns(db, { category, limit: 60 })).designs : [];
  const names = new Map(categories.map((k) => [k.slug, `${k.name_en} ${k.name_bn ?? ""}`]));
  const frames = assignFrames(items.map((d) => [d.category, names.get(d.category ?? ""), d.title, d.caption].filter(Boolean).join(" ")));
  const tab = (on: boolean) => `sp-chip ${on ? "sp-on" : ""} shrink-0 h-9 text-xs font-semibold inline-flex items-center gap-1.5`;
  return (
    <div className="max-w-container-max mx-auto px-space-base py-space-xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-space-lg">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl uppercase font-bold text-primary mb-2">{t("customJersey.gallery.title")}</h1>
          <p className="text-sm text-text-muted">{t("customJersey.gallery.subtitle")}</p>
        </div>
        <Link href="/custom-jersey" className="sp-btn sp-jersey h-10 text-xs font-bold uppercase tracking-wider inline-flex items-center">
          {t("customJersey.gallery.cta")}
        </Link>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-2 mb-space-base" aria-label={t("customJersey.gallery.title")}>
        <Link href="/custom-jersey/gallery" className={tab(!category)}><AllIcon />{t("customJersey.gallery.categories.all")}</Link>
        {categories.map((k) => (
          <Link key={k.slug} href={`/custom-jersey/gallery?c=${k.slug}`} className={tab(category === k.slug)}><ChipIcon of={[k.slug, k.name_en, k.name_bn]} fallback={Shirt} />{categoryName(k, locale)}</Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-16 text-center">{t("customJersey.gallery.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 pt-4">
          {items.map((item, i) => (
            <li key={item.id}>
              <SportCard
                frame={frames[i]}
                media={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.title ?? item.caption ?? t("customJersey.title")} loading="lazy" className="w-full aspect-square object-cover" />
                }
              >
                {designImages(item).length > 1 && (
                  <div className="flex gap-1 pb-2 overflow-x-auto no-scrollbar">
                    {designImages(item).slice(1).map((src) => (
                      <a key={src} href={src} target="_blank" rel="noopener" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" loading="lazy" className="w-12 h-12 rounded object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex-1 flex flex-col gap-2">
                  {item.title && <p className="text-sm font-semibold">{item.title}</p>}
                  {item.caption && <p className="text-xs text-text-muted">{item.caption}</p>}
                  <Link href={`/custom-jersey?design=${item.id}`} className="sp-btn sp-jersey mt-auto min-h-9 py-1 text-xs font-semibold text-center inline-flex items-center justify-center">
                    {t("customJersey.gallery.useThis")}
                  </Link>
                </div>
              </SportCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
