import React from "react";
import type { Metadata } from "next";

/**
 * Keeps the sign-in funnel out of search results.
 *
 * The sign-in and sign-up pages are indexable, which serves no search
 * purpose and lets a crawler discover the auth surface. This is a server
 * layout rather than a metadata export on the page, because the pages
 * themselves are client components and a "use client" file cannot export
 * metadata.
 */

export const metadata: Metadata = {
  title: "Sign In",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
