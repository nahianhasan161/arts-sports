/**
 * Shop search words, shared by the server search and the header suggestions.
 *
 * Bangla is the default language, but many product names are English only
 * ("BRASIL JERSEY"), so a search for "জার্সি" also looks for "jersey" and the
 * other way round. Spellings people commonly type are listed too.
 */
const GROUPS: string[][] = [
  ["jersey", "jersy", "jersi", "জার্সি", "জার্সী"],
  ["football", "footbal", "soccer", "ফুটবল"],
  ["cricket", "criket", "ক্রিকেট"],
  ["badminton", "badmintion", "ব্যাডমিন্টন", "ব্যাডমিনটন"],
  ["bat", "ব্যাট"],
  ["ball", "বল"],
  ["racket", "racquet", "raket", "র‍্যাকেট", "রেকেট", "র্যাকেট"],
  ["shuttle", "shuttlecock", "শাটল", "শাটলকক", "কর্ক"],
  ["gloves", "glove", "গ্লাভস", "গ্লাভ"],
  ["pads", "pad", "প্যাড"],
  ["helmet", "হেলমেট"],
  ["boots", "boot", "shoe", "shoes", "বুট", "জুতা"],
  ["socks", "sock", "মোজা"],
  ["bag", "ব্যাগ"],
  ["grip", "গ্রিপ"],
  ["polo", "পোলো"],
  ["t-shirt", "tshirt", "tee", "টি-শার্ট", "টিশার্ট", "গেঞ্জি"],
  ["shirt", "শার্ট"],
  ["trouser", "pant", "pants", "ট্রাউজার", "প্যান্ট"],
  ["shorts", "শর্টস", "হাফপ্যান্ট"],
  ["kids", "kid", "child", "শিশু", "বাচ্চা", "বাচ্চাদের"],
  ["argentina", "আর্জেন্টিনা"],
  ["brazil", "brasil", "ব্রাজিল"],
  ["bangladesh", "বাংলাদেশ"],
  ["portugal", "পর্তুগাল"],
  ["germany", "জার্মানি"],
  ["spain", "স্পেন"],
  ["france", "ফ্রান্স"],
  ["england", "ইংল্যান্ড"],
  ["india", "ইন্ডিয়া", "ভারত"],
  ["pakistan", "পাকিস্তান"],
  ["custom", "কাস্টম"],
  ["training", "ট্রেনিং"],
  ["keeper", "goalkeeper", "গোলকিপার", "কিপার"],
  ["shin", "শিন"],
  ["string", "স্ট্রিং"],
  ["tape", "টেপ"],
];

const INDEX = new Map<string, string[]>();
for (const g of GROUPS) for (const w of g) INDEX.set(w.toLowerCase(), g);

/** Characters that would break a PostgREST filter or an ilike pattern. */
export function cleanTerm(raw: string): string {
  return raw.replace(/[,%()*\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * The whole phrase plus, for each word, the same word in the other language.
 * At most 8 patterns, longest first, so the filter stays short.
 */
export function searchTerms(raw: string): string[] {
  const term = cleanTerm(raw).toLowerCase();
  if (!term) return [];
  const out = new Set<string>([term]);
  const words = term.split(" ").filter((w) => w.length >= 2);
  for (const w of words) {
    const group = INDEX.get(w);
    if (group) group.forEach((x) => out.add(x));
    else if (words.length > 1) out.add(w);
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 8);
}

/** A PostgREST `or` filter matching any term in the product's own text. */
export function productTextFilter(terms: string[]): string {
  const cols = ["title", "title_bn", "short_description", "short_description_bn", "slug"];
  return terms.flatMap((t) => cols.map((c) => `${c}.ilike.%${t}%`)).join(",");
}
