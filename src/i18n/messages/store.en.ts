/**
 * Storefront shop list, product cards and product page. English.
 * store.bn.ts is typed against this file and must have the same keys.
 */
export const storeEn = {
  shop: {
    home: "Home",
    shop: "Shop",
    allProducts: "All products",
    allTitle: "Shop all",
    collection: "{name}",
    searchTitle: "Results for “{q}”",
    subtitle: "Jerseys, sportswear and accessories. Delivery all over Bangladesh, cash on delivery available.",
    showing: "Showing {shown} of {total}",
    facets: {
      team: "Team",
      league: "League",
      edition: "Edition",
      season: "Season",
      player: "Player",
      brand: "Brand",
    },
  },
  banner: {
    eyebrow: "Custom jersey",
    title: "Your team’s own kit",
    text: "Pick a design or send your own. Names, numbers and logo on every shirt, from just 1 piece.",
    cta: "Design yours",
    cta2: "Browse designs",
  },
  card: {
    quickAdd: "Quick add",
    wishlist: "Add to wishlist",
    off: "{percent}% off",
  },
  pdp: {
    save: "Save {amount} ({percent}% off)",
    soldOut: "Sold out",
    sizeSoldOut: "Size {size} sold out",
    unavailable: "Currently unavailable",
    inStock: "{count} in stock",
    inStockSize: "{count} in stock · size {size}",
    color: "Colour",
    colors: "{count} colours",
    size: "Size",
    chest: "Chest {value}″",
    sizeGuide: "Size guide",
    inclusive: "All-inclusive price. Cash on delivery all over Bangladesh.",
    addToCart: "Add to cart · {price}",
    buyNow: "Buy now",
  },
};

export type StoreMessages = typeof storeEn;
