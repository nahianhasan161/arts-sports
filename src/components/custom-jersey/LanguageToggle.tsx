"use client";

import { useT } from "@/i18n/client";

/** বাংলা / English switch for the custom jersey pages. */
export function LanguageToggle() {
  const { t, locale, setLocale } = useT();
  return (
    <div className="inline-flex rounded-lg border border-border-light overflow-hidden text-xs shrink-0" role="group" aria-label={t("common.language")}>
      {(["bn", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`px-3 py-1.5 font-semibold ${locale === l ? "bg-primary text-white" : "bg-white text-text-muted hover:bg-surface-subtle"}`}
        >
          {t(l === "bn" ? "common.bangla" : "common.english")}
        </button>
      ))}
    </div>
  );
}
