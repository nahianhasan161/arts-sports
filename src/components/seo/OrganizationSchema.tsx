import { getServerUrl } from "@/lib/config";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Arts Sports",
  url: getServerUrl(),
  logo: `${getServerUrl()}/main-logo-arts-sports.webp`,
  description:
    "Arts Sports — Premium everyday apparel crafted from combed compact organic cotton. Handcrafted for daylong comfort.",
  foundingDate: "2020",
  foundingLocation: "Dhaka, Bangladesh",
  address: {
    "@type": "PostalAddress",
    streetAddress: "123, Sector 4, Mirpur",
    addressLocality: "Dhaka",
    postalCode: "1216",
    addressCountry: "BD",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+880-1700-000000",
    contactType: "Customer Service",
    email: "support@artssports.com",
    availableLanguage: ["en", "bn"],
  },
  sameAs: [
    "https://www.facebook.com/artssports",
    "https://www.instagram.com/artssports",
    "https://www.tiktok.com/@artssports",
    "https://www.linkedin.com/company/artssports",
  ],
  makesOffer: {
    "@type": "Offer",
    category: "Clothing",
    itemCondition: "https://schema.org/NewCondition",
  },
  areaServed: {
    "@type": "Country",
    name: "Bangladesh",
  },
  slogan: "Premium Everyday Apparel",
  priceRange: "$$",
};

export function OrganizationSchema() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
    />
  );
}