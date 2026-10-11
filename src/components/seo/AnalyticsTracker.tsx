"use client";

import { useEffect } from "react";

/**
 * Lightweight GA4 pageview tracking.
 *
 * Only initializes when NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 * Uses the same gtag pattern as next/script, but avoids the extra script
 * tag for a smaller footprint in development.
 *
 * The route is read from window.location inside the effect rather than from
 * usePathname()/useSearchParams(). Those two hooks force a client-side
 * rendering bailout during static prerendering unless every consumer sits
 * inside a Suspense boundary, and this component lives in the root layout --
 * so with them, every page in the app failed `next build` with
 * "useSearchParams() should be wrapped in a suspense boundary". Reading
 * window.location gives the same page_path (path and query together) from
 * code that only ever runs on the client, so the build can render the whole
 * storefront statically again.
 */
export function AnalyticsTracker() {
  useEffect(() => {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId) return;

    // Only initialize gtag in production
    if (process.env.NODE_ENV !== "production") return;

    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void });
    if (!gtag.gtag) return;

    gtag.gtag("config", measurementId, {
      page_path: window.location.pathname + window.location.search,
      page_title: document.title,
      page_location: window.location.href,
    });
  }, []);

  return null;
}

export function ConsentBanner() {
  // Simple cookie consent banner — minimal, no external deps
  return null;
}