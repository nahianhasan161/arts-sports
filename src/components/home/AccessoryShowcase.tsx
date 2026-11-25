"use client";

import { useMemo, useState } from "react";
import { HoverLink as Link } from "@/components/ui/HoverLink";
import Image from "next/image";
import { ArrowRight, Backpack, Images, Medal } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { thumbUrl } from "@/lib/media/thumb";
import { useLiveBadges } from "@/lib/promotions/useLiveBadges";
import type { AccessoryItem, AccessoryShowcaseData, AccessorySport } from "@/lib/services/accessories";
import { frameFor, type SportFrame } from "@/lib/sport-frames";
import { SportCard } from "@/components/product/SportCard";
import { AllIcon, ChipIcon } from "@/components/ui/ChipIcon";
import { SectionHeading } from "./HomeSections";

/** Accessories with a tab per sport. Each card wears a frame from its sport (`SportCard`). */

const LIMIT = 8;

/** One from each sport in turn, so the "all" tab shows a mix. */
function mixSports(items: AccessoryItem[]): AccessoryItem[] {
  const groups = new Map<string, AccessoryItem[]>();
  for (const item of items) {
    const key = item.sport_id ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const lists = [...groups.values()];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  return Array.from({ length: longest }, (_, i) => lists.flatMap((l) => l[i] ?? [])).flat();
}

function AccessoryCard({ item, sport, frame, price, was }: { item: AccessoryItem; sport: string | null; frame: SportFrame; price: number; was: number }) {
  const { t, locale } = useT();
  const [thumbFailed, setThumbFailed] = useState(false);
  const title = (locale === "bn" && item.title_bn) || item.title;
  const image = item.images?.[0];
  const soldOut = item.stock <= 0;
  return (
    <Link
      href={`/products/${item.slug}`}
      className="block h-full rounded-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <SportCard
        frame={frame}
        media={
          <div className="relative aspect-square sm:aspect-[4/5]">
            {image ? (
              <Image
                src={thumbFailed ? image : thumbUrl(image)}
                onError={() => setThumbFailed(true)}
                alt={title}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className={`object-cover ${soldOut ? "grayscale" : ""}`}
              />
            ) : (
              <Backpack className="absolute inset-0 m-auto w-12 h-12 text-text-muted" />
            )}
            <div className="absolute top-1.5 inset-x-1.5 sm:top-2 sm:inset-x-2 flex items-start justify-between gap-1">
              {sport ? (
                <span className="min-w-0 truncate px-1.5 sm:px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-semibold uppercase sm:tracking-wider">{sport}</span>
              ) : (
                <span />
              )}
              {soldOut ? (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-badge-discount text-white text-xs font-semibold">{t("home.accessories.soldOut")}</span>
              ) : (
                item.images?.length > 1 && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-white text-xs font-semibold">
                    <Images className="w-3 h-3" />
                    {item.images.length}
                  </span>
                )
              )}
            </div>
          </div>
        }
      >
        <p className="min-h-[2.5em] font-display uppercase text-sm sm:text-base font-bold leading-tight line-clamp-2">{title}</p>
        <div className="mt-auto pt-1.5 flex items-center justify-between gap-2">
          <span className="flex flex-wrap items-baseline gap-x-2 min-w-0">
            <span className="as-sc-price font-display font-bold text-lg sm:text-xl leading-tight tabular-nums">{formatMoney(price, locale)}</span>
            {was > price && <span className="text-xs line-through tabular-nums">{formatMoney(was, locale)}</span>}
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </SportCard>
    </Link>
  );
}

export function AccessoryShowcase({ data }: { data: AccessoryShowcaseData }) {
  const { t, locale } = useT();
  const [active, setActive] = useState<string | null>(null);
  const name = (s: AccessorySport) => (locale === "bn" && s.name_bn) || s.name;

  // Only offer tabs for sports that have a product.
  const sports = useMemo(() => data.sports.filter((s) => data.items.some((i) => i.sport_id === s.id)), [data]);
  const shown = useMemo(
    () => (active ? data.items.filter((i) => i.sport_id === active) : mixSports(data.items)).slice(0, LIMIT),
    [data, active]
  );
  const ids = useMemo(() => data.items.map((i) => i.id), [data]);
  const frames = useMemo(() => {
    const words = new Map(data.sports.map((s) => [s.id, [s.slug, s.name, s.name_bn].filter(Boolean).join(" ")]));
    return shown.map((i) => frameFor(`${words.get(i.sport_id ?? "") ?? ""} ${i.title}`));
  }, [data, shown]);
  const live = useLiveBadges(ids);
  const activeSport = sports.find((s) => s.id === active);

  const chip = (on: boolean) =>
    `sp-chip ${on ? "sp-on" : ""} shrink-0 h-9 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider`;
  const href = `/shop?category=${encodeURIComponent(data.categorySlug)}${activeSport ? `&sub=${encodeURIComponent(activeSport.name)}` : ""}`;

  return (
    <section id="accessories" className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full scroll-mt-20">
      <SectionHeading
        eyebrow={t("home.accessories.eyebrow")}
        title={t("home.accessories.title")}
        text={t("home.accessories.text")}
        action={
          <Link href={href} className="sp-btn sp-bat self-start sm:self-auto shrink-0 h-11 font-display uppercase tracking-wider text-xs font-bold inline-flex items-center gap-2">
            {t("home.accessories.viewAll")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        }
      />
      {sports.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5 mb-4">
          <button type="button" aria-pressed={active === null} className={chip(active === null)} onClick={() => setActive(null)}>
            <AllIcon />
            {t("home.accessories.all")}
          </button>
          {sports.map((s) => (
            <button key={s.id} type="button" aria-pressed={active === s.id} className={chip(active === s.id)} onClick={() => setActive(s.id)}>
              <ChipIcon of={[s.slug, s.name, s.name_bn]} fallback={Medal} />
              {name(s)}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7 sm:gap-x-6 sm:gap-y-9 pt-4 pb-2">
        {shown.map((item, i) => {
          const sport = data.sports.find((s) => s.id === item.sport_id);
          const price = live[item.id]?.final_price ?? item.price;
          return (
            <li key={item.id}>
              <AccessoryCard
                item={item}
                frame={frames[i]}
                sport={sport ? name(sport) : null}
                price={price}
                was={Math.max(live[item.id]?.base_price ?? 0, item.original_price ?? 0)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
