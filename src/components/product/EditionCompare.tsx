"use client";

import { useT } from "@/i18n/client";
import type { CatalogTerm } from "@/lib/services/catalog";

const ROWS = [
  ["fabric", "store.edition.fabric"],
  ["fit", "store.edition.fit"],
  ["logo", "store.edition.logo"],
  ["price_note", "store.edition.price"],
] as const;

/**
 * Player Edition vs Fan Edition, side by side, with this product's edition
 * marked. Content is whatever the admin wrote on each edition term. Hidden
 * unless the product has an edition and at least two editions exist.
 */
export function EditionCompare({ editions, current }: { editions: CatalogTerm[]; current: string[] }) {
  const { t, locale } = useT();
  if (editions.length < 2 || !editions.some((e) => current.includes(e.id))) return null;
  return (
    <section className="max-w-container-max mx-auto px-space-base py-space-lg">
      <h2 className="font-display text-lg uppercase font-bold text-primary mb-3">{t("store.edition.title")}</h2>
      <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-subtle text-left">
              <th className="p-3 w-32" />
              {editions.map((e) => (
                <th key={e.id} className="p-3 font-display uppercase text-xs tracking-wider text-primary">
                  {(locale === "bn" && e.name_bn) || e.name_en}
                  {current.includes(e.id) && (
                    <span className="ml-2 text-xs bg-primary text-primary-foreground rounded px-1.5 py-0.5 align-middle">{t("store.edition.current")}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([key, label]) =>
              editions.some((e) => e.details?.[key]) ? (
                <tr key={key} className="border-t border-border-light align-top">
                  <th className="p-3 text-left text-xs font-semibold text-text-muted">{t(label)}</th>
                  {editions.map((e) => (
                    <td key={e.id} className="p-3">{e.details?.[key] ?? "—"}</td>
                  ))}
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
