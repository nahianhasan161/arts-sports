/**
 * Which sports "frame" each product card wears (components/product/SportCard.tsx).
 * A card's sport decides the frames it may use; within a grid the least recently
 * used one is taken, so neighbours differ and no colour takes over.
 */

export type SportFrame =
  | "yellow"
  | "red"
  | "tactics"
  | "ticket"
  | "scoreboard"
  | "locker"
  | "wicket"
  | "ball"
  | "net"
  | "netblue"
  | "hoop";

/** Longer than the widest grid or of a length that does not line up with its columns. */
const FRAMES: [RegExp | null, SportFrame[]][] = [
  [/basketball|basket ball|বাস্কেটবল/, ["hoop", "scoreboard", "ticket", "locker", "tactics"]],
  [/badminton|shuttle|ব্যাডমিন্টন|শাটল/, ["net", "ticket", "netblue", "scoreboard", "locker"]],
  [/cricket|batting|bowling|ক্রিকেট|ব্যাটিং/, ["wicket", "scoreboard", "ball", "ticket", "locker"]],
  [/football|futsal|soccer|goalkeeper|ফুটবল|ফুটসাল/, ["yellow", "tactics", "ticket", "red", "scoreboard", "locker"]],
  [null, ["locker", "ticket", "tactics", "yellow", "scoreboard", "red"]],
];

/** Bangla letters can be one character or two, so both sides are put in the same form. */
const RULES = FRAMES.map(([re, frames]) => [re && new RegExp(re.source.normalize("NFC")), frames] as const);

function framesFor(words: string): SportFrame[] {
  const text = words.toLowerCase().replace(/[-_]+/g, " ").normalize("NFC");
  return (RULES.find(([re]) => !re || re.test(text)) ?? RULES[RULES.length - 1])[1];
}

/**
 * One frame per card, in grid order. `words` is each card's category and title.
 * Left to right only, so adding cards at the end never changes earlier ones.
 * `start` shifts the order, so two grids on one page do not open the same way.
 */
export function assignFrames(words: string[], start = 0): SportFrame[] {
  const lastUsed = new Map<SportFrame, number>();
  return words.map((w, i) => {
    const list = framesFor(w);
    let best = list[start % list.length];
    for (let k = 0; k < list.length; k++) {
      const frame = list[(start + k) % list.length];
      if ((lastUsed.get(frame) ?? -1) < (lastUsed.get(best) ?? -1)) best = frame;
    }
    lastUsed.set(best, i);
    return best;
  });
}

type Named = { title: string; category?: string | null; sub_category?: string | null };
export const frameWords = (p: Named) => [p.sub_category, p.category, p.title].filter(Boolean).join(" ");
