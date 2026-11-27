import React from "react";
import Link from "next/link";
import { LocaleSwitch } from "@/components/legal/LocaleSwitch";

/**
 * Shared shell for the store's policy pages, in Bangla (the default) and
 * English. Both versions are rendered on the server and the visitor's
 * language picks one in the browser, so the pages stay cacheable.
 */

const LAST_UPDATED = { en: "26 November 2026", bn: "২৬ নভেম্বর ২০২৬" };

type Lang = "en" | "bn";

interface Version {
  title: string;
  intro: string;
  children: React.ReactNode;
}

const CHROME = {
  en: {
    home: "Home",
    updated: "Last updated",
    questions: "Questions about this policy? Call",
    hours: "between 9 AM and 10 PM, or email",
    links: ["Return & Exchange", "Refund Policy", "Shipping Policy", "Privacy Policy", "Terms of Service"],
  },
  bn: {
    home: "হোম",
    updated: "সর্বশেষ হালনাগাদ",
    questions: "এই নীতি নিয়ে প্রশ্ন আছে? ফোন করুন",
    hours: "নম্বরে (সকাল ৯টা – রাত ১০টা), অথবা ইমেইল করুন",
    links: ["রিটার্ন ও এক্সচেঞ্জ", "রিফান্ড নীতি", "ডেলিভারি নীতি", "গোপনীয়তা নীতি", "শর্তাবলি"],
  },
} as const;

const HREFS = ["/returns", "/refund-policy", "/shipping-policy", "/privacy-policy", "/terms"];

export function LegalPage({ en, bn }: { en: Version; bn: Version }) {
  return <LocaleSwitch en={<Shell lang="en" {...en} />} bn={<Shell lang="bn" {...bn} />} />;
}

function Shell({ lang, title, intro, children }: Version & { lang: Lang }) {
  const c = CHROME[lang];
  return (
    <div className="w-full bg-surface" lang={lang}>
      <div className="max-w-3xl mx-auto px-space-base py-space-xl">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted mb-space-base">
          <Link href="/" className="hover:text-primary transition-colors">
            {c.home}
          </Link>
          <span className="opacity-40">/</span>
          <span className="font-bold text-primary">{title}</span>
        </nav>

        <header className="mb-space-lg pb-space-base border-b border-border-light">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-primary mb-2">{title}</h1>
          <p className="text-sm text-text-muted max-w-2xl">{intro}</p>
          <p className="text-xs text-text-muted mt-3">
            {c.updated}: {LAST_UPDATED[lang]}
          </p>
        </header>

        <div className="flex flex-col gap-space-lg text-sm text-on-surface leading-relaxed">{children}</div>

        <footer className="mt-space-xl pt-space-base border-t border-border-light text-xs text-text-muted">
          <p className="mb-2">
            {c.questions}{" "}
            <a href="tel:+8801911904618" className="text-primary font-semibold hover:underline">
              +880 1911-904618
            </a>{" "}
            {c.hours}{" "}
            <a href="mailto:support@artssports.com" className="text-primary font-semibold hover:underline">
              support@artssports.com
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {HREFS.map((href, i) => (
              <Link key={href} href={href} className="hover:text-primary transition-colors">
                {c.links[i]}
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** A titled section of a policy page. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">{title}</h2>
      {children}
    </section>
  );
}

/** A label + value row, used for charges and timelines. */
export function LegalRow({ label, value, last, strong }: { label: string; value: React.ReactNode; last?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${last ? "" : "border-b border-border-light pb-2"}`}>
      <span className="text-text-muted">{label}</span>
      <span className={strong ? "font-bold text-primary" : "font-semibold"}>{value}</span>
    </div>
  );
}
