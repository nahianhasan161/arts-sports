"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { AREA_LABEL, GUIDE, type Topic } from "@/components/admin/help/guide";
import { panel } from "@/components/admin/dashboard/parts";

const areaTone: Record<Topic["area"], string> = {
  start: "bg-amber-100 text-amber-800",
  online: "bg-blue-100 text-blue-700",
  store: "bg-emerald-100 text-emerald-700",
  both: "bg-purple-100 text-purple-700",
};

/** Step-by-step guides for every job in the panel. Open to all staff. */
export default function HelpPage() {
  const { locale } = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>("panel");

  const term = q.trim().toLowerCase();
  const topics = term ? GUIDE.filter((g) => [g.title[locale], g.summary[locale], ...g.steps.map((s) => s[locale])].join(" ").toLowerCase().includes(term)) : GUIDE;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={locale === "bn" ? "কী করতে চান লিখুন — যেমন: স্টক, ফেরত, কুপন" : "Type what you want to do — e.g. stock, return, coupon"}
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-border-light bg-surface-card text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-gold"
        />
      </div>

      {topics.length === 0 && <p className={`${panel} p-6 text-center text-sm text-text-muted`}>{locale === "bn" ? "কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে খুঁজুন।" : "Nothing found. Try another word."}</p>}

      {topics.map((g) => {
        const shown = Boolean(term) || open === g.id;
        return (
          <section key={g.id} className={`${panel} overflow-hidden`}>
            <button onClick={() => setOpen(shown ? null : g.id)} aria-expanded={shown} className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-subtle transition-colors">
              <div className="flex-1 min-w-0">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${areaTone[g.area]}`}>{AREA_LABEL[g.area][locale]}</span>
                <h2 className="mt-1.5 text-base font-bold text-primary">{g.title[locale]}</h2>
                <p className="text-sm text-text-muted">{g.summary[locale]}</p>
              </div>
              <ChevronDown className={`w-5 h-5 mt-1 text-text-muted transition-transform ${shown ? "rotate-180" : ""}`} />
            </button>
            {shown && (
              <div className="px-4 pb-4">
                <ol className="space-y-2.5">
                  {g.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-on-surface">
                      <span className="w-6 h-6 rounded-full bg-accent-gold/20 text-accent-gold text-xs font-bold flex items-center justify-center flex-shrink-0">{new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en").format(i + 1)}</span>
                      <span className="pt-0.5">{s[locale]}</span>
                    </li>
                  ))}
                </ol>
                {g.href && g.action && (
                  <Link href={g.href} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                    {g.action[locale]}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
