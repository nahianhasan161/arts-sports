/**
 * The 20-digit number on a product label. The label's QR code carries this
 * number (older labels carry it in a Code 128 barcode), so a scan at the counter
 * reads it and the register turns it back into the item (see labelHead / labelScanHead).
 *
 *   digits 1-8  = "head": the barcode's own 8 digits (AS12345678 -> 12345678),
 *                 or, for a code that isn't AS + 8 digits, 8 digits worked out
 *                 from the code. This is what identifies the item.
 *   next 4 (5)  = staff-only price mark: buying price + 50 (0000 when unknown,
 *                 5 digits when the mark is 10000 or more).
 *   the rest    = filler worked out from the code, the same on every print.
 *
 * The price part does not take part in the lookup, so a label keeps scanning
 * after the buying price changes.
 */
export const PRICE_MARK_ADD = 50;
export const LABEL_DIGITS = 20;

/** Digits worked out from the text (FNV-1a), so a code always gets the same ones. */
function hashDigits(text: string, length: number): string {
  let out = "";
  let h = 2166136261;
  for (let round = 0; out.length < length; round++) {
    for (const ch of `${text}#${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += String(h).padStart(10, "0");
  }
  return out.slice(0, length);
}

/** The 8 digits that stand for a code on its label. */
export function labelHead(code: string): string {
  const m = /^AS(\d{8})$/i.exec(code.trim());
  return m ? m[1] : hashDigits(code.trim().toLowerCase(), 8);
}

/**
 * The label number for a code and its buying price: `bars` (20 digits, what
 * the barcode carries) and `text` (the same, printed in groups of 4 with the
 * price mark kept as one group).
 */
export function labelNumber(code: string, cost: number | null): { bars: string; text: string } {
  const mark = cost === null || !Number.isFinite(cost) || cost <= 0 ? "0000" : String(Math.round(cost) + PRICE_MARK_ADD).padStart(4, "0");
  const head = labelHead(code);
  const tail = hashDigits(`${code}:tail`, LABEL_DIGITS - head.length - mark.length);
  return { bars: head + mark + tail, text: [head.slice(0, 4), head.slice(4), mark, ...(tail.match(/.{1,4}/g) ?? [])].join(" ") };
}

/** When a scanned/typed term is a label number, its 8-digit head; otherwise null. */
export function labelScanHead(term: string): string | null {
  const digits = term.replace(/\s+/g, "");
  return /^\d{20}$/.test(digits) ? digits.slice(0, 8) : null;
}

/** Server side: a label number whose head came from an AS barcode, as that barcode. */
export function labelToBarcode(term: string): string | null {
  const head = labelScanHead(term);
  return head ? `AS${head}` : null;
}
