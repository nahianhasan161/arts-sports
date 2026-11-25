/**
 * Which sports "frame" a product card wears (components/product/SportCard.tsx).
 * Three kinds, one per sport, so a grid stays calm and the frame says something.
 */

export type SportFrame = "scoreboard" | "locker" | "ticket";

const FRAMES: [RegExp, SportFrame][] = [
  [/badminton|shuttle|racket|ব্যাডমিন্টন|শাটল|র‍্যাকেট/, "locker"],
  [/cricket|batting|bowling|ক্রিকেট|ব্যাটিং/, "ticket"],
  [/football|futsal|soccer|goalkeeper|ফুটবল|ফুটসাল/, "scoreboard"],
];

/** Bangla letters can be one character or two, so both sides are put in the same form. */
const RULES = FRAMES.map(([re, frame]) => [new RegExp(re.source.normalize("NFC")), frame] as const);

/** The frame for a card, from its category and title. */
export function frameFor(words: string): SportFrame {
  const text = words.toLowerCase().replace(/[-_]+/g, " ").normalize("NFC");
  return RULES.find(([re]) => re.test(text))?.[1] ?? "ticket";
}

type Named = { title: string; category?: string | null; sub_category?: string | null };
export const frameWords = (p: Named) => [p.sub_category, p.category, p.title].filter(Boolean).join(" ");
