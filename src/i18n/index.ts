import { bn } from "./messages/bn";
import { en, type Messages } from "./messages/en";

/**
 * Bangla / English text.
 *
 * All new text should come from messages/{en,bn}.ts through t(), so the
 * language switch (roadmap Phase 5) only has to choose the locale. Existing
 * pages still have English written inline and move over as they are touched.
 *
 * Product and category names have their own *_bn columns in the database;
 * pick them with localized(row, "title", locale).
 */

export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Bangla is the main language; English is the switch. */
export const DEFAULT_LOCALE: Locale = "bn";

/** Cookie the language switch will set. */
export const LOCALE_COOKIE = "lang";

const dictionaries: Record<Locale, Messages> = { bn, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = { [K in keyof T]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T];

/** Every valid key, e.g. "notify.order_placed.body". */
export type MessageKey = Paths<Messages>;

export type Vars = Record<string, string | number | null | undefined>;

function lookup(dict: Messages, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object") node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function translate(locale: Locale, key: MessageKey, vars: Vars = {}): string {
  const template = lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** const t = getT("bn"); t("payment.finish") */
export function getT(locale: Locale) {
  return (key: MessageKey, vars?: Vars) => translate(locale, key, vars);
}

/**
 * Picks the Bangla column when there is one: localized(product, "title", "bn")
 * returns product.title_bn if filled, otherwise product.title.
 */
export function localized<T extends Record<string, unknown>>(row: T, field: string, locale: Locale): string {
  const bnValue = locale === "bn" ? row[`${field}_bn`] : undefined;
  const value = typeof bnValue === "string" && bnValue.trim() ? bnValue : row[field];
  return typeof value === "string" ? value : "";
}

/** ৳1,060 in the right digits for the locale. */
export function formatMoney(amount: number, locale: Locale): string {
  const n = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 2 }).format(amount);
  return `৳${n}`;
}
