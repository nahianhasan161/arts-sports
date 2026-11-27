/**
 * The variation model behind the product form's Variants tab.
 *
 * Storage is unchanged: a product has a list of colours and a list of sizes,
 * and `admin_save_product()` stores every colour × size pair as a
 * `product_variants` row (checkout's `resolve_order_variant()` needs them all).
 * The editor shows them as a list of variations the admin added one by one, so
 * a pair the admin never added is still stored, switched off with no stock.
 *
 * `hidden` marks those filler pairs. It is editor-only (never sent): a stored
 * pair that is off, has no stock and no price counts as "not added" when the
 * form opens. Removing a variation turns it back into a filler, and a colour or
 * size left with no variation is dropped from the product altogether.
 */

export type CellKey = `${string}:${string}`;

export interface MatrixCell {
  stock: number;
  price_override: string | null;
  sku: string | null;
  is_active: boolean;
  /** Filler pair, not shown as a variation. Editor-only. */
  hidden?: boolean;
}

export type MatrixState = Record<CellKey, MatrixCell>;

/** Everything the Variants tab edits. */
export interface VariantSet {
  colorIds: string[];
  sizeIds: string[];
  matrix: MatrixState;
}

export type Pair = { colorId: string | null; sizeId: string | null };

/** A placeholder rather than an empty segment, so a blank id cannot collide. */
const NONE = "-";

export function cellKey(colorId: string | null, sizeId: string | null): CellKey {
  return `${colorId ?? NONE}:${sizeId ?? NONE}`;
}

export function splitKey(key: CellKey): Pair {
  const [c, s] = key.split(":");
  return { colorId: c === NONE ? null : c, sizeId: s === NONE ? null : s };
}

export function emptyCell(): MatrixCell {
  return { stock: 0, price_override: null, sku: null, is_active: true };
}

const filler = (): MatrixCell => ({ ...emptyCell(), is_active: false, hidden: true });

/** The pairs the server builds for these option lists, in display order. */
export function shapeKeys(colorIds: string[], sizeIds: string[]): CellKey[] {
  if (colorIds.length > 0 && sizeIds.length > 0) {
    return colorIds.flatMap((c) => sizeIds.map((s) => cellKey(c, s)));
  }
  if (colorIds.length > 0) return colorIds.map((c) => cellKey(c, null));
  return sizeIds.map((s) => cellKey(null, s));
}

/** How many rows the save will write (the server caps it). */
export const storedCount = (colorIds: string[], sizeIds: string[]) =>
  colorIds.length > 0 || sizeIds.length > 0 ? Math.max(colorIds.length, 1) * Math.max(sizeIds.length, 1) : 0;

/** Same limit as `product_variant_limit()` in SQL. */
export const VARIANT_LIMIT = 200;

export interface ListedVariant {
  key: CellKey;
  colorId: string | null;
  sizeId: string | null;
  cell: MatrixCell;
}

/** The variations the admin sees, in colour then size order. */
export function listed(set: VariantSet): ListedVariant[] {
  return shapeKeys(set.colorIds, set.sizeIds)
    .map((key) => ({ key, ...splitKey(key), cell: set.matrix[key] ?? emptyCell() }))
    .filter((v) => !v.cell.hidden);
}

const union = (a: string[], b: (string | null)[]) => {
  const out = [...a];
  for (const x of b) if (x && !out.includes(x)) out.push(x);
  return out;
};

export interface AddResult {
  set: VariantSet;
  /** Pairs that became new variations. */
  added: CellKey[];
  /** Pairs that were already variations (left as they were). */
  kept: CellKey[];
}

/**
 * Adds variations. New colours / sizes join the product; any other pair that
 * only exists because of them is stored as a filler, so only the pairs asked
 * for go on sale.
 *
 * When a colour-only product gets its first size (or a size-only product its
 * first colour), each old variation moves to one pair (the one asked for, else
 * the first new value) with its stock, instead of being copied to every pair.
 */
export function addVariants(set: VariantSet, pairs: Pair[], template: Omit<MatrixCell, "hidden" | "is_active">): AddResult {
  const colorIds = union(set.colorIds, pairs.map((p) => p.colorId));
  const sizeIds = union(set.sizeIds, pairs.map((p) => p.sizeId));
  const two = colorIds.length > 0 && sizeIds.length > 0;
  const fromColorOnly = two && set.sizeIds.length === 0;
  const fromSizeOnly = two && set.colorIds.length === 0;

  const carried = new Set<CellKey>();
  const matrix: MatrixState = {};
  for (const key of shapeKeys(colorIds, sizeIds)) {
    const old = set.matrix[key];
    if (old) {
      matrix[key] = old;
      continue;
    }
    const { colorId, sizeId } = splitKey(key);
    let from: CellKey | null = null;
    if (fromColorOnly && colorId && set.colorIds.includes(colorId)) {
      const target = pairs.find((p) => p.colorId === colorId)?.sizeId ?? sizeIds[0];
      if (sizeId === target) from = cellKey(colorId, null);
    } else if (fromSizeOnly && sizeId && set.sizeIds.includes(sizeId)) {
      const target = pairs.find((p) => p.sizeId === sizeId)?.colorId ?? colorIds[0];
      if (colorId === target) from = cellKey(null, sizeId);
    }
    const src = from ? set.matrix[from] : undefined;
    if (src && !src.hidden) {
      matrix[key] = src;
      carried.add(key);
    } else {
      matrix[key] = filler();
    }
  }

  const added: CellKey[] = [];
  const kept: CellKey[] = [];
  for (const p of pairs) {
    const key = cellKey(p.colorId, p.sizeId);
    if (!(key in matrix) || added.includes(key) || kept.includes(key)) continue;
    const cell = matrix[key];
    if (!cell.hidden && (set.matrix[key] || carried.has(key))) {
      kept.push(key);
    } else {
      matrix[key] = { ...template, is_active: true };
      added.push(key);
    }
  }
  return { set: { colorIds, sizeIds, matrix }, added, kept };
}

/** Drops colours / sizes that have no variation left. */
function prune(set: VariantSet): VariantSet {
  const live = listed(set);
  const colorIds = set.colorIds.filter((c) => live.some((v) => v.colorId === c));
  const sizeIds = set.sizeIds.filter((s) => live.some((v) => v.sizeId === s));
  if (colorIds.length === set.colorIds.length && sizeIds.length === set.sizeIds.length) return set;
  const matrix: MatrixState = {};
  for (const key of shapeKeys(colorIds, sizeIds)) matrix[key] = set.matrix[key] ?? filler();
  return { colorIds, sizeIds, matrix };
}

/** Removes variations (they become fillers) and prunes unused options. */
export function removeVariants(set: VariantSet, keys: CellKey[]): VariantSet {
  const matrix: MatrixState = { ...set.matrix };
  for (const key of keys) {
    if (matrix[key]) matrix[key] = { ...matrix[key], stock: 0, price_override: null, is_active: false, hidden: true };
  }
  return prune({ ...set, matrix });
}

/** Changes some variations. `patch` gets the current cell. */
export function patchVariants(
  set: VariantSet,
  keys: CellKey[],
  patch: (cell: MatrixCell) => Partial<MatrixCell>,
): VariantSet {
  const matrix: MatrixState = { ...set.matrix };
  for (const key of keys) {
    const cell = matrix[key] ?? emptyCell();
    matrix[key] = { ...cell, ...patch(cell) };
  }
  return { ...set, matrix };
}

/** Stock typed in a box: digits only, never negative. */
export function parseStock(raw: string): number {
  const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

/** Moves `id` to where `to` is (drag and drop). Unknown ids: list unchanged. */
export function moveId(ids: string[], id: string, to: string): string[] {
  const from = ids.indexOf(id);
  const at = ids.indexOf(to);
  if (from < 0 || at < 0 || from === at) return ids;
  const out = [...ids];
  out.splice(from, 1);
  out.splice(at, 0, id);
  return out;
}

/** Moves `id` one place up (-1) or down (+1). */
export function stepId(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  return moveId(ids, id, ids[j]);
}

/**
 * New colour or size order. Only the order changes; the stored pairs keep
 * their cells (keys are colour:size, so they do not depend on the order).
 * Saved as `product_colors` / `product_sizes.sort_order`, which is the order
 * the shop shows them in.
 */
export function reorder(set: VariantSet, axis: "color" | "size", ids: string[]): VariantSet {
  return axis === "color" ? { ...set, colorIds: ids } : { ...set, sizeIds: ids };
}
