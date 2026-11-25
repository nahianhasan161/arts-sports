"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Root error boundary.
 *
 * There was none, so an uncaught error anywhere in the storefront dropped the
 * shopper on Next.js's default error screen — a stack of internals with no
 * brand, no navigation, and no way to retry. That is a page a customer sees
 * as "this shop is broken", and it turns a single bad render into a lost
 * visit.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept in the console so a real failure is still visible in the logs
    // instead of being swallowed by the friendly UI.
    console.error("Unhandled storefront error:", error);
    // After a deploy, a cached page can ask for a module the new chunks don't
    // have ("l[e] is not a function", ChunkLoadError). A fresh load fixes it,
    // so reload once (guarded so a real bug can't loop).
    const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
    const stale =
      /ChunkLoadError|Loading chunk|Loading CSS chunk|is not a function/.test(msg) &&
      String(error?.stack ?? "").includes("webpack");
    if (stale || /ChunkLoadError|Loading (CSS )?chunk/.test(msg)) {
      try {
        const key = "chunk-reload-at";
        const last = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* storage blocked: just show the page */
      }
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-space-base py-space-3xl">
      <div className="max-w-md w-full text-center flex flex-col gap-4">
        <div className="w-14 h-14 rounded-full bg-badge-discount/10 text-badge-discount flex items-center justify-center mx-auto">
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="font-display text-xl uppercase font-bold text-primary">
          Something went wrong
        </h1>
        <p className="text-sm text-text-muted">
          We hit an unexpected error loading this page. Your bag and your
          sign-in are unaffected. Try again — if it keeps happening, call us
          and we will help you place the order by phone.
        </p>

        {error?.digest && (
          <p className="text-xs text-text-muted font-mono">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="sp-btn sp-whistle py-3 font-display uppercase tracking-wider text-xs font-bold"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="sp-btn sp-flag py-3 font-display uppercase tracking-wider text-xs font-bold"
          >
            Go Home
          </Link>
        </div>

        <a
          href="tel:+8801911904618"
          className="text-xs text-primary font-semibold hover:underline pt-2"
        >
          Need help? Call +880 1911-904618
        </a>
      </div>
    </div>
  );
}
