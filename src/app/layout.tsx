import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { WishlistDrawer } from "@/components/wishlist/WishlistDrawer";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ClientProviders } from "@/components/ClientProviders";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";
import { AnalyticsTracker } from "@/components/seo/AnalyticsTracker";

const fontSans = "font-sans";

export const metadata: Metadata = {
  title: {
    default: "Arts Fashion | Premium Everyday Apparel",
    template: "%s | Arts Fashion",
  },
  description:
    "Arts Fashion • Combed Compact Organic Cotton • Regular Fit • Modern Commercial Fashion. Handcrafted for daylong comfort. Shop men's polos, t-shirts, trousers, and sports jerseys.",
  keywords: [
    "Arts Fashion",
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
  authors: [{ name: "Arts Fashion" }],
  creator: "Arts Fashion",
  publisher: "Arts Fashion",
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  metadataBase: new URL("https://artsfashion.com"),
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      "bn-BD": "/bn",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_BD",
    alternateLocale: ["bn_BD"],
    url: "https://artsfashion.com",
    siteName: "Arts Fashion",
    title: "Arts Fashion | Premium Everyday Apparel",
    description:
      "Combed Compact Organic Cotton • Regular Fit • Modern Commercial Fashion. Handcrafted for daylong comfort.",
    images: [
      {
        url: "/og-cover.jpg",
        width: 1200,
        height: 630,
        alt: "Arts Fashion — Minimalist Aura Collection",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@artsfashion",
    creator: "@artsfashion",
    title: "Arts Fashion | Premium Everyday Apparel",
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
    icon: "/fab.ico",
    apple: "/apple-touch-icon.png",
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
    <html lang="en" className={fontSans}>
      <head>
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
            <Script
              id="gtag-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments)}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || ''}');
                `,
              }}
            />
            {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
              <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
                async
              />
            )}
            <Header />
            <CartDrawer />
            <WishlistDrawer />
            <main className="flex-1 pt-[120px] lg:pt-[164px]">
              {children}
            </main>
            <Footer />
          </ClientProviders>
        </AuthProvider>
      </body>
    </html>
  );
}