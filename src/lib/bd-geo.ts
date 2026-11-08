import geo from "@/data/bd-geo.json";

/**
 * Bangladesh divisions -> districts -> thanas/upazilas for the checkout
 * address picker. Source: nuhil/bangladesh-geocode, plus the Dhaka city
 * (DMP) thanas, which that list does not have. A thana flagged with 1 is
 * inside Dhaka city and pays the Dhaka delivery charge.
 */

type RawThana = [string, string] | [string, string, number];
type RawDistrict = { n: string; bn: string; t: RawThana[] };
type RawDivision = { n: string; bn: string; d: RawDistrict[] };

export interface GeoOption {
  name: string;
  bn: string;
}

const DATA = geo as RawDivision[];

export const DIVISIONS: GeoOption[] = DATA.map((d) => ({ name: d.n, bn: d.bn }));

export function districtsOf(division: string): GeoOption[] {
  return DATA.find((d) => d.n === division)?.d.map((x) => ({ name: x.n, bn: x.bn })) ?? [];
}

export function thanasOf(division: string, district: string): (GeoOption & { dhakaCity: boolean })[] {
  const dist = DATA.find((d) => d.n === division)?.d.find((x) => x.n === district);
  return dist?.t.map((t) => ({ name: t[0], bn: t[1], dhakaCity: t[2] === 1 })) ?? [];
}

/** The built-in list of thanas that count as inside Dhaka. */
export const DHAKA_CITY_THANAS: string[] = DATA.flatMap((d) =>
  d.d.flatMap((x) => (x.n === "Dhaka" ? x.t.filter((t) => t[2] === 1).map((t) => t[0]) : []))
);

/** Admin override (app_settings.dhaka_inside_thanas, a JSON array), or the built-in list. */
export function parseDhakaOverride(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.every((x) => typeof x === "string") && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

/** True when the delivery is charged at the Dhaka rate. */
export function isInsideDhaka(district: string, thana: string, override?: string[] | null): boolean {
  if (district !== "Dhaka") return false;
  const list = override ?? DHAKA_CITY_THANAS;
  return list.some((t) => t.toLowerCase() === thana.toLowerCase());
}

export function isValidLocation(division: string, district: string, thana: string): boolean {
  return thanasOf(division, district).some((t) => t.name === thana);
}

/**
 * Rough delivery window, shown at checkout. Couriers take 1-2 days inside
 * Dhaka and 2-4 outside, and Friday is a day off for most of them.
 */
export function deliveryWindow(insideDhaka: boolean, from = new Date()): { start: Date; end: Date } {
  const addWorkingDays = (date: Date, days: number) => {
    const d = new Date(date);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 5) added++;
    }
    return d;
  };
  return insideDhaka
    ? { start: addWorkingDays(from, 1), end: addWorkingDays(from, 2) }
    : { start: addWorkingDays(from, 2), end: addWorkingDays(from, 4) };
}
