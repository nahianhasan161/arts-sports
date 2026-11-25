"use client";

import Link from "next/link";
import { Ball } from "@/components/football/Ball";
import { Home, ShoppingBag } from "lucide-react";
import { useT } from "@/i18n/client";
import { MAIN_NAV } from "@/lib/nav";

/**
 * 404 page.
 *
 * There was none, so a broken URL got Next.js's default unstyled "404 This
 * page could not be found." screen with no way back into the store — and
 * since the product detail page used to render an empty shell instead of
 * calling notFound(), there was an unbounded set of URLs that resolved to
 * exactly that. A shopper who mistypes a product name now gets somewhere to
 * go.
 */
export default function NotFound() {
  const { t } = useT();
  return (
    <div className="w-full bg-surface">
      <div className="max-w-2xl mx-auto px-space-base py-space-3xl text-center">
        <p className="font-display text-6xl sm:text-7xl font-bold text-primary mb-2">
          4<Ball className="inline-block w-[0.8em] h-[0.8em] mx-1 align-[-0.06em] as-bounce" />4
        </p>
        <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary mb-3">
          {t("buy.missing.title")}
        </h1>
        <p className="text-sm text-text-muted mb-space-xl max-w-md mx-auto">
          {t("buy.missing.text")}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-space-xl">
          <Link
            href="/shop"
            className="sp-btn sp-pitch inline-flex items-center justify-center gap-2 py-3 font-display uppercase tracking-wider text-xs font-bold"
          >
            <ShoppingBag className="w-4 h-4" />
            {t("buy.missing.shop")}
          </Link>
          <Link
            href="/"
            className="sp-btn sp-flag inline-flex items-center justify-center gap-2 py-3 font-display uppercase tracking-wider text-xs font-bold"
          >
            <Home className="w-4 h-4" />
            {t("buy.missing.home")}
          </Link>
        </div>

        {/* Popular destinations, so a lost shopper has somewhere to land
            without having to think about what to search for. */}
        <div className="border-t border-border-light pt-space-lg">
          <p className="text-xs font-display uppercase tracking-wider text-text-muted font-bold mb-3">
            {t("buy.missing.places")}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {MAIN_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="sp-chip min-h-11 inline-flex items-center text-xs font-semibold"
              >
                {t(link.key)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
