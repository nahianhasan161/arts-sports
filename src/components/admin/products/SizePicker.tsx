"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { SizeOption } from "@/types";

/**
 * Size / option picker for the product form. The size list mixes clothing,
 * shoe and accessory options (40+ rows), so it is shown one type at a time
 * (tabs), with a search across all types and the chosen ones in their own row.
 */

const TYPE_ORDER = ["clothing", "shoe", "footwear", "accessory"];

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer transition-colors";
const chipOff = "border-border-light text-text-muted hover:border-primary/40 hover:text-on-surface";
const chipOn = "border-primary bg-primary/10 text-primary font-semibold";

export const sizeLabel = (s: SizeOption) => s.display_name || s.name;
const typeOf = (s: SizeOption) => (s.type || "all").toLowerCase();
const typeLabel = (t: string) => (t === "all" ? "Any" : t.charAt(0).toUpperCase() + t.slice(1));

function sortTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a);
    const ib = TYPE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/**
 * The tab to open first: the type of a size already chosen, else a guess from
 * the category name (shoes / accessories), else the first type.
 */
export function guessSizeGroup(sizes: SizeOption[], selected: string[], categoryText: string): string {
  const types = sortTypes([...new Set(sizes.map(typeOf))]);
  const firstChosen = sizes.find((s) => selected.includes(s.id));
  if (firstChosen) return typeOf(firstChosen);
  const text = categoryText.toLowerCase();
  const want = /shoe|boot|sneaker|জুতা|বুট/.test(text)
    ? "shoe"
    : /accessor|bat|ball|racket|racquet|glove|shuttle|bag|এক্সেসরি|ব্যাট|বল|র‍্যাকেট/.test(text)
      ? "accessory"
      : /jersey|shirt|kit|wear|polo|short|trouser|hood|জার্সি|পোশাক/.test(text)
        ? "clothing"
        : "";
  if (want === "shoe" && !types.includes("shoe") && types.includes("footwear")) return "footwear";
  if (want && types.includes(want)) return want;
  return types[0] ?? "clothing";
}

export function SizePicker({
  sizes,
  selected,
  onToggle,
  onClear,
  group,
  onGroupChange,
}: {
  sizes: SizeOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  group: string;
  onGroupChange: (type: string) => void;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, SizeOption[]>();
    for (const s of sizes) {
      const t = typeOf(s);
      map.set(t, [...(map.get(t) ?? []), s]);
    }
    return sortTypes([...map.keys()]).map((t) => ({ type: t, items: map.get(t)! }));
  }, [sizes]);

  const chosen = useMemo(() => sizes.filter((s) => selected.includes(s.id)), [sizes, selected]);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const shown = searching
    ? sizes.filter((s) => sizeLabel(s).toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
    : (groups.find((g) => g.type === group) ?? groups[0])?.items ?? [];
  const activeType = groups.some((g) => g.type === group) ? group : groups[0]?.type;

  return (
    <div className="rounded-xl border border-border-light bg-surface-card">
      {/* Chosen: always visible, whichever tab is open. */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 border-b border-border-light min-h-[44px]">
        {chosen.length === 0 ? (
          <span className="text-[11px] text-text-muted">No size chosen. Pick from the list below.</span>
        ) : (
          <>
            <span className="text-[11px] font-semibold text-on-surface mr-1">Chosen ({chosen.length})</span>
            {chosen.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => onToggle(s.id)}
                className={`${chip} ${chipOn} pr-1.5`}
                aria-label={`Remove ${sizeLabel(s)}`}
              >
                {sizeLabel(s)}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={onClear}
              className="ml-auto text-[11px] text-text-muted hover:text-red-600 underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Type tabs + search. */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Size type">
          {groups.map((g) => {
            const on = !searching && g.type === activeType;
            const picked = g.items.filter((s) => selected.includes(s.id)).length;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={on}
                key={g.type}
                onClick={() => {
                  setQuery("");
                  onGroupChange(g.type);
                }}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs transition-colors ${
                  on ? "bg-primary text-white font-semibold" : "text-text-muted hover:bg-surface-subtle"
                }`}
              >
                {typeLabel(g.type)}
                <span className={`text-[10px] ${on ? "opacity-80" : "opacity-60"}`}>{g.items.length}</span>
                {picked > 0 && (
                  <span
                    className={`min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center font-semibold ${
                      on ? "bg-white text-primary" : "bg-primary text-white"
                    }`}
                  >
                    {picked}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {sizes.length > 12 && (
          <label className="relative ml-auto w-full sm:w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search all sizes"
              aria-label="Search sizes"
              className="w-full h-7 pl-7 pr-2 border border-border-light rounded-lg text-xs bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </label>
        )}
      </div>

      {/* Options of the open tab, or the search hits across all tabs. */}
      <div className="flex flex-wrap gap-1.5 p-3" role="group" aria-label="Sizes">
        {shown.length === 0 ? (
          <span className="text-[11px] text-text-muted">No size matches “{query}”. Use + New to add it.</span>
        ) : (
          shown.map((s) => {
            const on = selected.includes(s.id);
            return (
              <button
                type="button"
                key={s.id}
                aria-pressed={on}
                onClick={() => onToggle(s.id)}
                className={`${chip} ${on ? chipOn : chipOff}`}
              >
                {sizeLabel(s)}
                {searching && groups.length > 1 && (
                  <span className="text-[10px] uppercase tracking-wider opacity-60">{typeLabel(typeOf(s))}</span>
                )}
                {on && <Check className="w-3 h-3" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
