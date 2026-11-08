/** @type {import('next').NextConfig} */

/**
 * Uploaded product media is stored in Cloudflare R2.
 *
 * With a private bucket, publicUrlFor() returns same-origin /api/media paths.
 * Once R2_PUBLIC_URL is set (an r2.dev address before launch, a custom domain
 * after), URLs point at that host, which is listed below. The Supabase host is
 * kept because rows written before the Tigris migration still carry Supabase
 * URLs, and those products have to keep rendering.
 *
 * Images are served unoptimized: the site runs on Cloudflare Workers, which
 * has no built-in next/image optimizer, and uploads are already resized to
 * WebP in the admin's browser before they are stored.
 */
const hostOf = (url) => {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
};

const r2PublicHost = hostOf(process.env.R2_PUBLIC_URL ?? "");
const supabaseStorageHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/**
 * Security response headers.
 *
 * The app shipped with none, so every response was missing the headers that
 * tell a browser how to treat the page. The additions are deliberately
 * conservative: strict CSP is a common way to break a Next.js app at runtime
 * (inline styles, next/image, GA4, and the media proxy all need allow-listing),
 * so the headers below are the ones that are safe to turn on everywhere and
 * that close real gaps: framing, content-type sniffing, referrer leakage, and
 * HSTS once HTTPS is confirmed.
 */
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Denied in a frame — clickjacking protection for the checkout and the
  // admin console, neither of which has any reason to be framed.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    // The storefront needs none of these. Granting them by default is an
    // unnecessary attack surface.
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // HSTS. Cloudflare terminates TLS for us, so this only takes effect once the
    // site is deployed over HTTPS — where it stops a downgrade attack.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      ...(r2PublicHost ? [{ protocol: "https", hostname: r2PublicHost }] : []),
      ...(supabaseStorageHost ? [{ protocol: "https", hostname: supabaseStorageHost }] : []),
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "contribution.usercontent.google.com",
      },
      {
        protocol: "https",
        hostname: "fabrilife.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // Next.js used to send `X-Powered-By: Next.js`, which advertises the
  // framework version to anyone who looks at a response header.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
