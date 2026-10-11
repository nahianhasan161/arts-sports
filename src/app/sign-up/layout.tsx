import React from "react";
import type { Metadata } from "next";

/** Keeps the sign-up funnel out of search results. See ../sign-in/layout.tsx. */
export const metadata: Metadata = {
  title: "Create Account",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
