"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translate, type Locale, type MessageKey, type Vars } from "./index";

/**
 * The visitor's language in client components.
 *
 *   const { t, locale, setLocale } = useT();
 *   t("customJersey.title")
 *
 * The choice lives in the `lang` cookie, so server code (messages, pages)
 * sees the same one. Until the cookie is read the default locale is used,
 * which keeps the first render the same on the server and in the browser.
 */

const listeners = new Set<() => void>();

function readCookie(): Locale {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  return match && isLocale(match[1]) ? match[1] : DEFAULT_LOCALE;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, readCookie, () => DEFAULT_LOCALE);
}

export function useT() {
  const locale = useLocale();
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
  return { t, locale, setLocale };
}
