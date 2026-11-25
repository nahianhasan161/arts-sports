"use client";

import { HoverLink as Link } from "@/components/ui/HoverLink";
import {
  ArrowRight,
  BadgeCheck,
  Brush,
  FileSpreadsheet,
  Headphones,
  MapPin,
  MessageCircle,
  Palette,
  Percent,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney, type MessageKey } from "@/i18n";
import { Ball } from "@/components/football/Ball";
import { FootballScene, Stadium } from "@/components/football/FootballScene";
import { TeamScene } from "@/components/football/TeamScene";
import { BatCard } from "@/components/home/BatCard";
import { CategoryTile, type CategoryObject } from "@/components/home/CategoryTile";
import { StepsPitch } from "@/components/home/StepsPitch";
import { BadmintonArt, BasketballArt, UmpireOutArt, UmpireSixArt } from "@/components/home/PerkArt";
import { DesignGrid } from "@/components/custom-jersey/DesignCatalogue";
import { type DesignCategoryRow, type DesignRow } from "@/lib/custom-jersey/designs";

export function whatsappHref(): string | null {
  const raw = (process.env.NEXT_PUBLIC_STORE_WHATSAPP ?? "").replace(/\D/g, "");
  if (!raw) return null;
  const intl = raw.startsWith("880") ? raw : raw.startsWith("0") ? `88${raw}` : raw;
  return `https://wa.me/${intl}`;
}

export function SectionHeading({ eyebrow, title, text, align = "left", action }: { eyebrow: string; title: string; text?: string; align?: "left" | "center"; action?: React.ReactNode }) {
  const center = align === "center";
  return (
    <div className={`flex flex-col gap-3 mb-6 sm:mb-8 ${center ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"}`}>
      <div className={`flex flex-col gap-2 ${center ? "items-center max-w-2xl" : "max-w-2xl"}`}>
        <span className="inline-flex items-center gap-2 text-accent-gold font-display text-xs uppercase tracking-[0.2em] font-bold">
          <Ball className="w-4 h-4" />
          {eyebrow}
        </span>
        <h2 className="font-display uppercase font-bold text-on-surface text-3xl sm:text-4xl leading-[1.05] tracking-tight">{title}</h2>
        {text && <p className="text-sm sm:text-base text-on-surface-variant">{text}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Hero */

export function HomeHero({ startPrice }: { startPrice: number | null }) {
  const { t, locale } = useT();
  return (
    <section className="relative overflow-hidden bg-primary-container text-white">
      <Stadium />

      <div className="relative max-w-container-max mx-auto px-4 sm:px-6 pt-10 pb-14 sm:pt-14 sm:pb-16 grid lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-10 items-center">
        <div className="flex flex-col gap-5 as-rise">
          <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-accent-gold" />
            {t("home.hero.eyebrow")}
          </span>
          <h1 className="font-display uppercase font-bold leading-[0.95] tracking-tight text-5xl sm:text-6xl xl:text-7xl">
            <span className="block">{t("home.hero.title1")}</span>
            <span className="block text-accent-gold">{t("home.hero.title2")}</span>
          </h1>
          <p className="text-base sm:text-lg text-white/80 max-w-xl">{t("home.hero.text")}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/custom-jersey#order"
              className="sp-btn sp-jersey h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2"
            >
              <Palette className="w-5 h-5" />
              {t("home.hero.ctaCustom")}
            </Link>
            <Link
              href="/custom-jersey/gallery"
              className="sp-btn sp-ticket h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2"
            >
              {t("home.hero.ctaCatalogue")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75">
            {startPrice !== null && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                <BadgeCheck className="w-4 h-4 text-accent-gold" />
                {t("home.hero.from", { price: formatMoney(startPrice, locale) })}
              </span>
            )}
            <Link href="/shop" className="inline-flex items-center gap-1 underline-offset-4 hover:underline hover:text-white">
              {t("home.hero.ctaShop")}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <FootballScene className="max-w-xl lg:max-w-none mx-auto" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Marquee */

export function SportsMarquee() {
  const { t } = useT();
  const words = t("home.marquee").split("·").map((w) => w.trim()).filter(Boolean);
  const row = [...words, ...words];
  return (
    <div className="bg-accent-gold text-white overflow-hidden py-3 select-none" aria-hidden>
      <div className="flex w-max as-marquee">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0">
            {row.map((w, i) => (
              <span key={`${copy}-${i}`} className="font-display uppercase font-bold tracking-widest text-sm sm:text-base px-5 inline-flex items-center gap-5">
                {w}
                <span className="w-1.5 h-1.5 rotate-45 bg-white/70" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Perks */

export function Perks() {
  const { t } = useT();
  const items: { art: typeof UmpireOutArt; title: MessageKey; sub: MessageKey }[] = [
    { art: UmpireOutArt, title: "home.perks.minimum", sub: "home.perks.minimumSub" },
    { art: UmpireSixArt, title: "home.perks.days", sub: "home.perks.daysSub" },
    { art: BadmintonArt, title: "home.perks.delivery", sub: "home.perks.deliverySub" },
    { art: BasketballArt, title: "home.perks.pay", sub: "home.perks.paySub" },
  ];
  return (
    <div className="relative z-10 w-full max-w-container-max mx-auto px-4 sm:px-6 -mt-14 md:-mt-10">
      <BatCard>
        <ul className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border-light pl-4 pr-5 md:px-0 md:py-4">
          {items.map(({ art: Art, title, sub }) => (
            <li key={title} className="group flex items-center gap-3 py-3.5 md:flex-col md:text-center md:gap-2 md:px-2 md:py-2 xl:flex-row xl:text-left xl:gap-2.5 xl:px-3 xl:py-3">
              <span className="shrink-0 w-12 h-12 md:w-14 md:h-14 xl:w-16 xl:h-16 rounded-2xl bg-white/60 flex items-center justify-center">
                <Art className="w-10 h-10 md:w-12 md:h-12 xl:w-14 xl:h-14 overflow-visible" />
              </span>
              <span className="min-w-0">
                <span className="block font-display uppercase font-bold text-on-surface text-sm xl:text-base leading-tight [text-wrap:balance]">{t(title)}</span>
                <span className="block text-xs text-text-muted">{t(sub)}</span>
              </span>
            </li>
          ))}
        </ul>
      </BatCard>
    </div>
  );
}

/* ---------------------------------------------------------- Categories */

/* Photos in public/images/categories (800x1000). Replace a file to change its tile. */
export function ShopCategories({ accessoriesHref = "/shop" }: { accessoriesHref?: string }) {
  const { t } = useT();
  const tiles: { href: string; title: MessageKey; sub: MessageKey; kind: CategoryObject; button: string; image: string }[] = [
    { href: "/custom-jersey", title: "home.categories.custom", sub: "home.categories.customSub", kind: "board", button: "sp-jersey", image: "custom" },
    { href: "/shop?category=jersey", title: "home.categories.jerseys", sub: "home.categories.jerseysSub", kind: "goal", button: "sp-football", image: "jersey" },
    { href: "/shop?category=t-shirt", title: "home.categories.sportswear", sub: "home.categories.sportswearSub", kind: "track", button: "sp-dumbbell", image: "sportswear" },
    { href: accessoriesHref, title: "home.categories.accessories", sub: "home.categories.accessoriesSub", kind: "bag", button: "sp-bat", image: "accessories" },
  ];
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-20 w-full">
      <SectionHeading eyebrow={t("home.categories.eyebrow")} title={t("home.categories.title")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 sm:gap-x-5 gap-y-12 pt-8">
        {tiles.map(({ href, title, sub, kind, button, image }) => (
          <CategoryTile
            key={title}
            kind={kind}
            href={href}
            image={`/images/categories/${image}.webp`}
            title={t(title)}
            sub={t(sub)}
            action={<span className={`sp-btn ${button} inline-flex items-center justify-center h-9 text-[11px] sm:text-xs font-bold whitespace-nowrap`}>{t("home.categories.shopNow")}</span>}
          />
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Design catalogue */

export function CatalogueShowcase({ designs, categories }: { designs: DesignRow[]; categories: DesignCategoryRow[] }) {
  const { t } = useT();
  return (
    <section className="relative w-full mt-16 sm:mt-24 py-14 sm:py-20 bg-surface-subtle border-y border-border-light">
      <div className="max-w-container-max mx-auto px-4 sm:px-6 flex flex-col gap-8">
        <SectionHeading
          eyebrow={t("home.catalogue.eyebrow")}
          title={t("home.catalogue.title")}
          text={t("home.catalogue.text")}
          action={
            <Link href="/custom-jersey/gallery" className="sp-btn sp-goal self-start sm:self-auto shrink-0 h-11 font-display uppercase tracking-wider text-xs font-bold inline-flex items-center gap-2">
              {t("home.catalogue.viewAll")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          }
        />
        {/* One or two cards look unfinished; the banner carries the section until there are more. */}
        {designs.length >= 3 ? (
          <DesignGrid designs={designs} categories={categories} tabs limit={8} />
        ) : categories.length === 0 ? (
          <p className="text-sm text-text-muted text-center">{t("home.catalogue.empty")}</p>
        ) : null}
        <OwnIdeaBanner />
      </div>
    </section>
  );
}

export function OwnIdeaBanner() {
  const { t } = useT();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between rounded-2xl border-2 border-dashed border-accent-gold/50 bg-accent-gold/5 p-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-11 h-11 rounded-xl bg-accent-gold text-white flex items-center justify-center">
          <Brush className="w-5 h-5" />
        </span>
        <div>
          <p className="font-display uppercase font-bold text-on-surface text-lg leading-tight">{t("home.gallery.ownIdea")}</p>
          <p className="text-sm text-on-surface-variant">{t("home.gallery.ownIdeaText")}</p>
        </div>
      </div>
      <Link href="/custom-jersey#order" className="sp-btn sp-racket shrink-0 h-11 font-display uppercase tracking-wider text-xs font-bold inline-flex items-center justify-center gap-2">
        <Upload className="w-4 h-4" />
        {t("home.gallery.upload")}
      </Link>
    </div>
  );
}

/* --------------------------------------------------------- How it works */

const STEPS: MessageKey[] = ["customJersey.steps.one", "customJersey.steps.two", "customJersey.steps.three", "customJersey.steps.four"];

export function HowItWorks({ advancePercent, compact = false }: { advancePercent: number; compact?: boolean }) {
  const { t } = useT();
  const pitch = <StepsPitch steps={STEPS} percent={advancePercent} />;
  if (compact) return pitch;
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
      <SectionHeading eyebrow={t("home.how.eyebrow")} title={t("home.how.title")} align="center" />
      {pitch}
    </section>
  );
}

/* ----------------------------------------------------------- Team band */

export function TeamBand() {
  const { t } = useT();
  const wa = whatsappHref();
  const points: { icon: typeof Percent; key: MessageKey }[] = [
    { icon: Percent, key: "home.team.point1" },
    { icon: FileSpreadsheet, key: "home.team.point2" },
    { icon: Palette, key: "home.team.point3" },
  ];
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
      <div className="relative overflow-hidden rounded-3xl bg-primary-container text-white p-6 sm:p-10 lg:p-14 grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center">
        <div className="absolute inset-0 as-pitch-lines" aria-hidden />
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-accent-gold/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-accent-gold">{t("home.team.eyebrow")}</span>
          <h2 className="font-display uppercase font-bold text-3xl sm:text-5xl leading-[1]">{t("home.team.title")}</h2>
          <p className="text-white/80 max-w-xl">{t("home.team.text")}</p>
          <ul className="flex flex-wrap gap-2">
            {points.map(({ icon: Icon, key }) => (
              <li key={key} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold">
                <Icon className="w-3.5 h-3.5 text-accent-gold" />
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/custom-jersey#order" className="sp-btn sp-armband h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t("home.team.cta")}
            </Link>
            {wa && (
              <a href={wa} target="_blank" rel="noopener" className="sp-btn sp-tennis sp-wa h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                {t("home.team.whatsapp")}
              </a>
            )}
          </div>
        </div>
        <TeamScene />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Why us */

export function WhyUs() {
  const { t } = useT();
  const items: { icon: typeof Sparkles; title: MessageKey; sub: MessageKey }[] = [
    { icon: Sparkles, title: "home.why.quality", sub: "home.why.qualitySub" },
    { icon: Brush, title: "home.why.design", sub: "home.why.designSub" },
    { icon: MapPin, title: "home.why.track", sub: "home.why.trackSub" },
    { icon: Headphones, title: "home.why.support", sub: "home.why.supportSub" },
  ];
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
      <h2 className="font-display uppercase font-bold text-on-surface text-2xl sm:text-3xl text-center mb-8">{t("home.why.title")}</h2>
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8">
        {items.map(({ icon: Icon, title, sub }) => (
          <li key={title} className="flex flex-col items-center text-center gap-2">
            <span className="w-14 h-14 rounded-2xl bg-surface-card border border-border-light shadow-sm text-accent-gold flex items-center justify-center">
              <Icon className="w-6 h-6" />
            </span>
            <span className="font-display uppercase font-bold text-on-surface text-sm sm:text-base">{t(title)}</span>
            <span className="text-xs sm:text-sm text-text-muted max-w-[16rem]">{t(sub)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------- Product section */

export function NewArrivalsHeading() {
  const { t } = useT();
  return (
    <SectionHeading
      eyebrow={t("home.newArrivals.eyebrow")}
      title={t("home.newArrivals.title")}
      action={
        <Link href="/shop?sort=newest" className="sp-btn sp-whistle self-start sm:self-auto shrink-0 h-11 inline-flex items-center gap-1.5 font-display uppercase tracking-wider text-xs font-bold">
          {t("home.newArrivals.viewAll")}
          <ArrowRight className="w-4 h-4" />
        </Link>
      }
    />
  );
}

export function EmptyProducts() {
  const { t } = useT();
  return <p className="text-center py-12 text-text-muted">{t("home.newArrivals.empty")}</p>;
}
