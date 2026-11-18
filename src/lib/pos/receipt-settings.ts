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
  return out;
}
