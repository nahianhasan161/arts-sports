import { getServerUrl } from "@/lib/config";
import { RETURN_DAYS, SOCIAL_LINKS, STORE_EMAIL, STORE_PHONE } from "@/lib/nav";

/**
 * Who the shop is, on every page. Only what is true of the shop: the same
 * phone, email, pages and return window the site shows. `OnlineStore` is the
 * type Google reads merchant details (returns, contact) from; the knowledge
 * panel and AI answers use the same block.
 */
const site = getServerUrl().replace(/\/+$/, "");

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "OnlineStore",
  "@id": `${site}/#organization`,
  name: "Arts Sports",
  alternateName: "আর্টস স্পোর্টস",
  url: site,
  logo: `${site}/main-logo-arts-sports.webp`,
  image: `${site}/og-cover.jpg`,
  description:
    "Online sports shop in Bangladesh: custom team jerseys with names, numbers and logo from 1 piece, plus jerseys, sportswear and sports accessories. Delivery all over Bangladesh, cash on delivery.",
  telephone: STORE_PHONE,
  email: STORE_EMAIL,
  currenciesAccepted: "BDT",
  paymentAccepted: "Cash on delivery, online payment",
  areaServed: { "@type": "Country", name: "Bangladesh" },
  address: { "@type": "PostalAddress", addressCountry: "BD", addressLocality: "Dhaka" },
  knowsAbout: ["Custom jerseys", "Football jerseys", "Cricket jerseys", "Sportswear", "Sports accessories", "Team kits"],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: STORE_PHONE,
    contactType: "customer service",
    email: STORE_EMAIL,
    areaServed: "BD",
    availableLanguage: ["bn", "en"],
  },
  hasMerchantReturnPolicy: {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "BD",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
    merchantReturnLink: `${site}/returns`,
  },
  ...(SOCIAL_LINKS.length > 0 && { sameAs: SOCIAL_LINKS.map((l) => l.href) }),
};

export function OrganizationSchema() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
    />
  );
}
