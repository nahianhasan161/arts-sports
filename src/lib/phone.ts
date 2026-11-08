/**
 * Bangladeshi mobile numbers. One customer = one number, always stored as
 * 01XXXXXXXXX (11 digits). The database has the same rule in
 * public.normalize_bd_phone(), so both sides agree on who a customer is.
 */

/** Operator prefixes 013–019. */
const LOCAL = /^01[3-9]\d{8}$/;

/**
 * Returns 01XXXXXXXXX, or null when the input is not a BD mobile.
 * Accepts +8801…, 8801…, 008801…, 01…, with spaces, dashes, dots or brackets,
 * and Bangla digits (০১৭…).
 */
export function normalizeBdPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ascii = raw.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
  let digits = ascii.replace(/[^\d]/g, "");
  if (digits.startsWith("00880")) digits = digits.slice(4);
  else if (digits.startsWith("880")) digits = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return LOCAL.test(digits) ? digits : null;
}

export function isBdPhone(raw: string | null | undefined): boolean {
  return normalizeBdPhone(raw) !== null;
}

/** 8801XXXXXXXXX, the form wa.me and SMS gateways want. */
export function toInternational(phone: string): string | null {
  const local = normalizeBdPhone(phone);
  return local ? `88${local}` : null;
}
