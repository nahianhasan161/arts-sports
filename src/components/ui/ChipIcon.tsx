import type { ComponentType, ReactNode } from "react";
import {
  Backpack,
  CalendarDays,
  Dumbbell,
  Flag,
  HardHat,
  LayoutGrid,
  Palette,
  Shapes,
  Shield,
  Shirt,
  SportShoe,
  Star,
  Tag,
  Trophy,
  UserRound,
  Volleyball,
} from "lucide-react";
import type { TermType } from "@/lib/services/catalog";

/**
 * The small icon in front of a filter chip. Staff name the categories, so the
 * icon is picked from words in the slug and name (English or Bangla); a name
 * nothing matches gets the caller's fallback.
 */

type IconProps = { className?: string };
export type ChipIconType = ComponentType<IconProps>;

/** Line drawings lucide does not have, in its style (24 grid, currentColor). */
function line(children: ReactNode): ChipIconType {
  return function LineIcon({ className }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden focusable="false">
        {children}
      </svg>
    );
  };
}

const Football = line(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 7.500l4.300 3.100-1.600 5H9.300l-1.600-5z" fill="currentColor" />
    <path d="M12 7.500v-5M16.300 10.600L21.200 9M14.700 15.600l3 4.300M9.300 15.600l-3 4.300M7.700 10.600L2.800 9" />
  </>
);
const Cricket = line(
  <>
    <path d="M21 3l-4.500 4.500" />
    <path d="M14.700 5.700l3.600 3.600-11 11a2.550 2.550 0 0 1-3.600-3.600z" />
    <circle cx="18.500" cy="18.500" r="2.500" />
  </>
);
const Shuttle = line(
  <>
    <path d="M9 15L5 4l3.500 1.500L12 4l3.500 1.500L19 4l-4 11" />
    <path d="M12 4v11M7.200 10h9.600" />
    <path d="M9 15h6v2.500a3 3 0 0 1-6 0z" />
  </>
);
const Basketball = line(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2v20M2 12h20M5 5a10 10 0 0 1 0 14M19 5a10 10 0 0 0 0 14" />
  </>
);
const Racket = line(
  <>
    <circle cx="14.500" cy="9.500" r="7" />
    <path d="M9.500 14.500L3 21M12 3v13M17 3v13M8 7h13M8 12h13" />
  </>
);
const Pant = line(<path d="M7 3h10l2 18h-5l-2-11-2 11H5zM6.600 7h10.800" />);
const TEE = "M20.400 3.500L16 2a4 4 0 0 1-8 0L3.600 3.500a2 2 0 0 0-1.300 2.200l.6 3.500a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.100a1 1 0 0 0 1-.8l.6-3.500a2 2 0 0 0-1.300-2.200z";
/** lucide's Shirt with a player's number. */
const Jersey = line(
  <>
    <path d={TEE} />
    <path d="M10 11h4l-2.500 6.500" />
  </>
);
const CollarShirt = line(
  <>
    <path d="M8 3L3 5.500 4.500 11H7v10h10V11h2.500L21 5.500 16 3l-4 4z" />
    <path d="M12 7v7M12 17.500v.01" />
  </>
);
const Hoodie = line(
  <>
    <path d="M8 4L4.500 6 2 19h4l1-6v8h10v-8l1 6h4L19.500 6 16 4" />
    <path d="M8 4a4 4 0 0 1 8 0l-2 4.500h-4zM9.500 21v-4h5v4" />
  </>
);
/** Long-sleeved shirt; lucide's Shirt is the short-sleeved one. */
export const FullSleeveIcon = line(
  <path d="M8 3L4.500 5 2 20h4l1.500-9v10h9V11l1.500 9h4L19.500 5 16 3a4 4 0 0 1-8 0z" />
);

/** First match wins: sports, then design styles, then kinds of product. */
const RULES: [RegExp, ChipIconType][] = [
  [/\b(basketball|basket ball)|বাস্কেটবল/, Basketball],
  [/\b(volleyball|volley)|ভলিবল/, Volleyball],
  [/\b(football|futsal|soccer|goalkeeper)|ফুটবল|ফুটসাল/, Football],
  [/\b(badminton|shuttle)|ব্যাডমিন্টন/, Shuttle],
  [/\bcricket|ক্রিকেট/, Cricket],
  [/\b(tennis|racket|racquet)|টেনিস|র‍্যাকেট|র‌্যাকেট/, Racket],
  [/\b(bats?|batting)\b|ব্যাট/, Cricket],
  [/\b(running|runner|marathon)|দৌড়|রানিং/, SportShoe],
  [/\b(gym|fitness|training|workout)|জিম|ফিটনেস/, Dumbbell],
  [/\bclubs?\b|ক্লাব/, Shield],
  [/\b(country|national|nation)|দেশ|জাতীয়/, Flag],
  [/\bdesigner|ডিজাইনার/, Palette],
  [/\bplayers?\b|প্লেয়ার|খেলোয়াড়/, UserRound],
  [/\b(special|limited|fan edition)|স্পেশাল|বিশেষ/, Star],
  [/\b(boots?|shoes?|sneakers?|trainers?)\b|জুতা|বুট/, SportShoe],
  [/\bhelmets?\b|হেলমেট/, HardHat],
  [/\b(pants?|trousers?|shorts|joggers?)\b|প্যান্ট|ট্রাউজার|শর্টস/, Pant],
  [/\b(accessor|bags?\b)|এক্সেসরিজ|ব্যাগ/, Backpack],
  [/\b(jerseys?|kits?)\b|জার্সি/, Jersey],
  [/\b(hoodies?|jackets?|casual)\b|ক্যাজুয়াল|হুডি|জ্যাকেট/, Hoodie],
  [/\b(t shirts?|tshirts?|tees?|wear|sportswear)\b|টি ?শার্ট/, Shirt],
  [/\b(shirts?|polos?)\b|শার্ট|পোলো/, CollarShirt],
  [/\bothers?\b|অন্যান্য/, Shapes],
];

/** Bangla য়/ড় can be one character or two, so both sides are put in the same form. */
const NORMAL_RULES = RULES.map(([re, Icon]) => [new RegExp(re.source.normalize("NFC")), Icon] as const);

const TERM_ICONS: Record<TermType, ChipIconType> = {
  team: Shield,
  league: Trophy,
  edition: Star,
  season: CalendarDays,
  player: UserRound,
  brand: Tag,
};

const SIZE = "w-3.5 h-3.5 shrink-0";

/** Icon for a category, sport or design style: pass its slug and names. */
export function ChipIcon({ of, fallback: Fallback = Tag, className = SIZE }: { of: (string | null | undefined)[]; fallback?: ChipIconType; className?: string }) {
  const text = of.filter(Boolean).join(" ").toLowerCase().replace(/[-_]+/g, " ").normalize("NFC");
  const Icon = NORMAL_RULES.find(([re]) => re.test(text))?.[1] ?? Fallback;
  return <Icon className={className} />;
}

/** Icon for an "All ..." chip. */
export function AllIcon({ className = SIZE }: IconProps) {
  return <LayoutGrid className={className} />;
}

/** Icon for a team / league / season ... chip. */
export function TermIcon({ type, className = SIZE }: IconProps & { type: TermType }) {
  const Icon = TERM_ICONS[type];
  return <Icon className={className} />;
}
