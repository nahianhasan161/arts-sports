import type { Product } from "@/types";
import { getServerUrl } from "@/lib/config";

/**
 * Home page structured data: the site (with its search, so Google and AI
 * tools know /shop?q= is the search) and the newest products as a list.
 * Product markup itself belongs only on product pages.
 */
export function HomeSchema({ products }: { products: Product[] }) {
  const site = getServerUrl().replace(/\/+$/, "");
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${site}/#website`,
      url: site,
      name: "Arts Sports",
      alternateName: ["আর্টস স্পোর্টস", "ArtsSports"],
      inLanguage: ["bn-BD", "en"],
      publisher: { "@id": `${site}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${site}/shop?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    ...(products.length > 0
      ? [
          {
            "@type": "ItemList",
            name: "New arrivals",
            itemListElement: products.slice(0, 10).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${site}/products/${encodeURIComponent(p.slug)}`,
              name: p.title,
            })),
          },
        ]
      : []),
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c"),
      }}
    />
  );
}
