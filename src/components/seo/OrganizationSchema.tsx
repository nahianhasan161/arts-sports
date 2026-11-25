import { getServerUrl } from "@/lib/config";
import { SOCIAL_LINKS, STORE_EMAIL, STORE_PHONE } from "@/lib/nav";

/** Only what is true of the shop: the same phone, email and pages the site shows. */
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Arts Sports",
  url: getServerUrl(),
  logo: `${getServerUrl()}/main-logo-arts-sports.webp`,
  description: "Custom team jerseys, sportswear and sports gear in Bangladesh.",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: STORE_PHONE,
    contactType: "customer service",
    email: STORE_EMAIL,
    availableLanguage: ["en", "bn"],
  },
  ...(SOCIAL_LINKS.length > 0 && { sameAs: SOCIAL_LINKS.map((l) => l.href) }),
  areaServed: { "@type": "Country", name: "Bangladesh" },
};

export function OrganizationSchema() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
    />
  );
}
