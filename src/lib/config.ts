/**
 * Centralized application configuration.
 *
 * Reads from environment variables with safe defaults for development.
 * Never import this from client components that need secrets —
 * only public values are exposed here.
 */

export const config = {
  app: {
    name: "Arts Sports",
    tagline: "Premium Everyday Apparel",
    url: getServerUrl(),
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
  },

  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  },

  features: {
    enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true",
    enableErrorReporting: process.env.NEXT_PUBLIC_ENABLE_ERROR_REPORTING === "true",
    enableReturns: process.env.NEXT_PUBLIC_ENABLE_RETURNS !== "false",
    enableCoupons: process.env.NEXT_PUBLIC_ENABLE_COUPONS !== "false",
  },

  shipping: {
    freeThreshold: 1500,
    dhakaFee: 60,
    outsideDhakaFee: 120,
  },

  business: {
    currency: "BDT",
    currencySymbol: "৳",
    phone: "+880-1700-000000",
    email: "support@artssports.com",
    supportWhatsApp: "8801700000000",
  },

  analytics: {
    googleAnalyticsId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
};

/**
 * The site's own origin, as an absolute URL with no trailing slash.
 *
 * This used to be read from four places that disagreed with each other:
 * NEXT_PUBLIC_APP_URL, VERCEL_URL, a literal hardcoded in the root layout,
 * and NEXT_PUBLIC_SITE_URL from the env file. They resolved to three
 * different hosts, which meant the canonical tags, the Open Graph URLs and
 * the sitemap could each name a different domain and split the site's
 * signals across all of them.
 *
 * One function, one precedence order. NEXT_PUBLIC_SITE_URL is what the
 * deployment sets and wins; the rest are local and preview fallbacks.
 */
export function getServerUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim() !== "") {
      return candidate.trim().replace(/\/+$/, "");
    }
  }

  if (process.env.NODE_ENV === "production") {
    return "https://artssports.com";
  }
  return "http://localhost:3112";
}

export function formatPrice(amount: number): string {
  return `${config.business.currencySymbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildUrl(path: string): string {
  const base = config.app.url.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}