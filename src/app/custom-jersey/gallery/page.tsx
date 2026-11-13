import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getT, resolveLocale, LOCALE_COOKIE } from "@/i18n";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Custom jerseys we made",
  description: "Photos of custom team jerseys made by Arts Sports.",
  alternates: { canonical: "/custom-jersey/gallery" },
};

export const dynamic = "force-dynamic";

interface Item {
  id: string;
  image_url: string;
  caption: string | null;
}

async function loadGallery(): Promise<Item[]> {
  if (!isServiceSupabaseConfigured()) return [];
  const { data, error } = await getServiceSupabase()
    .from("custom_gallery")
    .select("id, image_url, caption")
    .eq("is_published", true)
    .order("display_order")
    .order("created_at", { ascending: false })
    .limit(60);
  return error ? [] : ((data ?? []) as Item[]);
}

export default async function CustomGalleryPage() {
  const t = getT(resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value));
  const items = await loadGallery();
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
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-16 text-center">{t("customJersey.gallery.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((item) => (
            <li key={item.id} className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt={item.caption ?? t("customJersey.title")} loading="lazy" className="w-full aspect-square object-cover" />
              {item.caption && <p className="text-xs p-2.5">{item.caption}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
