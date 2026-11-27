"use client";

/**
 * The product form's Variants tab: a list of variations (WooCommerce style)
 * that the admin adds on purpose, never a generated grid.
 *
 *   - "Add variations": pick colours and/or sizes, set a stock and price for
 *     them, see exactly which variations will be made, add. Leaving one side
 *     empty uses the product's current values (add size XXL → for every colour).
 *   - The list: grouped by colour, stock / price / SKU edited in the row, on/off,
 *     remove (with undo), select several for bulk changes, search and filters.
 *
 * Data rules live in `./variants.ts` (storage is still colour × size).
 */

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  GripVertical,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { ColorOption, SizeOption } from "@/types";
import { SizePicker, sizeLabel } from "./SizePicker";
import {
  VARIANT_LIMIT,
  addVariants,
  listed,
  moveId,
  parseStock,
  patchVariants,
  removeVariants,
  reorder,
  splitKey,
  stepId,
  storedCount,
  type CellKey,
  type ListedVariant,
  type MatrixCell,
  type Pair,
  type VariantSet,
} from "./variants";

type Made = { id: string } | { error: string };

const inputBase =
  "h-9 rounded-lg border border-border-light bg-surface-card px-2.5 text-sm text-on-surface placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50";
const input = inputBase + " w-full";
const smallBtn =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-border-light bg-surface-card px-2.5 text-xs font-semibold text-on-surface hover:bg-surface-subtle disabled:opacity-40";
const primaryBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-40";
const chip = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors";
const chipOff = "border-border-light text-text-muted hover:border-primary/40 hover:text-on-surface";
const chipOn = "border-primary bg-primary/10 text-primary font-semibold";

const LOW = 3;
const money = (n: number) => `৳${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Filter = "all" | "stock" | "out" | "off";

export interface VariantEditorProps {
  colors: ColorOption[];
  sizes: SizeOption[];
  loading?: boolean;
  value: VariantSet;
  onChange: (next: VariantSet) => void;
  /** The product's own price, shown where a variation has no price of its own. */
  basePrice: number;
  disabled?: boolean;
  /** Size tab (clothing / shoe / accessory); a new size is saved with it. */
  sizeGroup: string;
  onSizeGroupChange: (type: string) => void;
  /** Find-or-create a colour / size by name. */
  makeColor: (name: string, hex: string) => Promise<Made>;
  makeSize: (name: string, type: string) => Promise<Made>;
  /** Extra bits per colour (pictures): a small badge in its heading and a block under it. */
  colorBadge?: (colorId: string) => ReactNode;
  colorExtra?: (colorId: string) => ReactNode;
}

export function VariantEditor({
  colors,
  sizes,
  loading,
  value,
  onChange,
  basePrice,
  disabled,
  sizeGroup,
  onSizeGroupChange,
  makeColor,
  makeSize,
  colorBadge,
  colorExtra,
}: VariantEditorProps) {
  const rows = useMemo(() => listed(value), [value]);
  const [composer, setComposer] = useState(rows.length === 0);
  const [picked, setSelected] = useState<Set<CellKey>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ text: string; prev: VariantSet } | null>(null);
  const [fresh, setFresh] = useState<Set<CellKey>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const colorById = useMemo(() => new Map(colors.map((c) => [c.id, c])), [colors]);
  const sizeById = useMemo(() => new Map(sizes.map((s) => [s.id, s])), [sizes]);
  const colorName = (id: string | null) => (id ? colorById.get(id)?.name ?? "Colour" : "");
  const sizeName = (id: string | null) => {
    const s = id ? sizeById.get(id) : undefined;
    return s ? sizeLabel(s) : id ? "Size" : "";
  };
  const nameOf = (v: { colorId: string | null; sizeId: string | null }) =>
    [colorName(v.colorId), sizeName(v.sizeId)].filter(Boolean).join(" · ");

  // Selection only counts rows that still exist.
  const selected = useMemo(() => {
    const keys = new Set(rows.map((r) => r.key));
    return new Set([...picked].filter((k) => keys.has(k)));
  }, [picked, rows]);

  useEffect(() => {
    if (fresh.size === 0) return;
    const t = setTimeout(() => setFresh(new Set()), 2400);
    return () => clearTimeout(t);
  }, [fresh]);

  const twoAxes = value.colorIds.length > 0 && value.sizeIds.length > 0;

  // ---------- summary
  const summary = useMemo(() => {
    const on = rows.filter((r) => r.cell.is_active);
    const prices = on.map((r) => (r.cell.price_override ? Number(r.cell.price_override) : basePrice)).filter((n) => n > 0);
    return {
      count: rows.length,
      stock: on.reduce((s, r) => s + r.cell.stock, 0),
      out: on.filter((r) => r.cell.stock === 0).length,
      off: rows.length - on.length,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };
  }, [rows, basePrice]);

  // ---------- filtering
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter === "stock" && !(r.cell.is_active && r.cell.stock > 0)) return false;
    if (filter === "out" && !(r.cell.is_active && r.cell.stock === 0)) return false;
    if (filter === "off" && r.cell.is_active) return false;
    if (!q) return true;
    return nameOf(r).toLowerCase().includes(q) || (r.cell.sku ?? "").toLowerCase().includes(q);
  });

  const groups = useMemo(() => {
    if (!twoAxes) return [{ id: "", items: visible }];
    const out: { id: string; items: ListedVariant[] }[] = [];
    for (const c of value.colorIds) {
      const items = visible.filter((r) => r.colorId === c);
      if (items.length) out.push({ id: c, items });
    }
    return out;
  }, [visible, twoAxes, value.colorIds]);

  // ---------- changes
  const commit = (next: VariantSet) => {
    setUndo(null);
    onChange(next);
  };
  const patch = (keys: CellKey[], p: (cell: MatrixCell) => Partial<MatrixCell>) => commit(patchVariants(value, keys, p));
  const remove = (keys: CellKey[]) => {
    if (keys.length === 0) return;
    const prev = value;
    const label = keys.length === 1 ? nameOf(rows.find((r) => r.key === keys[0]) ?? { colorId: null, sizeId: null }) : `${keys.length} variations`;
    onChange(removeVariants(value, keys));
    setSelected(new Set());
    setUndo({ text: `Removed ${label}.`, prev });
  };

  // ---------- order (drag the grip, or focus it and press ↑ / ↓)
  const idsOf = (axis: Axis) => (axis === "color" ? value.colorIds : value.sizeIds);
  const sort = useSortDrag(listRef, disabled, {
    onDrop: (axis, id, to) => commit(reorder(value, axis, moveId(idsOf(axis), id, to))),
    onStep: (axis, id, dir) => commit(reorder(value, axis, stepId(idsOf(axis), id, dir))),
  });
  /** Which list a row's grip moves: sizes when rows sit under a colour, else the one axis there is. */
  const rowAxis: Axis = twoAxes || value.colorIds.length === 0 ? "size" : "color";
  const rowSortId = (r: ListedVariant) => (rowAxis === "size" ? r.sizeId : r.colorId) ?? "";

  const toggleSel = (keys: CellKey[], on: boolean) =>
    setSelected((sel) => {
      const next = new Set(sel);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.key));
  const someVisibleSelected = visible.some((r) => selected.has(r.key));

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="h-24 rounded-xl bg-surface-subtle animate-pulse" />
        <div className="h-40 rounded-xl bg-surface-subtle animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: title, numbers, add button. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">Variations</p>
          {summary.count === 0 ? (
            <p className="text-[11px] text-text-muted">
              None yet, so this product sells as one item. Add variations to sell it in colours or sizes.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
              <Stat>{summary.count} variations</Stat>
              <Stat>{summary.stock.toLocaleString("en-IN")} pcs</Stat>
              {summary.min > 0 && (
                <Stat>{summary.min === summary.max ? money(summary.min) : `${money(summary.min)} – ${money(summary.max)}`}</Stat>
              )}
              {summary.out > 0 && <Stat tone="red">{summary.out} sold out</Stat>}
              {summary.off > 0 && <Stat tone="muted">{summary.off} off</Stat>}
            </div>
          )}
        </div>
        {!composer && (
          <button type="button" disabled={disabled} onClick={() => setComposer(true)} className={primaryBtn}>
            <PackagePlus className="h-4 w-4" /> Add variations
          </button>
        )}
      </div>

      {composer && (
        <AddVariations
          colors={colors}
          sizes={sizes}
          value={value}
          basePrice={basePrice}
          disabled={disabled}
          sizeGroup={sizeGroup}
          onSizeGroupChange={onSizeGroupChange}
          makeColor={makeColor}
          makeSize={makeSize}
          nameOf={nameOf}
          canClose={rows.length > 0}
          onClose={() => setComposer(false)}
          onAdd={(result) => {
            commit(result.set);
            setFresh(new Set(result.added));
            setFilter("all");
            setQuery("");
            setCollapsed(new Set());
            setComposer(false);
          }}
        />
      )}

      {undo && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-subtle px-3 py-2 text-xs text-on-surface">
          <span>{undo.text}</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onChange(undo.prev);
                setUndo(null);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-primary hover:bg-primary/10"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <button type="button" aria-label="Dismiss" onClick={() => setUndo(null)} className="rounded-md p-1 text-text-muted hover:bg-surface-card">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border-light bg-surface-card">
          {/* Toolbar: select all, filters, search. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-3 py-2">
            <Checkbox
              checked={allVisibleSelected}
              mixed={!allVisibleSelected && someVisibleSelected}
              onChange={(on) => toggleSel(visible.map((r) => r.key), on)}
              label="Select all shown"
            />
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show">
              {(
                [
                  ["all", `All ${rows.length}`],
                  ["stock", "In stock"],
                  ["out", `Sold out${summary.out ? ` ${summary.out}` : ""}`],
                  ["off", `Off${summary.off ? ` ${summary.off}` : ""}`],
                ] as [Filter, string][]
              ).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`h-7 rounded-lg px-2.5 text-xs transition-colors ${
                    filter === id ? "bg-primary font-semibold text-white" : "text-text-muted hover:bg-surface-subtle"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {rows.length > 6 && (
              <label className="relative ml-auto w-full sm:w-48">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
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
                  placeholder="Find colour, size, SKU"
                  aria-label="Find a variation"
                  className="h-7 w-full rounded-lg border border-border-light bg-surface-card pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </label>
            )}
          </div>

          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              disabled={disabled}
              onStock={(n, mode) => patch([...selected], (c) => ({ stock: mode === "set" ? n : c.stock + n }))}
              onPrice={(p) => patch([...selected], () => ({ price_override: p }))}
              onActive={(on) => patch([...selected], () => ({ is_active: on }))}
              onRemove={() => remove([...selected])}
              onClear={() => setSelected(new Set())}
            />
          )}

          {/* Column titles (wide screens). */}
          <div className="hidden grid-cols-[48px_minmax(0,1fr)_132px_116px_128px_52px_32px] items-center gap-3 border-b border-border-light bg-surface-subtle/60 pl-1.5 pr-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted md:grid">
            <span />
            <span>Variation</span>
            <span>Stock</span>
            <span>Price</span>
            <span>SKU</span>
            <span>On</span>
            <span />
          </div>

          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-text-muted">No variation matches. Change the filter or search.</p>
          ) : (
            <div ref={listRef} className="max-h-[44rem] overflow-y-auto">
              {groups.map((g) => {
                const c = g.id ? colorById.get(g.id) : undefined;
                const all = rows.filter((r) => r.colorId === g.id);
                const isClosed = collapsed.has(g.id);
                const groupSel = g.items.every((r) => selected.has(r.key));
                return (
                  <div
                    key={g.id || "flat"}
                    {...(g.id ? sort.target("color", g.id) : {})}
                    className={`border-b border-border-light last:border-b-0 ${g.id ? sort.mark("color", g.id) : ""}`}
                  >
                    {g.id && (
                      <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface-subtle/95 px-1.5 py-1.5 backdrop-blur">
                        <Grip {...sort.handle("color", g.id)} label={`Move ${c?.name ?? "colour"} up or down`} disabled={disabled} />
                        <Checkbox
                          checked={groupSel}
                          mixed={!groupSel && g.items.some((r) => selected.has(r.key))}
                          onChange={(on) => toggleSel(g.items.map((r) => r.key), on)}
                          label={`Select all ${c?.name ?? ""}`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsed((s) => {
                              const n = new Set(s);
                              if (n.has(g.id)) n.delete(g.id);
                              else n.add(g.id);
                              return n;
                            })
                          }
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-expanded={!isClosed}
                        >
                          <Swatch hex={c?.hex} />
                          <span className="truncate text-xs font-semibold text-on-surface">{c?.name ?? "Colour"}</span>
                          <span className="text-[11px] text-text-muted">
                            {all.length} · {all.filter((r) => r.cell.is_active).reduce((s, r) => s + r.cell.stock, 0)} pcs
                          </span>
                          {colorBadge?.(g.id)}
                          <ChevronDown className={`ml-auto h-4 w-4 text-text-muted transition-transform ${isClosed ? "-rotate-90" : ""}`} />
                        </button>
                      </div>
                    )}
                    {g.id && !isClosed && colorExtra?.(g.id)}
                    {!isClosed &&
                      g.items.map((r) => (
                        <Fragment key={r.key}>
                        <VariantRow
                          row={r}
                          label={twoAxes ? sizeName(r.sizeId) : nameOf(r)}
                          fullName={nameOf(r)}
                          swatch={!twoAxes && r.colorId ? colorById.get(r.colorId)?.hex : undefined}
                          basePrice={basePrice}
                          selected={selected.has(r.key)}
                          fresh={fresh.has(r.key)}
                          disabled={disabled}
                          indent={twoAxes}
                          grip={rowSortId(r) ? sort.handle(rowAxis, rowSortId(r)) : undefined}
                          target={rowSortId(r) ? sort.target(rowAxis, rowSortId(r)) : undefined}
                          mark={rowSortId(r) ? sort.mark(rowAxis, rowSortId(r)) : ""}
                          onSelect={(on) => toggleSel([r.key], on)}
                          onPatch={(p) => patch([r.key], () => p)}
                          onRemove={() => remove([r.key])}
                        />
                        {/* Colours only (no sizes): each row is a colour, its pictures sit under it. */}
                        {!g.id && r.colorId && !r.sizeId && colorExtra?.(r.colorId)}
                        </Fragment>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-[11px] leading-relaxed text-text-muted">
          Drag <GripVertical className="inline h-3 w-3 align-[-2px]" /> to change the order (colours{twoAxes ? " by their heading, sizes by any row" : ""});
          the shop shows them in this order. A variation at 0 stays on the shop as “sold out”; switch it off to hide it. Price is
          optional (empty = product price); the product&apos;s discount or promotion is taken off it on the product page and at
          checkout. The POS still uses the product price.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ rows */

function VariantRow({
  row,
  label,
  fullName,
  swatch,
  basePrice,
  selected,
  fresh,
  disabled,
  indent,
  grip,
  target,
  mark,
  onSelect,
  onPatch,
  onRemove,
}: {
  grip?: GripProps;
  target?: TargetProps;
  mark?: string;
  row: ListedVariant;
  label: string;
  fullName: string;
  swatch?: string;
  basePrice: number;
  selected: boolean;
  fresh: boolean;
  disabled?: boolean;
  indent: boolean;
  onSelect: (on: boolean) => void;
  onPatch: (p: Partial<MatrixCell>) => void;
  onRemove: () => void;
}) {
  const { cell } = row;
  const tone = !cell.is_active ? "off" : cell.stock === 0 ? "out" : cell.stock <= LOW ? "low" : null;
  return (
    <div
      {...target}
      className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-border-light/70 py-2 pl-1.5 pr-3 first:border-t-0 transition-colors md:grid-cols-[48px_minmax(0,1fr)_132px_116px_128px_52px_32px] ${
        fresh ? "bg-primary/10" : selected ? "bg-primary/5" : "hover:bg-surface-subtle/50"
      } ${cell.is_active ? "" : "text-text-muted"} ${mark ?? ""}`}
    >
      <div className="flex items-center gap-0.5">
        {grip ? <Grip {...grip} label={`Move ${label} up or down`} disabled={disabled} /> : <span className="w-4" />}
        <Checkbox checked={selected} onChange={onSelect} label={`Select ${fullName}`} />
      </div>

      <div className={`flex min-w-0 items-center gap-2 ${indent ? "md:pl-1" : ""}`}>
        {swatch && <Swatch hex={swatch} />}
        <span className={`truncate text-sm font-medium ${cell.is_active ? "text-on-surface" : "line-through decoration-text-muted/50"}`}>
          {label}
        </span>
        {tone === "out" && <Pill tone="red">Sold out</Pill>}
        {tone === "low" && <Pill tone="amber">Low</Pill>}
        {tone === "off" && <Pill tone="muted">Off</Pill>}
      </div>

      {/* On small screens the switch and trash sit beside the name, the inputs wrap below. */}
      <div className="flex items-center gap-1 justify-self-end md:hidden">
        <Switch on={cell.is_active} disabled={disabled} onChange={(on) => onPatch({ is_active: on })} label={`${fullName} on sale`} />
        <RemoveButton disabled={disabled} onClick={onRemove} label={fullName} />
      </div>

      <div className="col-span-3 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 md:contents">
        <Stepper
          value={cell.stock}
          disabled={disabled}
          label={`Stock for ${fullName}`}
          onChange={(n) => onPatch({ stock: n })}
        />
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">৳</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={cell.price_override ?? ""}
            disabled={disabled}
            placeholder={basePrice > 0 ? String(basePrice) : "Price"}
            aria-label={`Price for ${fullName}`}
            onChange={(e) => onPatch({ price_override: e.target.value === "" ? null : e.target.value })}
            className={input + " pl-6 tabular-nums"}
          />
        </div>
        <input
          value={cell.sku ?? ""}
          disabled={disabled}
          placeholder="auto"
          aria-label={`SKU for ${fullName}`}
          onChange={(e) => onPatch({ sku: e.target.value || null })}
          className={input + " font-mono text-xs"}
        />
      </div>

      <div className="hidden md:block">
        <Switch on={cell.is_active} disabled={disabled} onChange={(on) => onPatch({ is_active: on })} label={`${fullName} on sale`} />
      </div>
      <div className="hidden md:block">
        <RemoveButton disabled={disabled} onClick={onRemove} label={fullName} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- bulk bar */

function BulkBar({
  count,
  disabled,
  onStock,
  onPrice,
  onActive,
  onRemove,
  onClear,
}: {
  count: number;
  disabled?: boolean;
  onStock: (n: number, mode: "set" | "add") => void;
  onPrice: (price: string | null) => void;
  onActive: (on: boolean) => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");
  // "Remove N?" asks again when the selection changes.
  const [confirmFor, setConfirmFor] = useState<number | null>(null);
  const confirm = confirmFor === count;
  const n = stock === "" ? null : parseStock(stock);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-primary/5 px-3 py-2">
      <span className="text-xs font-semibold text-primary">{count} selected</span>

      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Stock"
          aria-label="Stock for the selected variations"
          className={inputBase + " h-8 w-20"}
        />
        <button type="button" disabled={disabled || n === null} onClick={() => n !== null && onStock(n, "set")} className={smallBtn}>
          Set
        </button>
        <button type="button" disabled={disabled || !n} onClick={() => n && onStock(n, "add")} className={smallBtn} title="Add to the current stock">
          <Plus className="h-3 w-3" /> Add
        </button>
      </span>

      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price ৳"
          aria-label="Price for the selected variations"
          className={inputBase + " h-8 w-24"}
        />
        <button type="button" disabled={disabled || price === ""} onClick={() => onPrice(price)} className={smallBtn}>
          Set
        </button>
        <button type="button" disabled={disabled} onClick={() => onPrice(null)} className={smallBtn} title="Use the product price">
          Clear
        </button>
      </span>

      <span className="flex items-center gap-1">
        <button type="button" disabled={disabled} onClick={() => onActive(true)} className={smallBtn}>
          On
        </button>
        <button type="button" disabled={disabled} onClick={() => onActive(false)} className={smallBtn}>
          Off
        </button>
      </span>

      <span className="ml-auto flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => (confirm ? onRemove() : setConfirmFor(count))}
          className={`${smallBtn} ${confirm ? "border-badge-discount bg-badge-discount text-white hover:bg-badge-discount/90" : "text-badge-discount"}`}
        >
          <Trash2 className="h-3.5 w-3.5" /> {confirm ? `Remove ${count}?` : "Remove"}
        </button>
        <button type="button" onClick={onClear} aria-label="Clear selection" className="rounded-md p-1.5 text-text-muted hover:bg-surface-card">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

/* ------------------------------------------------------- add variations */

function AddVariations({
  colors,
  sizes,
  value,
  basePrice,
  disabled,
  sizeGroup,
  onSizeGroupChange,
  makeColor,
  makeSize,
  nameOf,
  canClose,
  onClose,
  onAdd,
}: {
  colors: ColorOption[];
  sizes: SizeOption[];
  value: VariantSet;
  basePrice: number;
  disabled?: boolean;
  sizeGroup: string;
  onSizeGroupChange: (type: string) => void;
  makeColor: (name: string, hex: string) => Promise<Made>;
  makeSize: (name: string, type: string) => Promise<Made>;
  nameOf: (p: Pair) => string;
  canClose: boolean;
  onClose: () => void;
  onAdd: (r: ReturnType<typeof addVariants>) => void;
}) {
  const [pickedColors, setPickedColors] = useState<string[]>([]);
  const [pickedSizes, setPickedSizes] = useState<string[]>([]);
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");
  const [colorQuery, setColorQuery] = useState("");
  const [newColor, setNewColor] = useState<{ name: string; hex: string } | null>(null);
  const [newSize, setNewSize] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const productColors = value.colorIds;
  const productSizes = value.sizeIds;

  // The product's colours first, then the rest; search when the list is long.
  const colorList = useMemo(() => {
    const mine = colors.filter((c) => productColors.includes(c.id));
    const rest = colors.filter((c) => !productColors.includes(c.id));
    const all = [...mine, ...rest];
    const cq = colorQuery.trim().toLowerCase();
    return cq ? all.filter((c) => c.name.toLowerCase().includes(cq)) : all;
  }, [colors, productColors, colorQuery]);

  // Empty side = the product's current values on that side.
  const colorAxis = pickedColors.length ? pickedColors : productColors;
  const sizeAxis = pickedSizes.length ? pickedSizes : productSizes;
  const pairs: Pair[] =
    pickedColors.length === 0 && pickedSizes.length === 0
      ? []
      : (colorAxis.length ? colorAxis : [null]).flatMap((c) =>
          (sizeAxis.length ? sizeAxis : [null]).map((s) => ({ colorId: c, sizeId: s })),
        );

  const template = {
    stock: stock === "" ? 0 : parseStock(stock),
    price_override: price.trim() === "" ? null : price.trim(),
    sku: null,
  };
  // Cheap (at most a few hundred pairs), so worked out on every render.
  const preview = addVariants(value, pairs, template);
  const total = storedCount(preview.set.colorIds, preview.set.sizeIds);
  const tooMany = total > VARIANT_LIMIT;

  const toggle = (list: string[], set: (l: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const createColor = async () => {
    if (!newColor?.name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await makeColor(newColor.name.trim(), newColor.hex);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setPickedColors((l) => (l.includes(r.id) ? l : [...l, r.id]));
    setNewColor(null);
  };
  const createSize = async () => {
    if (!newSize?.trim()) return;
    setBusy(true);
    setError(null);
    const r = await makeSize(newSize.trim(), sizeGroup && sizeGroup !== "all" ? sizeGroup : "clothing");
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setPickedSizes((l) => (l.includes(r.id) ? l : [...l, r.id]));
    setNewSize(null);
  };

  const hint = (() => {
    if (pickedColors.length && !pickedSizes.length && productSizes.length)
      return `No size picked, so each new colour gets this product's ${productSizes.length} sizes.`;
    if (pickedSizes.length && !pickedColors.length && productColors.length)
      return `No colour picked, so each size is added for this product's ${productColors.length} colours.`;
    return null;
  })();

  return (
    <div
      ref={boxRef}
      className="space-y-4 rounded-xl border border-primary/25 bg-surface-card p-4 shadow-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape" && canClose && !newColor && newSize === null) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">Add variations</p>
          <p className="text-[11px] text-text-muted">
            Pick colours, sizes or both. Only the variations shown below are made.
          </p>
        </div>
        {canClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-surface-subtle">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Step 1: colours */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StepTitle n={1} text="Colours" sub={pickedColors.length ? `${pickedColors.length} picked` : "optional"} />
          <div className="flex items-center gap-2">
            {colors.length > 16 && (
              <label className="relative w-40">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={colorQuery}
                  onChange={(e) => setColorQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                  placeholder="Search colours"
                  aria-label="Search colours"
                  className="h-7 w-full rounded-lg border border-border-light bg-surface-card pl-7 pr-2 text-xs focus:outline-none"
                />
              </label>
            )}
            {pickedColors.length > 0 && (
              <button type="button" onClick={() => setPickedColors([])} className="text-[11px] text-text-muted hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colours">
          {colorList.map((c) => {
            const on = pickedColors.includes(c.id);
            const mine = productColors.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(pickedColors, setPickedColors, c.id)}
                className={`${chip} ${on ? chipOn : chipOff}`}
                title={mine ? "Already used by this product" : undefined}
              >
                <Swatch hex={c.hex} small />
                {c.name}
                {mine && !on && <span className="h-1.5 w-1.5 rounded-full bg-primary/60" aria-label="in this product" />}
                {on && <Check className="h-3 w-3" />}
              </button>
            );
          })}
          {newColor ? (
            <span className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={newColor.name}
                disabled={busy}
                onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createColor();
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    setNewColor(null);
                  }
                }}
                placeholder="e.g. Navy"
                aria-label="New colour name"
                className={inputBase + " h-7 w-32 text-xs"}
              />
              <input
                type="color"
                value={newColor.hex}
                onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                aria-label="New colour swatch"
                className="h-7 w-8 cursor-pointer rounded-md border border-border-light bg-surface-card p-0.5"
              />
              <button type="button" disabled={busy || !newColor.name.trim()} onClick={() => void createColor()} className={smallBtn + " h-7"}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button type="button" onClick={() => setNewColor(null)} aria-label="Cancel" className="rounded-md p-1 text-text-muted hover:bg-surface-subtle">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setNewColor({ name: colorQuery.trim(), hex: "#1f6feb" })}
              className={`${chip} border-dashed border-primary/40 text-primary hover:bg-primary/5`}
            >
              <Plus className="h-3 w-3" /> New colour
            </button>
          )}
        </div>
      </section>

      {/* Step 2: sizes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <StepTitle n={2} text="Sizes / options" sub={pickedSizes.length ? `${pickedSizes.length} picked` : "optional"} />
          {newSize === null && (
            <button
              type="button"
              onClick={() => setNewSize("")}
              className={`${chip} border-dashed border-primary/40 text-primary hover:bg-primary/5`}
            >
              <Plus className="h-3 w-3" /> New size
            </button>
          )}
        </div>
        {newSize !== null && (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newSize}
              disabled={busy}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createSize();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setNewSize(null);
                }
              }}
              placeholder={`New ${sizeGroup && sizeGroup !== "all" ? sizeGroup + " " : ""}size, e.g. XL, Size 5, SH`}
              aria-label="New size name"
              className={input + " h-8 max-w-xs text-xs"}
            />
            <button type="button" disabled={busy || !newSize.trim()} onClick={() => void createSize()} className={smallBtn}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Add
            </button>
            <button type="button" onClick={() => setNewSize(null)} aria-label="Cancel" className="rounded-md p-1 text-text-muted hover:bg-surface-subtle">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {sizes.length > 0 ? (
          <SizePicker
            sizes={sizes}
            selected={pickedSizes}
            onToggle={(id) => toggle(pickedSizes, setPickedSizes, id)}
            onClear={() => setPickedSizes([])}
            group={sizeGroup}
            onGroupChange={onSizeGroupChange}
          />
        ) : (
          <p className="text-[11px] text-text-muted">No sizes yet. Use + New size.</p>
        )}
      </section>

      {/* Step 3: stock and price for all of them */}
      <section className="space-y-2">
        <StepTitle n={3} text="Stock and price" sub="for each new variation, change any row later" />
        <div className="grid max-w-md grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-text-muted">Stock (pcs)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
              className={input}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-text-muted">Price (optional)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={basePrice > 0 ? `${basePrice} (product price)` : "Product price"}
              className={input}
            />
          </label>
        </div>
      </section>

      {/* Preview + add */}
      <div className="space-y-2 rounded-lg bg-surface-subtle/70 p-3">
        {pairs.length === 0 ? (
          <p className="text-xs text-text-muted">Pick a colour or a size to see the variations here.</p>
        ) : (
          <>
            {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {preview.added.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <Plus className="h-3 w-3" />
                  {nameOf(splitKey(k))}
                </span>
              ))}
              {preview.kept.map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-md bg-surface-card px-2 py-0.5 text-xs text-text-muted line-through decoration-text-muted/40"
                  title="Already a variation, left as it is"
                >
                  {nameOf(splitKey(k))}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-text-muted">
              {preview.added.length} new
              {preview.kept.length > 0 && ` · ${preview.kept.length} already added (left as they are)`}
            </p>
          </>
        )}
        {tooMany && (
          <p className="text-[11px] text-badge-discount">
            That makes {total} colour × size pairs; the limit is {VARIANT_LIMIT} per product.
          </p>
        )}
        {error && <p className="text-[11px] text-badge-discount">{error}</p>}
        <div className="flex justify-end gap-2">
          {canClose && (
            <button type="button" onClick={onClose} className={smallBtn + " h-9"}>
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={disabled || busy || preview.added.length === 0 || tooMany}
            onClick={() => {
              onAdd(preview);
              setPickedColors([]);
              setPickedSizes([]);
              setStock("");
              setPrice("");
            }}
            className={primaryBtn}
          >
            <Check className="h-4 w-4" />
            {/* When it can't be pressed, the button itself says why. */}
            {preview.added.length > 0
              ? `Add ${preview.added.length} variation${preview.added.length === 1 ? "" : "s"}`
              : pairs.length === 0
                ? "Pick a colour or size first"
                : "All of these are already added"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- small parts */

function StepTitle({ n, text, sub }: { n: number; text: string; sub?: string }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-on-surface">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-white">{n}</span>
      {text}
      {sub && <span className="font-normal text-text-muted">· {sub}</span>}
    </p>
  );
}

function Stat({ children, tone }: { children: React.ReactNode; tone?: "red" | "muted" }) {
  const cls =
    tone === "red"
      ? "bg-badge-discount/10 text-badge-discount"
      : tone === "muted"
        ? "bg-surface-subtle text-text-muted"
        : "bg-surface-subtle text-on-surface";
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${cls}`}>{children}</span>;
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "red" | "amber" | "muted" }) {
  const cls =
    tone === "red"
      ? "bg-badge-discount/10 text-badge-discount"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-surface-subtle text-text-muted";
  return <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

function Swatch({ hex, small }: { hex?: string; small?: boolean }) {
  return (
    <span
      className={`${small ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 rounded-full border border-black/10 shadow-inner`}
      style={{ backgroundColor: hex ?? "transparent" }}
    />
  );
}

function Checkbox({
  checked,
  mixed,
  onChange,
  label,
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-border-light accent-primary"
    />
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-primary" : "bg-border-light"
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function RemoveButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Remove ${label}`}
      title="Remove"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-badge-discount/10 hover:text-badge-discount disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function Stepper({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const btn =
    "inline-flex h-9 w-8 shrink-0 items-center justify-center text-text-muted hover:bg-surface-subtle hover:text-on-surface disabled:opacity-40";
  return (
    <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-border-light bg-surface-card focus-within:ring-2 focus-within:ring-primary/20">
      <button type="button" tabIndex={-1} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className={btn} aria-label={`${label}: one less`}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        aria-label={label}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseStock(e.target.value))}
        className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums text-on-surface focus:outline-none"
      />
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => onChange(value + 1)} className={btn} aria-label={`${label}: one more`}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}


/* ------------------------------------------------------------ ordering */

type Axis = "color" | "size";
type GripProps = {
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  "aria-pressed": boolean;
};
type TargetProps = { "data-sort": Axis; "data-sort-id": string };

/**
 * Drag to reorder with pointer events (mouse, pen and touch alike; HTML drag
 * and drop does not work on phones). The grip captures the pointer, the row
 * under the finger is the drop spot, and the list scrolls near its edges.
 */
function useSortDrag(
  listRef: React.RefObject<HTMLDivElement | null>,
  disabled: boolean | undefined,
  { onDrop, onStep }: { onDrop: (axis: Axis, id: string, to: string) => void; onStep: (axis: Axis, id: string, dir: -1 | 1) => void },
) {
  type Drag = { axis: Axis; id: string; over: string } | null;
  const [drag, setDragState] = useState<Drag>(null);
  // Pointer handlers read the latest drag from the ref (state lags a render).
  const dragRef = useRef<Drag>(null);
  const setDrag = (d: Drag) => {
    dragRef.current = d;
    setDragState(d);
  };

  const handle = (axis: Axis, id: string): GripProps => ({
    "aria-pressed": drag?.axis === axis && drag.id === id,
    onPointerDown: (e) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ axis, id, over: id });
    },
    onPointerMove: (e) => {
      const d = dragRef.current;
      if (!d) return;
      const list = listRef.current;
      if (list) {
        const box = list.getBoundingClientRect();
        if (e.clientY < box.top + 32) list.scrollTop -= 12;
        else if (e.clientY > box.bottom - 32) list.scrollTop += 12;
      }
      const over = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(`[data-sort="${d.axis}"]`)
        ?.getAttribute("data-sort-id");
      if (over && over !== d.over) setDrag({ ...d, over });
    },
    onPointerUp: (e) => {
      const d = dragRef.current;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      setDrag(null);
      if (d && d.over !== d.id) onDrop(d.axis, d.id, d.over);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e) => {
      if (disabled) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        onStep(axis, id, e.key === "ArrowUp" ? -1 : 1);
      }
    },
  });

  const target = (axis: Axis, id: string): TargetProps => ({ "data-sort": axis, "data-sort-id": id });

  /** Classes for the item being dragged and the spot it would land on. */
  const mark = (axis: Axis, id: string) => {
    if (!drag || drag.axis !== axis) return "";
    if (drag.id === id) return "opacity-50";
    if (drag.over === id) return "relative outline outline-2 -outline-offset-2 outline-primary bg-primary/5";
    return "";
  };

  return { handle, target, mark, dragging: drag !== null };
}

function Grip({ label, disabled, ...props }: GripProps & { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      aria-label={label}
      title="Drag to change the order (or focus and press ↑ / ↓)"
      className="flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-text-muted hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
