"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/tracking/events";

/**
 * Counts a page view each time the shopper moves to another page inside the
 * site. Moving between pages doesn't reload them, so without this the Meta,
 * TikTok and Pinterest tags only ever saw the first page. The first page is
 * skipped: each tag counts it when it loads. usePathname alone needs no
 * Suspense boundary (useSearchParams would).
 */
export function RouteTracker() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pathname.startsWith("/admin")) return;
    trackPageView(pathname);
  }, [pathname]);
  return null;
}
