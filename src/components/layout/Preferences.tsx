"use client";

import { Moon, Sun, Languages } from "lucide-react";
import { useT } from "@/i18n/client";
import { useTheme } from "@/lib/theme";

/** tone="dark" is for use on the dark top band and the admin sidebar. */
type Tone = "plain" | "dark";

const base = "inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-colors h-8 px-2.5";
const tones: Record<Tone, string> = {
  plain: "text-on-surface-variant hover:bg-surface-subtle hover:text-on-surface border border-border-light bg-surface-card",
  dark: "text-on-primary hover:bg-white/10",
};

/** Switches বাংলা ↔ English. Shows the language you would switch to. */
export function LanguageToggle({ tone = "plain" }: { tone?: Tone }) {
  const { t, locale, setLocale } = useT();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "bn" ? "en" : "bn")}
      className={`${base} ${tones[tone]}`}
      title={t("common.language")}
      aria-label={t("common.language")}
    >
      <Languages className="w-4 h-4" />
      <span>{locale === "bn" ? "English" : "বাংলা"}</span>
    </button>
  );
}

/** Switches light ↔ dark mode. */
export function ThemeToggle({ tone = "plain" }: { tone?: Tone }) {
  const { t } = useT();
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? t("common.lightMode") : t("common.darkMode");
  return (
    <button type="button" onClick={toggle} className={`${base} ${tones[tone]}`} title={label} aria-label={label}>
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
