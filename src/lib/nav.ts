import type { NavItem } from "@/components/layout/CategoryBar";

/** The customer site's main menu: header row, phone menu and footer. Rendered on the server as it is. */
export const MAIN_NAV: NavItem[] = [
  { kind: "custom", name: "Custom Jersey", key: "site.nav.customJersey", href: "/custom-jersey" },
  { kind: "category", name: "Football", key: "site.nav.football", href: "/shop?sport=football" },
  { kind: "category", name: "Cricket", key: "site.nav.cricket", href: "/shop?sport=cricket" },
  { kind: "category", name: "Badminton", key: "site.nav.badminton", href: "/shop?sport=badminton" },
  { kind: "category", name: "Accessories", key: "site.nav.accessories", href: "/shop?category=accessories" },
  { kind: "deal", name: "Offers", key: "site.nav.offers", href: "/shop?deals=true" },
];

/** The shop's phone number, as dialled and as shown. */
export const STORE_PHONE = "+8801911904618";
export const STORE_PHONE_SHOWN = "01911-904618";
export const STORE_EMAIL = "support@artssports.com";

/** The return window in days, as published on /returns. */
export const RETURN_DAYS = 7;

/** Social pages. A link is shown only when it has a real address here. */
export const SOCIAL_LINKS: { name: "Facebook" | "Instagram" | "YouTube"; href: string }[] = [];
