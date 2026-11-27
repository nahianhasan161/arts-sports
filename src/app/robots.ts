import type { MetadataRoute } from "next";
import { getServerUrl } from "@/lib/config";

/**
 * robots.txt
 *
 * - Private and pointless pages stay out: admin, account, sign-in, checkout,
 *   order pages, the API.
 * - The product feeds under /api/feeds and the pictures under /api/media
 *   stay open (Merchant Center, Meta, Pinterest and Google Images fetch them
 *   as crawlers; a blocked picture means no image in Shopping).
 * - Sort / price / size / stock combinations of /shop are not crawled: they
 *   are the same products in another order, and thousands of them would use
 *   up the crawl on copies. Category, sub-category, team and deals pages stay.
 * - AI search and assistant crawlers are named and allowed on purpose, so
 *   ChatGPT, Claude, Perplexity, Gemini, Copilot and Apple can read the shop
 *   and recommend it. They also get /llms.txt.
 */

const SITE_URL = getServerUrl().replace(/\/+$/, "");

const PRIVATE = [
  "/admin",
  "/account",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/checkout",
  "/order/",
  "/custom-jersey/order/",
  "/api/",
];

const CRAWL_TRAPS = ["/*?*sort=", "/*?*price_min=", "/*?*price_max=", "/*?*sizes=", "/*?*stock=", "/*?*search=", "/*?q=", "/*&q="];

/** AI search / assistant crawlers (2026 names). */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  const rule = { allow: ["/", "/api/feeds/", "/api/media/", "/llms.txt", "/llms-full.txt"], disallow: [...PRIVATE, ...CRAWL_TRAPS] };
  return {
    rules: [
      { userAgent: "*", ...rule },
      { userAgent: AI_CRAWLERS, ...rule },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
