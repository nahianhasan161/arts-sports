import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Oswald, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "./sport-buttons.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Drawers } from "@/components/layout/Drawers";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ClientProviders } from "@/components/ClientProviders";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";
import { AnalyticsTracker } from "@/components/seo/AnalyticsTracker";
import { Pixels } from "@/components/seo/Pixels";
import { getServerUrl } from "@/lib/config";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { FileDropBridge } from "@/components/FileDropBridge";
import { PREFERENCES_SCRIPT } from "@/lib/theme";

/*
 * Fonts are downloaded at build time and served from our own domain. Not
 * preloaded: text shows in the phone's own font first, and the page's code and
 * pictures are not held up behind font files. Each Bangla weight is about
 * 70 KB, so only two are loaded: 500 shows as 400, 600 as 700.
 */
const hind = Hind_Siliguri({ weight: ["400", "700"], subsets: ["bengali", "latin"], display: "swap", preload: false, variable: "--nf-hind" });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false, variable: "--nf-oswald" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--nf-jakarta" });

const fontSans = `font-sans ${hind.variable} ${oswald.variable} ${jakarta.variable}`;

export const metadata: Metadata = {
  title: {
    default: "Arts Sports | Custom jerseys, sportswear and gear",
    template: "%s | Arts Sports",
  },
  description:
    "Custom team jerseys with names, numbers and logo from 1 piece, plus jerseys, sportswear and sports gear. Delivery all over Bangladesh, cash on delivery.",
  keywords: ["Arts Sports", "custom jersey", "team jersey", "sports jersey", "football", "cricket", "badminton", "sports gear", "Bangladesh"],
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
  // No canonical here: every page would inherit it and point at the home page.
  openGraph: {
    type: "website",
    locale: "bn_BD",
    url: getServerUrl(),
    siteName: "Arts Sports",
    title: "Arts Sports | Custom jerseys, sportswear and gear",
    description:
      "Custom team jerseys with names, numbers and logo from 1 piece, plus jerseys, sportswear and sports gear. Delivery all over Bangladesh, cash on delivery.",
    images: [
      {
        url: "/og-cover.jpg",
        width: 1200,
        height: 630,
        alt: "Arts Sports",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arts Sports | Custom jerseys, sportswear and gear",
    description:
      "Custom team jerseys with names, numbers and logo from 1 piece, plus jerseys, sportswear and sports gear. Delivery all over Bangladesh, cash on delivery.",
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
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        <link rel="dns-prefetch" href="https://cdn.supabase.co" />
      </head>
      <body className="bg-surface font-body text-on-surface antialiased min-h-screen flex flex-col">
        <AuthProvider>
          <ClientProviders>
            <FileDropBridge />
            <AnalyticsTracker />
            <Pixels />
            <SiteChrome
              header={<Header />}
              footer={<Footer />}
              overlays={<Drawers />}
            >
              {children}
            </SiteChrome>
          </ClientProviders>
        </AuthProvider>
      </body>
    </html>
  );
}
