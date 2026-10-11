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
          <p className="text-[11px] text-text-muted font-mono">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="px-6 py-3 bg-primary text-white font-display uppercase tracking-wider text-xs font-bold rounded-lg hover:bg-primary-container transition-colors shadow-sm"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-border-light bg-surface-card text-primary font-display uppercase tracking-wider text-xs font-bold rounded-lg hover:bg-surface-subtle transition-colors"
          >
            Go Home
          </Link>
        </div>

        <a
          href="tel:+8809677666888"
          className="text-xs text-primary font-semibold hover:underline pt-2"
        >
          Need help? Call +880 9677 666 888
        </a>
      </div>
    </div>
  );
}
