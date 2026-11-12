import type { RosterRow, Sleeve } from "./types";

/**
 * Team list import: CSV, pasted cells from Excel/Sheets (tab separated) and
 * .xlsx files. Runs in the browser; nothing is uploaded.
 *
 * Columns are found by their header (name, number, size, sleeve, in English
 * or Bangla). Without a header row the order is: name, number, size, sleeve.
 */

export const MAX_ROSTER = 500;

const HEADERS: Record<keyof RosterRow, RegExp> = {
  player_name: /^(player\s*)?name$|নাম/i,
  player_number: /^(no\.?|number|num|jersey\s*(no\.?|number)|#)$|নম্বর|নাম্বার/i,
  size: /^size$|সাইজ|মাপ/i,
  sleeve: /sleeve|হাতা/i,
};

function toAsciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

function parseSleeve(raw: string, fallback: Sleeve): Sleeve {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (/full|long|ফুল|লম্বা/.test(v)) return "full";
  if (/short|half|হাফ|ছোট/.test(v)) return "short";
  return fallback;
}

/** Splits delimited text into rows of cells, honouring "quoted, cells". */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface RosterImport {
  rows: RosterRow[];
  /** Rows left out because they had no size, or were past the limit. */
  skipped: number;
}

export function rowsToRoster(cells: string[][], defaultSleeve: Sleeve = "short"): RosterImport {
  if (cells.length === 0) return { rows: [], skipped: 0 };

  const header = cells[0].map((c) => c.trim());
  const columns: Partial<Record<keyof RosterRow, number>> = {};
  for (const key of Object.keys(HEADERS) as (keyof RosterRow)[]) {
    const index = header.findIndex((h) => HEADERS[key].test(h));
    if (index !== -1) columns[key] = index;
  }
  const hasHeader = Object.keys(columns).length >= 2 || columns.size !== undefined;
  const col = hasHeader
    ? columns
    : ({ player_name: 0, player_number: 1, size: 2, sleeve: 3 } satisfies Record<keyof RosterRow, number>);
  const body = hasHeader ? cells.slice(1) : cells;

  const rows: RosterRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const get = (key: keyof RosterRow) => (col[key] === undefined ? "" : (r[col[key]!] ?? "").trim());
    const size = get("size").toUpperCase().replace(/\s+/g, "").slice(0, 12);
    if (!size || rows.length >= MAX_ROSTER) {
      skipped++;
      continue;
    }
    rows.push({
      player_name: get("player_name").slice(0, 40),
      player_number: toAsciiDigits(get("player_number")).replace(/\.0+$/, "").slice(0, 4),
      size,
      sleeve: parseSleeve(get("sleeve"), defaultSleeve),
    });
  }
  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// .xlsx: a zip of XML files. Only the first sheet's text and numbers are read,
// which needs the zip directory, the browser's own inflate and two XML files.
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  // End of central directory: search backwards for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Not an .xlsx file");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(start, start + compressedSize);
    const content = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
    if (content) files.set(name, decoder.decode(content));
  }
  return files;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot read .xlsx files. Save the sheet as CSV and upload that.");
  }
  const files = await unzip(buffer, (name) => name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sheetName = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!sheetName) throw new Error("No sheet found in the file");

  const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
  const shared: string[] = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const si of Array.from(xml(sharedXml).getElementsByTagName("si"))) {
      shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
    }
  }

  const rows: string[][] = [];
  for (const rowEl of Array.from(xml(files.get(sheetName)!).getElementsByTagName("row"))) {
    const row: string[] = [];
    for (const c of Array.from(rowEl.getElementsByTagName("c"))) {
      const index = columnIndex(c.getAttribute("r") ?? "A1");
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let value = v;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
      row[index] = value;
    }
    rows.push(Array.from(row, (cell) => cell ?? ""));
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export async function importRosterFile(file: File, defaultSleeve: Sleeve = "short"): Promise<RosterImport> {
  if (file.size > 5 * 1024 * 1024) throw new Error("The file is over 5 MB");
  const isXlsx = /\.xlsx$/i.test(file.name);
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported. Save it as .xlsx or CSV.");
  const cells = isXlsx ? await parseXlsx(await file.arrayBuffer()) : parseDelimited(await file.text());
  return rowsToRoster(cells, defaultSleeve);
}

export const ROSTER_SAMPLE_CSV = "Name,Number,Size,Sleeve\nRAHIM,10,M,Short\nKARIM,7,L,Full\n";
