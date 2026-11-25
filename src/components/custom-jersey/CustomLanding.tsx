"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarClock, Images, Package, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { JerseyPreview } from "./JerseyPreview";
import { DesignGrid } from "./DesignCatalogue";
import { HowItWorks } from "@/components/home/HomeSections";
import type { DesignCategoryRow, DesignRow } from "@/lib/custom-jersey/designs";

/*
 * The top of /custom-jersey: hero, promises, steps and a few designs to start
 * from. Text comes from useT() so the page itself reads no cookies and can be
 * cached; the order form below loads its prices from /api/custom-jersey/config.
 */

export function CustomHero({ startPrice, advancePercent, normalDays, freeRevisions }: { startPrice: number | null; advancePercent: number; normalDays: number; freeRevisions: number }) {
  const { t, locale } = useT();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const trust = [
    { icon: Package, text: t("home.cj.trust.minimum") },
    { icon: CalendarClock, text: t("home.cj.trust.days", { days: num(normalDays) }) },
    { icon: Wallet, text: t("home.cj.trust.advance", { percent: num(advancePercent) }) },
    ...(freeRevisions > 0 ? [{ icon: RefreshCw, text: t("home.cj.trust.revisions", { count: num(freeRevisions) }) }] : []),
    { icon: ShieldCheck, text: t("home.cj.trust.noPay") },
  ];

  return (
    <>
    <section className="relative overflow-hidden bg-primary-container text-white">
      <div className="absolute inset-0 as-pitch-lines" aria-hidden />
      <div className="absolute -top-40 right-[-10rem] w-[36rem] h-[36rem] rounded-full bg-accent-gold/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-48 -left-40 w-[30rem] h-[30rem] rounded-full bg-sky-500/15 blur-3xl" aria-hidden />

      <div className="relative max-w-container-max mx-auto px-4 sm:px-6 pt-10 pb-24 sm:pt-14 sm:pb-32 grid lg:grid-cols-[1.15fr_1fr] gap-8 lg:gap-12 items-center">
        <div className="flex flex-col gap-5 as-rise">
          <nav aria-label="Breadcrumb" className="text-xs text-white/60">
            <Link href="/" className="hover:text-white">Arts Sports</Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/90">{t("customJersey.title")}</span>
          </nav>
          <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">
            <BadgeCheck className="w-3.5 h-3.5 text-accent-gold" />
            {t("home.landing.eyebrow")}
          </span>
          <h1 className="font-display uppercase font-bold leading-[0.95] tracking-tight text-4xl sm:text-6xl">{t("home.landing.title")}</h1>
          <p className="text-base sm:text-lg text-white/80 max-w-xl">{t("home.landing.text")}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href="#order"
              className="sp-btn sp-bat h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2"
            >
              {t("home.landing.start")}
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/custom-jersey/gallery"
              className="sp-btn sp-ticket h-12 font-display uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2"
            >
              <Images className="w-4 h-4" />
              {t("home.landing.catalogue")}
            </Link>
          </div>
          {startPrice !== null && (
            <p className="text-sm text-white/80">
              <span className="font-semibold text-white">{t("home.hero.from", { price: formatMoney(startPrice, locale) })}</span>
            </p>
          )}
        </div>

        {/* Drawn kit: front and back of the same jersey. */}
        <div className="relative h-[260px] sm:h-[360px] lg:h-[420px]" aria-hidden>
          <div className="absolute left-[4%] top-[6%] w-[52%] as-float" style={{ ["--as-rot" as string]: "-8deg", animationDelay: "-3s" }}>
            <JerseyPreview pattern="sash" colors={["#0f2a4a", "#c89b3c", "#ffffff"]} side="front" teamName="ARTS FC" number="10" className="w-full drop-shadow-2xl" />
          </div>
          <div className="absolute right-[2%] top-[14%] w-[52%] as-float" style={{ ["--as-rot" as string]: "8deg" }}>
            <JerseyPreview pattern="sash" colors={["#0f2a4a", "#c89b3c", "#ffffff"]} side="back" name="YOUR NAME" number="10" className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.5)]" />
          </div>
        </div>
      </div>

    </section>

      {/* Promises, overlapping the bottom of the hero (outside it, so its overflow clip does not cut them). */}
      <div className="relative z-10 max-w-container-max w-full mx-auto px-4 sm:px-6 -mt-12 sm:-mt-14">
        <ul className="flex gap-1 sm:gap-2 overflow-x-auto no-scrollbar rounded-2xl bg-surface-card text-on-surface border border-border-light shadow-xl p-2 sm:p-3">
          {trust.map(({ icon: Icon, text }) => (
            <li key={text} className="shrink-0 flex-1 min-w-[150px] flex items-center gap-2.5 rounded-xl px-3 py-2.5">
              <span className="shrink-0 w-9 h-9 rounded-lg bg-accent-gold-soft text-accent-gold flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-xs sm:text-sm font-semibold leading-tight">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function CustomSteps({ advancePercent }: { advancePercent: number }) {
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-10 sm:pt-14 w-full">
      <HowItWorks advancePercent={advancePercent} compact />
    </section>
  );
}

export function PopularDesigns({ designs, categories }: { designs: DesignRow[]; categories: DesignCategoryRow[] }) {
  const { t } = useT();
  // One or two cards on their own look unfinished; the form's "our designs" picker covers that case.
  if (designs.length < 3) return null;
  return (
    <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-14 sm:pt-20 w-full">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-2 text-accent-gold font-display text-xs uppercase tracking-[0.2em] font-bold">
            <span className="w-6 h-0.5 bg-accent-gold" />
            {t("home.catalogue.eyebrow")}
          </span>
          <h2 className="font-display uppercase font-bold text-on-surface text-2xl sm:text-3xl leading-tight">{t("home.landing.popular")}</h2>
        </div>
        <Link href="/custom-jersey/gallery" className="sp-btn sp-goal shrink-0 h-11 inline-flex items-center gap-1.5 font-display uppercase tracking-wider text-xs font-bold">
          {t("home.landing.seeAll")}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <DesignGrid designs={designs} categories={categories} limit={4} className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 pt-4" />
    </section>
  );
}

export function OrderHeading() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-2 mb-6 sm:mb-8 max-w-2xl">
      <span className="inline-flex items-center gap-2 text-accent-gold font-display text-xs uppercase tracking-[0.2em] font-bold">
        <span className="w-6 h-0.5 bg-accent-gold" />
        {t("home.landing.eyebrow")}
      </span>
      <h2 className="font-display uppercase font-bold text-on-surface text-3xl sm:text-4xl leading-[1.05] tracking-tight">{t("home.landing.formTitle")}</h2>
      <p className="text-sm sm:text-base text-on-surface-variant">{t("home.landing.formText")}</p>
    </div>
  );
}
