"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/client";

/** Shows the Bangla or the English version, by the visitor's language. Both arrive with the page. */
export function LocaleSwitch({ en, bn }: { en: ReactNode; bn: ReactNode }) {
  const { locale } = useT();
  return <>{locale === "en" ? en : bn}</>;
}
