import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { WishlistDrawer } from "@/components/wishlist/WishlistDrawer";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ClientProviders } from "@/components/ClientProviders";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";
import { AnalyticsTracker } from "@/components/seo/AnalyticsTracker";
import { Pixels } from "@/components/seo/Pixels";
import { getServerUrl } from "@/lib/config";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { PREFERENCES_SCRIPT } from "@/lib/theme";

const fontSans = "font-sans";

export const metadata: Metadata = {
  title: {
    default: "Arts Sports | Premium Everyday Apparel",
    template: "%s | Arts Sports",
  },
  description:
    "Arts Sports • Combed Compact Organic Cotton • Regular Fit • Modern Commercial Fashion. Handcrafted for daylong comfort. Shop men's polos, t-shirts, trousers, and sports jerseys.",
  keywords: [
    "Arts Sports",
    "premium apparel",
    "organic cotton",
    "polo t-shirts",
    "men's fashion",
    "Bangladesh",
    "combed cotton",
    "sports jersey",
    "custom t-shirts",
    "B2B wholesale",
  ],
  authors: [{ name: "Arts Sports" }],
  creator: "Arts Sports",
  publisher: "Arts Sports",
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  // One origin, from getServerUrl(). This was a literal that disagreed with
  // NEXT_PUBLIC_SITE_URL, so canonical tags and Open Graph URLs could name a
  // different domain than the sitemap and split the site's search signals.
  metadataBase: new URL(getServerUrl()),
  alternates: {
    canonical: "/",
    // The /bn route was listed as an alternate language but never existed,
    // so this declared a Bengali version of every page that returned a 404.
    // It is removed rather than pointed at a page that is not there.
  },
  openGraph: {
    type: "website",
    locale: "bn_BD",
    url: getServerUrl(),
    siteName: "Arts Sports",
    title: "Arts Sports | Premium Everyday Apparel",
    description:
      "Combed Compact Organic Cotton • Regular Fit • Modern Commercial Fashion. Handcrafted for daylong comfort.",
    images: [
      {
        url: "/og-cover.jpg",
        width: 1200,
        height: 630,
        alt: "Arts Sports — Minimalist Aura Collection",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@artssports",
    creator: "@artssports",
    title: "Arts Sports | Premium Everyday Apparel",
    description:
      "Combed Compact Organic Cotton • Regular Fit • Modern Commercial Fashion. Handcrafted for daylong comfort.",
    images: ["/og-cover.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_VERIFICATION_TOKEN,
    yandex: process.env.YANDEX_VERIFICATION_TOKEN,
  },
  icons: {
    // These used to point at /fab.ico and /apple-touch-icon.png, neither of
    // which is in public/ — so every browser tab showed a default icon and
    // every iOS home-screen save fell back to a screenshot.
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#091523" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Bangla is the main language. The script below switches to the saved
    // language and theme before the first paint, which is why the html tag
    // may differ from what the server sent (suppressHydrationWarning).
    <html lang="bn" className={fontSans} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
        <OrganizationSchema />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        <link rel="dns-prefetch" href="https://cdn.supabase.co" />
      </head>
      <body className="bg-surface font-body text-on-surface antialiased min-h-screen flex flex-col">
        <AuthProvider>
          <ClientProviders>
            <AnalyticsTracker />
            <Pixels />
            <SiteChrome
              header={<Header />}
              footer={<Footer />}
              overlays={
                <>
                  <CartDrawer />
                  <WishlistDrawer />
                </>
              }
            >
              {children}
            </SiteChrome>
          </ClientProviders>
        </AuthProvider>
      </body>
    </html>
  );
}
