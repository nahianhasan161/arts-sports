/**
 * Where a visitor came from, kept in the browser so the order can carry it.
 *
 * The first visit with UTM tags or an fbclid is kept for 30 days and is not
 * overwritten by plain visits, so "came from the Friday ad, bought on Sunday
 * by typing the address" still counts for the ad. A new tagged visit replaces it.
 */

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  landing_page?: string;
  referrer?: string;
  at?: number;
}

const KEY = "as_attribution";
const DEVICE_KEY = "as_device";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: attribution is best effort.
  }
}

/** Call once per page load. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const tagged = FIELDS.some((f) => params.get(f));
  const existing = getAttribution();
  if (!tagged && existing) return;
  if (!tagged && document.referrer && new URL(document.referrer).host === window.location.host) return;

  const next: Attribution = { at: Date.now(), landing_page: window.location.pathname + window.location.search };
  for (const f of FIELDS) {
    const v = params.get(f);
    if (v) next[f] = v.slice(0, 200);
  }
  if (document.referrer) next.referrer = document.referrer.slice(0, 300);
  safeSet(KEY, JSON.stringify(next));

  // Meta reads the click id from the _fbc cookie for matching.
  const fbclid = params.get("fbclid");
  if (fbclid) {
    document.cookie = `_fbc=fb.1.${Date.now()}.${encodeURIComponent(fbclid)}; path=/; max-age=${90 * 86400}; SameSite=Lax`;
  }
}

export function getAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  const raw = safeGet(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed.at || Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A random id per browser, used to spot many orders from one device. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
