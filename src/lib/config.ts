/**
 * Centralized application configuration.
 *
 * Reads from environment variables with safe defaults for development.
 * Never import this from client components that need secrets —
 * only public values are exposed here.
 */

export const config = {
  app: {
    name: "Arts Fashion",
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
    email: "support@artsfashion.com",
    supportWhatsApp: "8801700000000",
  },

  analytics: {
    googleAnalyticsId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
};

export function getServerUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === "production") {
    return "https://artsfashion.com";
  }
  return "http://localhost:3111";
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