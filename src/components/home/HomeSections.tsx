"use client";

import Link from "next/link";
import {
  ArrowRight,
  Backpack,
  BadgeCheck,
  Brush,
  CalendarClock,
  FileSpreadsheet,
  Headphones,
  MapPin,
  MessageCircle,
  Package,
  Palette,
  Percent,
  Shirt,
  Sparkles,
  Truck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney, type MessageKey } from "@/i18n";
import { JerseyPreview } from "@/components/custom-jersey/JerseyPreview";
import { DesignGrid } from "@/components/custom-jersey/DesignCatalogue";
import { categoryName, type DesignCategoryRow, type DesignRow } from "@/lib/custom-jersey/designs";
import type { Pattern } from "@/lib/custom-jersey/types";

/* Jersey colourways used by the drawn jerseys (illustrations, not theme colours). */
const KITS: { pattern: Pattern; colors: string[] }[] = [
  { pattern: "sash", colors: ["#0f2a4a", "#c89b3c", "#ffffff"] },
  { pattern: "stripes", colors: ["#b91c1c", "#111827", "#ffffff"] },
  { pattern: "chevron", colors: ["#065f46", "#f8fafc", "#facc15"] },
  { pattern: "halves", colors: ["#1d4ed8", "#e2e8f0", "#ffffff"] },
  { pattern: "hoops", colors: ["#111827", "#f59e0b", "#ffffff"] },
  { pattern: "side-panels", colors: ["#7c3aed", "#0f172a", "#ffffff"] },
];

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
          <span className="w-6 h-0.5 bg-accent-gold" />
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
      <div className="absolute inset-0 as-pitch-lines" aria-hidden />
      <div className="absolute -top-32 -right-24 w-[34rem] h-[34rem] rounded-full bg-accent-gold/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-sky-500/15 blur-3xl" aria-hidden />

      <div className="relative max-w-container-max mx-auto px-4 sm:px-6 pt-10 pb-16 sm:pt-16 sm:pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
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
              className="h-12 px-6 rounded-xl bg-accent-gold text-white font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-black/20 hover:brightness-110 transition"
            >
              <Palette className="w-5 h-5" />
              {t("home.hero.ctaCustom")}
            </Link>
            <Link
              href="/custom-jersey/gallery"
              className="h-12 px-6 rounded-xl bg-white/10 border border-white/25 text-white font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2 hover:bg-white/20 transition"
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

        {/* Drawn jerseys: one back with name and number, two fronts behind it. */}
        <div className="relative h-[320px] sm:h-[420px] lg:h-[480px]" aria-hidden>
          <div className="absolute left-[2%] top-[12%] w-[46%] as-float" style={{ ["--as-rot" as string]: "-12deg", animationDelay: "-2s" }}>
            <JerseyPreview pattern="stripes" colors={KITS[1].colors} side="front" teamName="DHAKA FC" number="7" className="w-full drop-shadow-2xl opacity-90" />
          </div>
          <div className="absolute right-[2%] top-[8%] w-[46%] as-float" style={{ ["--as-rot" as string]: "12deg", animationDelay: "-4s" }}>
            <JerseyPreview pattern="chevron" colors={KITS[2].colors} side="front" teamName="TIGERS" number="9" className="w-full drop-shadow-2xl opacity-90" />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-[18%] w-[56%] as-float">
            <JerseyPreview pattern="sash" colors={KITS[0].colors} side="back" name="RAHIM" number="10" className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.5)]" />
          </div>
          <span className="absolute left-0 bottom-[10%] inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-neutral-900 text-xs font-bold shadow-xl">
            <Shirt className="w-4 h-4 text-accent-gold" />
            {t("home.hero.floatNames")}
          </span>
          <span className="absolute right-0 bottom-[22%] inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-neutral-900 text-xs font-bold shadow-xl">
            <Sparkles className="w-4 h-4 text-accent-gold" />
            {t("home.hero.floatFabric")}
          </span>
        </div>
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
  const items: { icon: typeof Package; title: MessageKey; sub: MessageKey }[] = [
    { icon: Package, title: "home.perks.minimum", sub: "home.perks.minimumSub" },
    { icon: CalendarClock, title: "home.perks.days", sub: "home.perks.daysSub" },
    { icon: Truck, title: "home.perks.delivery", sub: "home.perks.deliverySub" },
    { icon: Wallet, title: "home.perks.pay", sub: "home.perks.paySub" },
  ];
  return (
    <div className="relative z-10 max-w-container-max mx-auto px-4 sm:px-6 -mt-8 sm:-mt-10">
      <ul className="grid grid-cols-2 lg:grid-cols-4 bg-surface-card border border-border-light rounded-2xl shadow-xl divide-border-light lg:divide-x overflow-hidden">
        {items.map(({ icon: Icon, title, sub }, i) => (
          <li key={title} className={`flex items-center gap-3 p-4 sm:p-5 ${i < 2 ? "border-b lg:border-b-0 border-border-light" : ""} ${i % 2 === 0 ? "border-r lg:border-r-0 border-border-light" : ""}`}>
            <span className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-accent-gold/15 text-accent-gold flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-display uppercase font-bold text-on-surface text-sm sm:text-base leading-tight">{t(title)}</span>
              <span className="block text-xs text-text-muted">{t(sub)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- Categories */

export function ShopCategories({ jerseyImage }: { jerseyImage?: string | null }) {
  const { t } = useT();
  const tiles: { href: string; title: MessageKey; sub: MessageKey; icon: typeof Shirt; kit: number; tone: string }[] = [
    { href: "/custom-jersey", title: "home.categories.custom", sub: "home.categories.customSub", icon: Palette, kit: 0, tone: "from-[#0f2a4a] to-[#1e3a5f]" },
    { href: "/shop?category=jersey", title: "home.categories.jerseys", sub: "home.categories.jerseysSub", icon: Shirt, kit: 1, tone: "from-[#7f1d1d] to-[#b91c1c]" },
    { href: "/shop?category=t-shirt", title: "home.categories.sportswear", sub: "home.categories.sportswearSub", icon: Users, kit: 2, tone: "from-[#064e3b] to-[#047857]" },
    { href: "/shop", title: "home.categories.accessories", sub: "home.categories.accessoriesSub", icon: Backpack, kit: 4, tone: "from-[#1f2937] to-[#374151]" },
  ];
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-20 w-full">
      <SectionHeading eyebrow={t("home.categories.eyebrow")} title={t("home.categories.title")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map(({ href, title, sub, icon: Icon, kit, tone }, i) => (
          <Link
            key={title}
            href={href}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${tone} text-white p-4 sm:p-5 min-h-[190px] sm:min-h-[240px] flex flex-col justify-between shadow-md hover:shadow-2xl hover:-translate-y-1 transition-all duration-300`}
          >
            <div className="absolute inset-0 as-pitch-lines opacity-70" aria-hidden />
            {i === 1 && jerseyImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={jerseyImage} alt="" className="absolute -right-6 -bottom-4 w-[70%] aspect-square object-cover rounded-full opacity-90 group-hover:scale-110 transition-transform duration-500" />
            ) : (
              <div className="absolute -right-6 -bottom-6 w-[62%] rotate-12 group-hover:rotate-6 group-hover:scale-110 transition-transform duration-500" aria-hidden>
                <JerseyPreview pattern={KITS[kit].pattern} colors={KITS[kit].colors} side="back" number={String(i * 3 + 7)} className="w-full drop-shadow-2xl" />
              </div>
            )}
            <span className="relative w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </span>
            <span className="relative flex flex-col gap-1 max-w-[70%]">
              <span className="font-display uppercase font-bold text-lg sm:text-2xl leading-none">{t(title)}</span>
              <span className="text-[11px] sm:text-xs text-white/75 leading-snug">{t(sub)}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-accent-gold">
                {t("home.categories.shopNow")}
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Design catalogue */

/** One drawn-jersey tile per design category (club, country, player ...). */
export function StyleTiles({ categories }: { categories: Pick<DesignCategoryRow, "slug" | "name_en" | "name_bn" | "image_url">[] }) {
  const { t, locale } = useT();
  if (!categories.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {categories.map((c, i) => {
        const kit = KITS[i % KITS.length];
        return (
          <Link
            key={c.slug}
            href={`/custom-jersey/gallery?c=${c.slug}`}
            className="group snap-start shrink-0 w-[44%] sm:w-[30%] lg:w-[calc((100%-4*0.75rem)/5)] rounded-2xl border border-border-light bg-surface-card hover:border-accent-gold hover:shadow-lg transition-all overflow-hidden"
          >
            <div className="relative aspect-square bg-gradient-to-b from-surface-subtle to-surface-container flex items-center justify-center overflow-hidden">
              {c.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <JerseyPreview pattern={kit.pattern} colors={kit.colors} side="front" number={String(i + 1)} className="w-[72%] drop-shadow-xl group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500" />
              )}
            </div>
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
              <span className="font-display uppercase font-bold text-sm text-on-surface truncate">{categoryName(c, locale)}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-gold shrink-0 inline-flex items-center gap-0.5">
                {t("home.catalogue.browse")}
                <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

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
            <Link href="/custom-jersey/gallery" className="self-start sm:self-auto shrink-0 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-display uppercase tracking-wider text-xs font-bold inline-flex items-center gap-2 hover:opacity-90">
              {t("home.catalogue.viewAll")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          }
        />
        <StyleTiles categories={categories} />
        {/* One or two cards under the style tiles look unfinished; the tiles and the banner carry the section until there are more. */}
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
      <Link href="/custom-jersey#order" className="shrink-0 h-11 px-5 rounded-xl bg-accent-gold text-white font-display uppercase tracking-wider text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-110">
        <Upload className="w-4 h-4" />
        {t("home.gallery.upload")}
      </Link>
    </div>
  );
}

/* --------------------------------------------------------- How it works */

export function HowItWorks({ advancePercent, compact = false }: { advancePercent: number; compact?: boolean }) {
  const { t } = useT();
  const steps: { icon: typeof Upload; key: MessageKey }[] = [
    { icon: Upload, key: "customJersey.steps.one" },
    { icon: Brush, key: "customJersey.steps.two" },
    { icon: Wallet, key: "customJersey.steps.three" },
    { icon: Truck, key: "customJersey.steps.four" },
  ];
  const list = (
    <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {steps.map(({ icon: Icon, key }, i) => (
        <li key={key} className="relative rounded-2xl bg-surface-card border border-border-light p-5 flex flex-col gap-3 overflow-hidden">
          <span className="absolute -right-2 -top-4 font-display font-bold text-7xl text-accent-gold/15 leading-none select-none" aria-hidden>
            {i + 1}
          </span>
          <span className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </span>
          <p className="relative text-sm sm:text-base font-semibold text-on-surface leading-snug">{t(key, { percent: advancePercent })}</p>
        </li>
      ))}
    </ol>
  );
  if (compact) return list;
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
      <SectionHeading eyebrow={t("home.how.eyebrow")} title={t("home.how.title")} align="center" />
      {list}
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
      <div className="relative overflow-hidden rounded-3xl bg-primary-container text-white p-6 sm:p-10 lg:p-14 grid lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
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
            <Link href="/custom-jersey#order" className="h-12 px-6 rounded-xl bg-accent-gold text-white font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2 hover:brightness-110">
              <Users className="w-5 h-5" />
              {t("home.team.cta")}
            </Link>
            {wa && (
              <a href={wa} target="_blank" rel="noopener" className="h-12 px-6 rounded-xl bg-white text-neutral-900 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2 hover:bg-white/90">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                {t("home.team.whatsapp")}
              </a>
            )}
          </div>
        </div>
        <div className="relative hidden lg:grid grid-cols-3 gap-2 -rotate-6" aria-hidden>
          {[
            ["KARIM", "4"],
            ["RAHIM", "10"],
            ["SAKIB", "75"],
            ["TAMIM", "28"],
            ["MUSHFIQ", "7"],
            ["SHANTO", "1"],
          ].map(([name, number], i) => (
            <JerseyPreview key={name} pattern={KITS[0].pattern} colors={KITS[0].colors} side="back" name={name} number={number} className={`w-full drop-shadow-xl ${i % 2 ? "translate-y-6" : ""}`} />
          ))}
        </div>
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
        <Link href="/shop?sort=newest" className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 font-display uppercase tracking-wider text-xs font-bold text-on-surface hover:text-accent-gold">
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

export function EditionText({ which, href }: { which: "player" | "fan"; href: string }) {
  const { t } = useT();
  return (
    <>
      <span className="font-display text-xs uppercase tracking-[0.2em] text-accent-gold font-bold">{t(`home.editions.${which}Eyebrow`)}</span>
      <h3 className="font-display text-2xl sm:text-3xl uppercase font-bold leading-tight">{t(`home.editions.${which}Title`)}</h3>
      <Link href={href} className="pointer-events-auto mt-3 self-start inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-white text-neutral-900 font-display text-xs uppercase font-bold hover:bg-accent-gold hover:text-white transition-colors">
        {t(`home.editions.${which}Cta`)}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </>
  );
}
