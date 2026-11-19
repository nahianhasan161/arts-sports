"use client";

import { useEffect } from "react";

/**
 * Last-resort error screen, used only when the root layout itself fails
 * (error.tsx cannot catch that because it renders inside the layout).
 *
 * It replaces the whole document, so it brings its own <html>/<body> and plain
 * inline styles: the layout's fonts, theme, providers and globals.css are not
 * there. Text is in both languages because the locale provider is gone too.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="bn">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#f7f7f8",
          color: "#1a1a1a",
        }}
      >
        <main style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>কিছু একটা সমস্যা হয়েছে</h1>
          <p style={{ fontSize: 14, color: "#555", margin: "0 0 4px" }}>
            পেজটি লোড করা যায়নি। আবার চেষ্টা করুন।
          </p>
          <p style={{ fontSize: 13, color: "#777", margin: "0 0 20px" }}>
            Something went wrong loading this page. Please try again.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 11, color: "#888", fontFamily: "monospace", margin: "0 0 16px" }}>
              Ref: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
                border: 0,
                borderRadius: 8,
                background: "#111",
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              আবার চেষ্টা করুন / Try again
            </button>
            {/* A plain <a>: a full reload rebuilds the layout that just failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #ccc",
                color: "#111",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              হোম / Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
