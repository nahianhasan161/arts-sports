/**
 * What the printed shop receipts show (sale + custom jersey receipts).
 * Stored as one JSON value under app_settings key `receipt_settings`.
 * An empty field means "use the default" (config / i18n text).
 */
export interface ReceiptSettings {
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Google Maps link (or "lat, lng") of the shop: the custom jersey "pick up" step shows the map. */
  map_url: string;
  /** Opening hours as typed, e.g. "Sat–Thu 10am–9pm". */
  hours: string;
  logo_url: string;
  show_logo: boolean;
  /** Under the items on a sale receipt (return / exchange rules). */
  terms: string;
  /** On a custom jersey receipt. */
  custom_terms: string;
  /** Last line, e.g. "Thank you". */
  footer: string;
}

export const RECEIPT_SETTINGS_KEY = "receipt_settings";

export const EMPTY_RECEIPT_SETTINGS: ReceiptSettings = {
  shop_name: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  map_url: "",
  hours: "",
  logo_url: "",
  show_logo: true,
  terms: "",
  custom_terms: "",
  footer: "",
};

const LIMITS: Record<Exclude<keyof ReceiptSettings, "show_logo">, number> = {
  shop_name: 120,
  address: 300,
  phone: 80,
  email: 120,
  website: 120,
  map_url: 500,
  hours: 120,
  logo_url: 500,
  terms: 2000,
  custom_terms: 2000,
  footer: 300,
};

/** Clean untrusted input (or a stored value) into a full settings object. */
export function parseReceiptSettings(raw: unknown): ReceiptSettings {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") obj = raw as Record<string, unknown>;
  const out: ReceiptSettings = { ...EMPTY_RECEIPT_SETTINGS };
  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const v = obj[key];
    if (typeof v === "string") out[key] = v.trim().slice(0, max);
  }
  if (typeof obj.show_logo === "boolean") out.show_logo = obj.show_logo;
  if (out.logo_url && !/^https?:\/\//i.test(out.logo_url) && !out.logo_url.startsWith("/")) out.logo_url = "";
  if (out.map_url && !/^https:\/\//i.test(out.map_url) && !MAP_POINT.test(out.map_url)) out.map_url = "";
  return out;
}

/** "23.8103, 90.4125": a map pin typed as latitude, longitude. */
const MAP_POINT = /^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/;

/**
 * Where the shop is on a map, from the address and the map field:
 *   link   opens Google Maps (the pasted link, else a search for the pin / address)
 *   embed  a Google Maps frame for the page (needs no key); null when there is nothing to show
 */
export function shopMap(s: Pick<ReceiptSettings, "map_url" | "address" | "shop_name">): { link: string; embed: string } | null {
  const point = MAP_POINT.test(s.map_url) ? s.map_url.replace(/\s+/g, "") : "";
  const query = point || [s.shop_name, s.address].filter(Boolean).join(", ");
  if (!point && !s.map_url && !s.address) return null;
  const search = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return {
    link: s.map_url && !point ? s.map_url : search,
    embed: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`,
  };
}
