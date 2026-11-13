import qrcode from "qrcode-generator";

/**
 * Barcode (Code 128, set B) and QR code drawing, as plain SVG data so the
 * labels and receipts print sharply from the browser on any printer.
 */

// Bar/space widths for symbols 0–106 (106 is the stop symbol).
const PATTERNS =
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(
    " "
  );

const START_B = 104;
const STOP = 106;

/** Text a Code 128 B barcode can carry: printable ASCII only. */
export function isBarcodeText(value: string): boolean {
  return value.length > 0 && value.length <= 40 && /^[\x20-\x7e]+$/.test(value);
}

export interface Bars {
  /** x and width of every black bar, in modules. */
  rects: { x: number; w: number }[];
  /** Total width in modules, including the quiet zones. */
  width: number;
}

export function code128(value: string): Bars | null {
  if (!isBarcodeText(value)) return null;
  const symbols = [START_B];
  let sum = START_B;
  for (let i = 0; i < value.length; i++) {
    const v = value.charCodeAt(i) - 32;
    symbols.push(v);
    sum += v * (i + 1);
  }
  symbols.push(sum % 103, STOP);

  const quiet = 10;
  const rects: Bars["rects"] = [];
  let x = quiet;
  for (const s of symbols) {
    const pattern = PATTERNS[s];
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]);
      if (i % 2 === 0) rects.push({ x, w });
      x += w;
    }
  }
  return { rects, width: x + quiet };
}

export interface QrMatrix {
  size: number;
  /** SVG path of every dark module, one unit per module. */
  path: string;
}

export function qrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { size, path };
}
