import { parseDelimited } from "@/lib/custom-jersey/roster";

/**
 * Turns pasted text into spec pairs, so a whole list goes in with one paste.
 *
 * Accepts what people actually copy:
 *  - cells from Google Sheets / Excel (name and value in two columns, tab separated)
 *  - one product row from a sheet: names in the first row, values in the second
 *  - "Brand: VE" / "Brand - VE" / "Brand = VE" lines
 *  - a Markdown table (| Brand | VE |)
 *  - just names, one per line (rows to fill in later)
 * A first row that is a heading ("Specification | কী লিখবে") is dropped.
 */
export interface SpecPair {
  key: string;
  value: string;
}

const HEADING_KEY = /^(specs?|specifications?|spec name|name|key|field|attribute|স্পেসিফিকেশন|বৈশিষ্ট্য|নাম)$/i;
const HEADING_VALUE = /^(value|values|details?|কী লিখবে|মান|বিবরণ|তথ্য)$/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** True when pasting this into a spec box should fill many rows instead of one box. */
export function looksLikeSpecList(text: string): boolean {
  return /\t|\r?\n/.test(text.trim());
}

export function parseSpecPaste(text: string): SpecPair[] {
  const raw = text.replace(/^﻿/, "").trim();
  if (!raw) return [];

  let pairs: SpecPair[];
  if (raw.includes("\t")) {
    const rows = parseDelimited(raw).map((r) => r.map(clean));
    // A sheet row copied sideways: names on top, values under them.
    const wide = rows.length === 2 && rows[0].filter(Boolean).length >= 3 && rows[0].length >= rows[1].length;
    if (wide) {
      pairs = rows[0].map((key, i) => ({ key, value: rows[1][i] ?? "" }));
    } else {
      pairs = rows.map((r) => {
        const cells = r.filter(Boolean);
        return { key: cells[0] ?? "", value: cells.slice(1).join(" ") };
      });
    }
  } else {
    pairs = [];
    for (const line of raw.split(/\r?\n|;\s*(?=[^;]+[:=])/)) {
      const l = line.trim();
      if (!l) continue;
      if (/^\|?\s*:?-{2,}/.test(l)) continue; // Markdown table rule
      if (l.startsWith("|")) {
        const cells = l.split("|").map(clean).filter(Boolean);
        pairs.push({ key: cells[0] ?? "", value: cells.slice(1).join(" ") });
        continue;
      }
      const m = l.match(/^(.+?)\s*(?::|：|=|\s[-–—]\s)\s*(.*)$/);
      // Strip a leading bullet ("• Brand: VE", "- Brand: VE", "1. Brand: VE").
      const strip = (s: string) => clean(s.replace(/^(?:[-•*·]|\d+[.)])\s+/, ""));
      pairs.push(m ? { key: strip(m[1]), value: clean(m[2]) } : { key: strip(l), value: "" });
    }
  }

  pairs = pairs.filter((p) => p.key || p.value);
  if (pairs.length > 0 && (HEADING_KEY.test(pairs[0].key) || HEADING_VALUE.test(pairs[0].value))) pairs.shift();

  // One row per name: a later row with the same name wins.
  const byKey = new Map<string, SpecPair>();
  for (const p of pairs) {
    const k = p.key.slice(0, 80);
    byKey.set(k.toLowerCase(), { key: k, value: p.value.slice(0, 500) });
  }
  return [...byKey.values()].filter((p) => p.key);
}

/** Spec rows as tab-separated text, ready to paste into a sheet or another product. */
export function specsToText(pairs: SpecPair[]): string {
  return pairs
    .filter((p) => p.key.trim())
    .map((p) => `${p.key.trim()}\t${p.value.trim()}`)
    .join("\n");
}
