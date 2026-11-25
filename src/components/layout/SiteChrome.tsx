"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * The customer site's header, footer and drawers. The admin panel has its
 * own full-screen layout (sidebar + top bar), so none of this is shown
 * under /admin — before, the site header sat on top of the admin screens.
 */
export function SiteChrome({ header, footer, overlays, children }: { header: ReactNode; footer: ReactNode; overlays: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  // The head script sets this on load; this keeps it right on client navigation.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("pitch", !admin);
  }, [admin]);
  if (admin) return <>{children}</>;
  return (
    <>
      {header}
      {overlays}
      {/* pb-16 clears the mobile bottom navigation bar; it is hidden from lg up. */}
      <main className="site-main flex-1 pt-[124px] md:pt-[120px] lg:pt-[164px] pb-16 lg:pb-0">{children}</main>
      {footer}
    </>
  );
}
