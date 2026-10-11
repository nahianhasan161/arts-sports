/** @type {import('next').NextConfig} */

/**
 * Uploaded product media is served from Tigris.
 *
 * While the bucket is private, publicUrlFor() returns same-origin /api/media
 * paths, which next/image needs no allowance for. Once TIGRIS_STORAGE_PUBLIC
 * is turned on the URLs point at the Tigris host, and the host has to be listed
 * here or next/image rejects every uploaded image on the storefront.
 *
 * The host is read from the endpoint rather than hardcoded, so a custom domain
 * or a different Tigris host needs no edit to this file. The Supabase host is
 * kept because rows written before the migration still carry Supabase URLs, and
 * those products have to keep rendering.
 */
const hostOf = (url) => {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
};

const tigrisStorageHost = hostOf(process.env.TIGRIS_STORAGE_ENDPOINT ?? "");
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
    // HSTS. Vercel terminates TLS for us, so this only takes effect once the
    // site is deployed over HTTPS — where it stops a downgrade attack.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  images: {
    remotePatterns: [
      ...(tigrisStorageHost ? [{ protocol: "https", hostname: tigrisStorageHost }] : []),
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
