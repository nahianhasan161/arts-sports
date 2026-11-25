/**
 * The sports the store is organised by (header, home page, /shop?sport=).
 * A product belongs to a sport when its category, sub-category or title has one
 * of the words, or when staff gave it the sport's key as a tag (e.g. "football"
 * on a club jersey whose name does not say football).
 */
export const STORE_SPORTS = ["football", "cricket", "badminton"] as const;
export type StoreSport = (typeof STORE_SPORTS)[number];

const WORDS: Record<StoreSport, string[]> = {
  football: ["football", "futsal", "soccer", "goalkeeper"],
  cricket: ["cricket", "batting", "bowling"],
  badminton: ["badminton", "shuttle", "racket"],
};

export function parseSport(value: unknown): StoreSport | null {
  return STORE_SPORTS.find((s) => s === value) ?? null;
}

/** The products of a sport, as a PostgREST `or` filter. */
export function sportFilter(sport: StoreSport): string {
  return [
    ...WORDS[sport].flatMap((w) => ["sub_category", "category", "title"].map((col) => `${col}.ilike.%${w}%`)),
    `tags.cs.{${sport}}`,
  ].join(",");
}

export const sportHref = (sport: StoreSport) => `/shop?sport=${sport}`;
/** Opens the jersey builder with the sport already chosen. */
export const sportJerseyHref = (sport: StoreSport) => `/custom-jersey?sport=${sport}#order`;
