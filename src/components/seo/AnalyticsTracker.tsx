"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Lightweight GA4 pageview tracking.
 *
 * Only initializes when NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 * Uses the same gtag pattern as next/script, but avoids the extra script
 * tag for a smaller footprint in development.
 */

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId) return;

    // Only initialize gtag in production
    if (process.env.NODE_ENV !== "production") return;

    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void });
    if (!gtag.gtag) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    gtag.gtag("config", measurementId, {
      page_path: url,
      page_title: document.title,
      page_location: window.location.href,
    });
  }, [pathname, searchParams]);

  return null;
}

export function ConsentBanner() {
  // Simple cookie consent banner — minimal, no external deps
  return null;
}