/**
 * The order sizes are shown in: clothing sizes smallest first (XS before S),
 * numbers low to high, anything else as entered. Safe on server and client.
 */
export const CLOTHING_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL"];

const rank = (s: string) => CLOTHING_SIZES.indexOf(s.trim().toUpperCase());

/** Sorted copy. Only reorders when every entry is a clothing size or every entry is a number. */
export function sortSizes<T>(items: T[], key: (item: T) => string): T[] {
  const labels = items.map(key);
  if (labels.length > 1 && labels.every((l) => rank(l) >= 0)) {
    return [...items].sort((a, b) => rank(key(a)) - rank(key(b)));
  }
  if (labels.length > 1 && labels.every((l) => /^\d+(\.\d+)?$/.test(l.trim()))) {
    return [...items].sort((a, b) => Number(key(a)) - Number(key(b)));
  }
  return items;
}
