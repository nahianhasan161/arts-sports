import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
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
  const tab = (on: boolean) => `shrink-0 h-9 px-4 rounded-full border text-xs font-semibold inline-flex items-center ${on ? "border-primary bg-primary text-primary-foreground" : "border-border-light bg-surface-card text-on-surface"}`;
  return (
    <div className="max-w-container-max mx-auto px-space-base py-space-xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-space-lg">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl uppercase font-bold text-primary mb-2">{t("customJersey.gallery.title")}</h1>
          <p className="text-sm text-text-muted">{t("customJersey.gallery.subtitle")}</p>
        </div>
        <Link href="/custom-jersey" className="h-10 px-5 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center">
          {t("customJersey.gallery.cta")}
        </Link>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-2 mb-space-base" aria-label={t("customJersey.gallery.title")}>
        <Link href="/custom-jersey/gallery" className={tab(!category)}>{t("customJersey.gallery.categories.all")}</Link>
        {categories.map((k) => (
          <Link key={k.slug} href={`/custom-jersey/gallery?c=${k.slug}`} className={tab(category === k.slug)}>{categoryName(k, locale)}</Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-16 text-center">{t("customJersey.gallery.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((item) => (
            <li key={item.id} className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt={item.title ?? item.caption ?? t("customJersey.title")} loading="lazy" className="w-full aspect-square object-cover" />
              {designImages(item).length > 1 && (
                <div className="flex gap-1 px-2.5 pt-2 overflow-x-auto no-scrollbar">
                  {designImages(item).slice(1).map((src) => (
                    <a key={src} href={src} target="_blank" rel="noopener" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" loading="lazy" className="w-12 h-12 rounded object-cover border border-border-light" />
                    </a>
                  ))}
                </div>
              )}
              <div className="p-2.5 flex flex-col gap-2">
                {item.title && <p className="text-sm font-semibold">{item.title}</p>}
                {item.caption && <p className="text-xs text-text-muted">{item.caption}</p>}
                <Link href={`/custom-jersey?design=${item.id}`} className="h-8 rounded-lg border border-primary text-primary text-xs font-semibold inline-flex items-center justify-center hover:bg-primary/10">
                  {t("customJersey.gallery.useThis")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
