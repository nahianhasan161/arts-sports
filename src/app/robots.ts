import type { MetadataRoute } from "next";
import { getServerUrl } from "@/lib/config";

/**
 * robots.txt
 *
 * There was no robots file at all, so crawlers had nothing to read and every
 * route — including /admin, /sign-in and /checkout — was fair game to index.
 *
 * The disallow list is written out rather than left to chance: the admin
 * panel, the account area, the sign-in flow and the checkout funnel are all
 * pointless in a search index, and an indexed /admin page is a small
 * information leak on its own.
 */

const SITE_URL = getServerUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/account",
          "/account/",
          "/sign-in",
          "/sign-up",
          "/checkout",
          "/order/",
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
