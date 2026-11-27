"use client";

/**
 * The product form, split out of the list page so the page holds the list and
 * this holds the editing.
 *
 * The shape of the state is the design. An earlier version kept one
 * `formDataState` object where the category and the sub-category were two
 * independent strings, and reconciled them with effects. Two effects each
 * derived a third field from the other two, and the result depended on the
 * order React happened to run them in, so choosing a sub-category could
 * overwrite the category with its parent's name while a stale sub-category
 * survived a change of parent.
 *
 * Here a category and a sub-category are ids, they live in one object, and the
 * invariant is maintained in the reducer rather than after the fact:
 *
 *   - a sub-category is only ever cleared or replaced by the reducer, never by
 *     an effect reacting to a change elsewhere;
 *   - a sub-category that does not belong to the selected parent is dropped at
 *     the moment the parent changes, so it cannot be submitted;
 *   - category and sub-category names are never stored. The server writes them
 *     from the ids, and the trigger keeps them in step, so the two cannot
 *     disagree.
 */

import { appendImageFiles } from "@/lib/media/client-optimize";
import { looksLikeSpecList, parseSpecPaste, specsToText, type SpecPair } from "@/lib/products/spec-paste";
import ProductVideoManager, { releaseStagedVideos, uploadStagedVideos, type StagedVideo } from "./ProductVideoManager";
import { useCallback, useEffect, useMemo, useReducer, useState, type ClipboardEvent } from "react";
import { X, Check, ArrowLeft, ImagePlus, Plus, Loader2, Eye } from "lucide-react";
import StagedImagePicker, { stageImageFiles, type StagedImage } from "@/components/admin/products/StagedImagePicker";
import ProductMediaManager from "@/components/admin/ProductMediaManager";
import { RichTextEditor } from "@/components/admin/products/RichTextEditor";
import { guessSizeGroup } from "@/components/admin/products/SizePicker";
import { VariationsPanel, type DefaultChoice, type MediaChoice } from "@/components/admin/products/ColorPhotos";
import { entryKey, readColorMedia, readDefaultVariant, videoEntry } from "@/lib/products/color-images";
import { readVideos, videoPoster, VIDEO_HOST_LABEL, type ProductVideo } from "@/lib/media/video";
import { SeoPanel, sendSeoDraft, type SeoDraft } from "@/components/admin/products/SeoPanel";
import {
  cellKey,
  emptyCell,
  type MatrixCell,
  type MatrixState,
  type VariantSet,
} from "@/components/admin/products/variants";
import {
  PRODUCT_GENDERS,
  PRODUCT_GENDER_LABELS,
  MEDIA_MAX_PER_PRODUCT,
  isProductDiscountMode,
  isProductGender,
  type Category,
  type ColorOption,
  type Product,
  type ProductDiscountMode,
  type ProductGender,
  type ProductStatus,
  type ProductImage,
  type Promotion,
  type SizeOption,
} from "@/types";
import {
  DISCOUNT_MODES,
  DISCOUNT_MODE_LABELS,
  deriveDiscount,
  formatTaka,
  normalizeDiscount,
  salePrice,
} from "@/lib/pricing";
import { badgeClass } from "@/lib/badges";

const statusOptions: { value: ProductStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

type DiscountType = "percentage" | "flat";

/**
 * How the discount fields are arranged, per mode. `usesRegular` is the one that
 * matters: every mode needs a base price, but only the two that express a
 * markdown in the product itself (comparison, custom) take the base price as
 * their own input, while "none" and "promotion" only show it as the reference
 * the saving is measured against.
 */
const MODE_HELP: Record<ProductDiscountMode, string> = {
  none: "The product is sold at its price, with no discount.",
  comparison:
    "Enter the price it used to be and the price it is now. The saving is worked out for you.",
  custom: "Take an amount or a percentage off the price by hand.",
  promotion:
    "The linked promotion decides the price while its dates are live, and supplies the badge. Switch to another mode to discount this product directly.",
};

/** Slug rules mirror the column's: lower case, digits, and single dashes. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * What the admin can edit, as ids rather than as names or JSON.
 *
 * `colorIds` and `sizeIds` define the shape of the matrix; `matrix` holds the
 * per-pair values. The two are separate because removing a colour must drop its
 * row and its cells together, and a flat map of cells cannot express which
 * cells should still be there.
 *
 * The three money fields are the price model the server actually implements:
 * one base price and one discount. There is deliberately no second price
 * field. The function derives the sale price and the crossed-out price from
 * these three, and a form that also showed a "Price" and an "Original Price"
 * was sending keys the function never read, so both were discarded and every
 * product saved through it was stored at zero. A field whose value is ignored
 * is worse than no field, because the admin sees it and believes it.
 */
/**
 * One editable spec pair.
 *
 * `uid` exists because the rows used to be keyed by their array index, which
 * is a real defect rather than a style preference. React keeps the DOM node
 * and the controlled value belonging to a position, so deleting the first of
 * three rows re-uses the second row's node for the third: the inputs came back
 * showing the wrong pair, and because both inputs are controlled the wrong text
 * was then saved. A stable per-row id makes a delete remove exactly one row.
 */
interface SpecRow {
  uid: string;
  key: string;
  value: string;
}

/** Monotonic within a mounted form; the value only has to be unique per session. */
let specUid = 0;
const nextSpecUid = () => `spec-${++specUid}`;

interface FormState {
  title: string;
  slug: string;
  categoryId: string;
  subCategoryId: string;
  description: string;
  /** Pre-discount price. Sends regular_price. */
  regular_price: number;
  /**
   * How the admin chose to express the discount. Sent as `discount_mode` so the
   * form reopens on the model that was used, rather than guessing from the
   * stored numbers and showing a promotion-driven markdown as a manual one.
   */
  discount_mode: ProductDiscountMode;
  discount_type: DiscountType;
  /** Sends discount_value. A percentage, or a flat amount off. */
  discount_value: number;
  /**
   * The "new price" of price-comparison mode. Sends `comparison_price`, and is
   * NOT stored: the server turns it into a percentage and re-derives the sale
   * price from that, so the price the admin typed can never disagree with the
   * badge describing it.
   */
  comparison_price: number;
  /**
   * Buying price (what one piece cost us). Kept as text so blank stays
   * "not recorded" (NULL) rather than 0. Sends cost_price; the business report
   * reads it for cost and profit. Without it in the payload every save wiped it.
   */
  cost_price: string;
  stock: number;
  is_featured: boolean;
  status: ProductStatus;
  /**
   * Audience the product is sold to, or null when not assigned.
   *
   * null rather than "" on purpose. The <select> renders "not assigned" as an
   * empty option value, but the state models the database: three audiences or
   * nothing. A union with the empty string here also breaks useReducer's
   * overload resolution, which is how a four-value dropdown became a
   * twenty-eight-error cascade the first time it was added.
   */
  gender: ProductGender | null;
  specs: SpecRow[];
  colorIds: string[];
  sizeIds: string[];
  matrix: MatrixState;
  promotionIds: string[];
}

type Action =
  | { type: "set"; field: keyof FormState; value: FormState[keyof FormState] }
  | { type: "category"; id: string; categories: Category[] }
  | { type: "subCategory"; id: string }
  | { type: "variants"; value: VariantSet }
  | { type: "setDiscountMode"; mode: ProductDiscountMode }
  | { type: "togglePromotion"; id: string }
  | { type: "specKey"; index: number; value: string }
  | { type: "specValue"; index: number; value: string }
  | { type: "addSpec" }
  | { type: "removeSpec"; index: number }
  | { type: "mergeSpecs"; pairs: SpecPair[] }
  | { type: "clearSpecs" };

function blankState(): FormState {
  return {
    title: "",
    slug: "",
    categoryId: "",
    subCategoryId: "",
    description: "",
    regular_price: 0,
    discount_mode: "none",
    discount_type: "percentage",
    discount_value: 0,
    comparison_price: 0,
    cost_price: "",
    stock: 0,
    is_featured: false,
    status: "draft",
    gender: null,
    specs: [],
    colorIds: [],
    sizeIds: [],
    matrix: {},
    promotionIds: [],
  };
}

/**
 * Rebuilds the cells from a product's option ids and its stored variants.
 *
 * Keyed by the form's own cellKey, rebuilt from each variant's color_id and
 * size_id, not by the `variant_key` column (that one writes a missing axis as
 * an empty string, cellKey as "-"; mixing them once wiped stock on save).
 *
 * A pair with no stored row is a live, zero-stock variation (the server makes
 * every pair). A stored pair that is off, at 0 and without a price is a filler
 * the admin never added, so it is hidden from the Variants list.
 */
function matrixFromProduct(product: Product): MatrixState {
  const matrix: MatrixState = {};
  const colorIds = product.color_ids ?? [];
  const sizeIds = product.size_ids ?? [];
  const byKey = new Map((product.variants ?? []).map((v) => [cellKey(v.color_id, v.size_id), v]));
  const keys =
    colorIds.length > 0 && sizeIds.length > 0
      ? colorIds.flatMap((c) => sizeIds.map((s) => cellKey(c, s)))
      : [...colorIds.map((c) => cellKey(c, null)), ...sizeIds.map((s) => cellKey(null, s))];
  for (const key of keys) {
    const v = byKey.get(key);
    if (!v) {
      matrix[key] = emptyCell();
      continue;
    }
    const cell: MatrixCell = {
      stock: v.stock,
      price_override: v.regular_price_override === null ? null : String(v.regular_price_override),
      sku: v.sku,
      is_active: v.is_active,
    };
    if (!v.is_active && v.stock === 0 && v.regular_price_override === null) cell.hidden = true;
    matrix[key] = cell;
  }
  return matrix;
}

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case "set":
      return { ...state, [action.field]: action.value } as FormState;

    case "category": {
      // Changing the parent invalidates the sub-category unless it still sits
      // under the new parent. This is the only place a sub-category is
      // cleared, which is why it cannot go stale.
      const sub = action.categories.find((c) => c.id === state.subCategoryId);
      const keep = sub && sub.parent_id === action.id ? state.subCategoryId : "";
      return { ...state, categoryId: action.id, subCategoryId: keep };
    }

    case "subCategory":
      return { ...state, subCategoryId: action.id };

    case "variants":
      // Colours, sizes and cells change together (see ./variants.ts).
      return { ...state, ...action.value };

    case "setDiscountMode": {
      // Switching mode must CONVERT, not discard.
      //
      // The alternative -- clearing the other mode's fields -- makes the mode
      // selector a trap: an admin who types 20% by hand, clicks "Price
      // comparison" to see the same thing as a before/after pair, and clicks
      // back has silently lost their 20%. So the discount currently in force is
      // converted into whatever the new mode needs, in both directions:
      //
      //   - the new price of comparison mode is seeded with the sale price the
      //     current mode produces, so the comparison opens on the markdown
      //     already in effect;
      //   - custom mode is seeded with the markdown of the mode being left,
      //     translated into the custom type, so a 150-off price arrives as
      //     "150 off" rather than as "0%".
      //
      // Leaving custom or comparison for none or promotion zeroes the
      // markdown, which is the point of those modes: a promotion discount must
      // not stack under a leftover product markdown.
      const current = normalizeDiscount({
        mode: state.discount_mode,
        regular: state.regular_price,
        discountType: state.discount_type,
        discountValue: state.discount_value,
        comparisonPrice: state.comparison_price,
      });
      const currentSale = salePrice(current.regular, current.type, current.value);

      // Percentage first: a flat markdown converted straight to a percentage
      // would round-trip badly (150 off 1,000 is 15%, which is fine, but 150
      // off 700 is 21.43% and comes back as 149.99 off). Converting a flat
      // markdown to its own type keeps it exact.
      const wasPercentage = current.type === "percentage" && current.value > 0;

      return {
        ...state,
        discount_mode: action.mode,
        // A product with no price yet has no sale price to seed from, so the new
        // price starts on the base price rather than on 0 -- an empty
        // comparison reading "100% off" is a worse first impression than one
        // reading "no change yet".
        comparison_price: currentSale > 0 ? currentSale : state.regular_price,
        discount_type: wasPercentage ? "percentage" : "flat",
        discount_value: wasPercentage
          ? current.value
          : Math.max(0, Math.round((current.regular - currentSale) * 100) / 100),
      };
    }

    case "togglePromotion":
      return {
        ...state,
        promotionIds: state.promotionIds.includes(action.id)
          ? state.promotionIds.filter((id) => id !== action.id)
          : [...state.promotionIds, action.id],
      };

    case "specKey":
      return {
        ...state,
        specs: state.specs.map((s, i) => (i === action.index ? { ...s, key: action.value } : s)),
      };

    case "specValue":
      return {
        ...state,
        specs: state.specs.map((s, i) => (i === action.index ? { ...s, value: action.value } : s)),
      };

    case "addSpec":
      return { ...state, specs: [...state.specs, { uid: nextSpecUid(), key: "", value: "" }] };

    case "removeSpec":
      return { ...state, specs: state.specs.filter((_, i) => i !== action.index) };

    // A pasted list: a row with the same name gets the new value (when the
    // paste has one), new names are added at the end, blank rows go away.
    case "mergeSpecs": {
      const specs = state.specs.filter((s) => s.key.trim() || s.value.trim());
      for (const p of action.pairs) {
        const at = specs.findIndex((s) => s.key.trim().toLowerCase() === p.key.toLowerCase());
        if (at === -1) specs.push({ uid: nextSpecUid(), key: p.key, value: p.value });
        else if (p.value) specs[at] = { ...specs[at], value: p.value };
      }
      return { ...state, specs };
    }

    case "clearSpecs":
      return { ...state, specs: [] };
  }
}

export interface ProductFormOptions {
  categories: Category[];
  colors: ColorOption[];
  sizes: SizeOption[];
  promotions: Promotion[];
  categoriesLoading: boolean;
  colorsLoading: boolean;
  sizesLoading: boolean;
  promotionsLoading: boolean;
}

export interface ProductFormModalProps extends ProductFormOptions {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Called after the form made a category, colour, size or promotion, so the page can refresh that list. */
  onCreated?: (kind: "category" | "color" | "size" | "promotion") => void;
}

type TabId = "general" | "variants" | "images" | "description" | "specs" | "seo";
const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General Information" },
  { id: "variants", label: "Variants" },
  { id: "images", label: "Images & video" },
  { id: "description", label: "Description" },
  { id: "specs", label: "Specs" },
  { id: "seo", label: "SEO" },
];

const inputClass =
  "w-full h-9 px-3 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/20";
const labelClass = "block text-xs font-semibold text-on-surface mb-1.5";
const fieldClass = "w-full h-9 px-3 border border-border-light rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none bg-surface-card";
const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border-light px-2.5 py-1 text-xs cursor-pointer transition-colors";

/** The native select, kept in one place so the disabled and loading states match. */
function Dropdown({
  label,
  value,
  onChange,
  children,
  disabled,
  required,
  loading,
  hint,
  id,
  onCreate,
  createPlaceholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  loading?: boolean;
  hint?: string;
  id: string;
  /** Makes a new entry from a typed name and selects it. Returns an error text, or null. */
  onCreate?: (name: string) => Promise<string | null>;
  createPlaceholder?: string;
}) {
  const [creating, setCreating] = useState(false);
  const canCreate = !!onCreate && !disabled && !loading;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={labelClass}>
          {label}
          {required && <span className="text-badge-discount"> *</span>}
        </label>
        {canCreate && !creating && <NewButton onClick={() => setCreating(true)} className="mb-1.5" />}
      </div>
      {creating && onCreate ? (
        <InlineCreate
          placeholder={createPlaceholder ?? `New ${label.toLowerCase()} name`}
          onCreate={onCreate}
          onDone={() => setCreating(false)}
        />
      ) : loading ? (
        <div className={fieldClass + " bg-surface-subtle animate-pulse"} aria-hidden />
      ) : (
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        >
          {children}
        </select>
      )}
      {hint && !creating && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

/** The small "+ New" link next to a field's label. */
function NewButton({ onClick, className = "", label = "New" }: { onClick: () => void; className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-4 items-center gap-0.5 rounded-md px-1.5 text-[11px] leading-4 font-semibold text-primary hover:bg-primary/10 ${className}`}
    >
      <Plus className="w-3 h-3" /> {label}
    </button>
  );
}

/** Name box + save/cancel shown in place of a dropdown while a new entry is made. */
function InlineCreate({
  placeholder,
  onCreate,
  onDone,
  extra,
}: {
  placeholder: string;
  onCreate: (name: string) => Promise<string | null>;
  onDone: () => void;
  /** More inputs between the name and the Add button (a colour swatch, say). */
  extra?: React.ReactNode;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const err = await onCreate(clean);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              // Close only this box, not the whole product form.
              e.stopPropagation();
              onDone();
            }
          }}
          placeholder={placeholder}
          className={inputClass + " flex-1 min-w-0"}
        />
        {extra}
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !name.trim()}
          className="h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Add
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          aria-label="Cancel"
          className="h-9 w-9 rounded-lg border border-border-light text-text-muted hover:bg-surface-subtle inline-flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-badge-discount">{error}</p>}
    </div>
  );
}

export type NewPromotion = { name: string; type: "percentage" | "flat"; value: number; endsOn: string };

/**
 * A short promotion: name, % or ৳ off, last day. It starts now and is active;
 * the rest (description, badge, other products) is on the Promotions page.
 * A ৳-off promotion needs a saved product to check against (the database
 * refuses a flat discount bigger than the cheapest product it covers), so a
 * product that is not saved yet only gets %.
 */
function PromotionCreate({
  allowFlat,
  onCreate,
  onDone,
}: {
  allowFlat: boolean;
  onCreate: (p: NewPromotion) => Promise<string | null>;
  onDone: () => void;
}) {
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const [name, setName] = useState("");
  const [type, setType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("");
  const [endsOn, setEndsOn] = useState(() => inDays(30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = Number(value);
  const ok = name.trim() !== "" && num > 0 && (type === "flat" || num <= 100) && endsOn >= inDays(0);

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const err = await onCreate({ name: name.trim(), type, value: num, endsOn });
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <div
      className="rounded-lg border border-border-light bg-surface-subtle/50 p-3 space-y-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_6rem_9rem] gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Promotion name, e.g. Eid sale"
          aria-label="Promotion name"
          className={inputClass}
        />
        <div className="flex rounded-lg border border-border-light overflow-hidden h-9" role="group" aria-label="Discount type">
          {(["percentage", "flat"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={t === "flat" && !allowFlat}
              title={t === "flat" && !allowFlat ? "Save the product first to use a ৳ amount" : undefined}
              onClick={() => setType(t)}
              className={`px-3 text-xs font-semibold disabled:opacity-40 ${
                type === t ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-subtle"
              }`}
            >
              {t === "percentage" ? "% off" : "৳ off"}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={type === "percentage" ? 100 : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={type === "percentage" ? "10" : "200"}
          aria-label={type === "percentage" ? "Percent off" : "Taka off"}
          className={inputClass}
        />
        <input
          type="date"
          value={endsOn}
          min={inDays(0)}
          onChange={(e) => setEndsOn(e.target.value)}
          aria-label="Last day"
          title="Last day"
          className={inputClass}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-text-muted">
          Starts now, ends after the chosen day. {!allowFlat && "৳ off needs a saved product. "}Edit more under
          Promotions.
        </p>
        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onDone}
            disabled={busy}
            className="h-8 px-3 rounded-lg border border-border-light text-xs text-text-muted hover:bg-surface-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ok || busy}
            className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>
      </div>
      {error && <p className="text-[11px] text-badge-discount">{error}</p>}
    </div>
  );
}

/** A slug for a new name; Bangla-only names have no Latin letters, so they get a short random one. */
function newSlug(name: string, prefix: string): string {
  return slugify(name).slice(0, 60) || `${prefix}-${shortId()}`;
}

/** The page's list plus what this form made, without doubles once the page has refetched. */
function withCreated<T extends { id: string }>(list: T[], created: T[]): T[] {
  return created.length === 0 ? list : [...list, ...created.filter((c) => !list.some((x) => x.id === c.id))];
}

/** Four random letters/digits for a slug that is already taken. */
function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function ProductFormModal({
  product,
  categories: categoriesProp,
  colors: colorsProp,
  sizes: sizesProp,
  promotions: promotionsProp,
  categoriesLoading,
  colorsLoading,
  sizesLoading,
  promotionsLoading,
  onClose,
  onSuccess,
  onCreated,
}: ProductFormModalProps) {
  const isEdit = product !== null;
  // Categories made from this form ("+ New"), shown until the page's list has them.
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const categories = useMemo(() => withCreated(categoriesProp, createdCategories), [categoriesProp, createdCategories]);
  // Same for colours, sizes and promotions made from the Variants / Discount sections.
  const [createdColors, setCreatedColors] = useState<ColorOption[]>([]);
  const [createdSizes, setCreatedSizes] = useState<SizeOption[]>([]);
  const [createdPromotions, setCreatedPromotions] = useState<Promotion[]>([]);
  const colors = useMemo(() => withCreated(colorsProp, createdColors), [colorsProp, createdColors]);
  const sizes = useMemo(() => withCreated(sizesProp, createdSizes), [sizesProp, createdSizes]);
  const promotions = useMemo(() => withCreated(promotionsProp, createdPromotions), [promotionsProp, createdPromotions]);
  const [adding, setAdding] = useState<null | "promotion">(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [tab, setTab] = useState<TabId>("general");
  // Pictures chosen for a product that does not exist yet; uploaded after the save.
  const [staged, setStaged] = useState<StagedImage[]>([]);
  // Videos chosen for a product that does not exist yet; saved after it.
  const [stagedVideos, setStagedVideos] = useState<StagedVideo[]>([]);
  // Specs paste: a list pasted into any spec box (or the Paste list box) fills every row.
  const [specPasteOpen, setSpecPasteOpen] = useState(false);
  const [specPasteText, setSpecPasteText] = useState("");
  const [specNote, setSpecNote] = useState<string | null>(null);
  const onSpecPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!looksLikeSpecList(text)) return; // one value: normal paste
    const pairs = parseSpecPaste(text);
    if (pairs.length === 0) return;
    e.preventDefault();
    dispatch({ type: "mergeSpecs", pairs });
    setSpecNote(`${pairs.length} specs pasted.`);
  };
  // Search text: automatic unless the SEO tab was edited (sent after the save).
  const [seoDraft, setSeoDraft] = useState<SeoDraft>({ mode: "keep" });
  // Brand = a "brand" term from the catalog page; saved after the product.
  const [brands, setBrands] = useState<{ id: string; name_en: string }[] | null>(null);
  const [brandId, setBrandId] = useState("");
  const [savedBrandId, setSavedBrandId] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/admin/catalog-terms")
      .then((r) => (r.ok ? r.json() : { terms: [] }))
      .then((d: { terms?: { id: string; type: string; name_en: string; product_ids: string[] }[] }) => {
        if (!live) return;
        const list = (d.terms ?? []).filter((x) => x.type === "brand");
        setBrands(list);
        const mine = product ? list.find((x) => x.product_ids.includes(product.id))?.id ?? "" : "";
        setBrandId(mine);
        setSavedBrandId(mine);
      })
      .catch(() => live && setBrands([]));
    return () => {
      live = false;
    };
  }, [product]);

  // Colour media: colour (lower case) → tile keys. On a saved product a key is
  // the stored entry (image url / `video:<key>`); on a new one it is
  // `img:<staged id>` / `vid:<staged key>`, turned into entries after the
  // uploads. Saved after the product.
  const savedColorMedia = useMemo(() => readColorMedia(product?.color_images), [product]);
  const [colorMedia, setColorMedia] = useState<Record<string, string[]>>(savedColorMedia);
  const [mediaImages, setMediaImages] = useState<ProductImage[] | null>(null);
  const [mediaVideos, setMediaVideos] = useState<ProductVideo[] | null>(null);
  const mediaChoices = useMemo<MediaChoice[]>(() => {
    const vid = (v: ProductVideo, i: number) => ({ src: videoPoster(v), video: true, label: `Video ${i + 1} (${VIDEO_HOST_LABEL[v.kind]})` });
    if (!isEdit) {
      return [
        ...staged.map((x, i) => ({ key: `img:${x.id}`, src: x.preview, label: `Picture ${i + 1}` })),
        ...stagedVideos.map((x, i) => ({ key: `vid:${x.key}`, ...vid(x.video, i) })),
      ];
    }
    const urls = mediaImages ? mediaImages.map((m) => m.url) : product?.images ?? [];
    const videos = mediaVideos ?? readVideos(product?.videos);
    return [
      ...urls.map((url, i) => ({ key: url, src: url, label: `Picture ${i + 1}` })),
      ...videos.map((v, i) => ({ key: videoEntry(v), ...vid(v, i) })),
    ];
  }, [isEdit, staged, stagedVideos, mediaImages, mediaVideos, product]);
  // Media deleted on the Images & video tab is no longer a choice: drop it.
  const liveColorMedia = useMemo(() => {
    const cmp = (key: string) => (isEdit ? entryKey(key) : key);
    const keys = new Map(mediaChoices.map((p) => [cmp(p.key), p.key]));
    const out: Record<string, string[]> = {};
    for (const [color, list] of Object.entries(colorMedia)) {
      const hits = list.map((k) => keys.get(cmp(k))).filter((k): k is string => !!k);
      if (hits.length) out[color] = hits;
    }
    return out;
  }, [colorMedia, mediaChoices, isEdit]);
  // The variation the shop shows first (saved with the colour media).
  const savedDefault = useMemo(() => readDefaultVariant(product?.default_variant), [product]);
  const [defaultChoice, setDefaultChoice] = useState<DefaultChoice>(savedDefault);
  // Pictures pasted/dropped on a colour: added to the product, then to the colour.
  // A saved product uploads them now; a new one stages them like the Images tab.
  const [mediaVersion, setMediaVersion] = useState(0);
  const [busyColor, setBusyColor] = useState<string | null>(null);
  const addColorFiles = async (color: string, files: File[]) => {
    if (busyColor) return;
    const have = isEdit ? (mediaImages?.length ?? product?.images.length ?? 0) : staged.length;
    const room = MEDIA_MAX_PER_PRODUCT - have;
    if (room <= 0) {
      setFormError(`A product can have at most ${MEDIA_MAX_PER_PRODUCT} pictures.`);
      return;
    }
    setBusyColor(color);
    setFormError(null);
    try {
      let keys: string[] = [];
      if (!isEdit) {
        const { added, rejected } = await stageImageFiles(files, room);
        setStaged((cur) => [...cur, ...added]);
        keys = added.map((a) => `img:${a.id}`);
        if (rejected) setFormError(`${rejected} file(s) skipped: only JPEG, PNG, WebP or AVIF under 5 MB.`);
      } else if (product?.id) {
        const before = new Set((mediaImages ?? []).map((m) => m.id));
        const form = new FormData();
        await appendImageFiles(form, files.slice(0, room));
        const up = await fetch(`/api/admin/products/${product.id}/media`, { method: "POST", body: form });
        const body: { error?: string; data?: ProductImage[] } = await up.json().catch(() => ({}));
        if (!up.ok || !body.data) throw new Error(body.error ?? "Upload failed");
        setMediaImages(body.data);
        setMediaVersion((v) => v + 1); // the Images tab reloads its list
        keys = body.data.filter((m) => !before.has(m.id)).map((m) => m.url);
      }
      if (keys.length) setColorMedia((cur) => ({ ...cur, [color]: [...(cur[color] ?? []), ...keys] }));
    } catch (e) {
      setFormError(`Pictures not added: ${e instanceof Error ? e.message : "upload failed"}`);
    } finally {
      setBusyColor(null);
    }
  };

  /**
   * "+ New" next to Category / Sub-category / Brand. A name that already exists
   * (same letters, any case) is just selected. A slug that is taken gets a
   * short suffix and is tried once more.
   */
  const createCategory = async (name: string, parentId: string | null): Promise<string | null> => {
    const same = categories.find(
      (c) => (c.parent_id ?? null) === parentId && c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (same) {
      dispatch(parentId ? { type: "subCategory", id: same.id } : { type: "category", id: same.id, categories });
      return null;
    }
    const parentSlug = parentId ? categories.find((c) => c.id === parentId)?.slug : undefined;
    const base = newSlug(name, parentId ? "sub" : "cat");
    const post = (slug: string) =>
      fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, parent_id: parentId }),
      });
    try {
      let slug = base;
      let res = await post(slug);
      if (res.status === 409) {
        // A sub-category like "Racket" often clashes; prefer "<parent>-racket".
        slug = parentSlug && !base.startsWith(parentSlug) ? `${parentSlug}-${base}` : `${base}-${shortId()}`;
        res = await post(slug);
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) return body.error ?? "Could not create it.";
      const made: Category = { id: body.id, name, slug, parent_id: parentId };
      setCreatedCategories((list) => [...list, made]);
      const next = [...categories, made];
      dispatch(parentId ? { type: "subCategory", id: made.id } : { type: "category", id: made.id, categories: next });
      onCreated?.("category");
      return null;
    } catch {
      return "Network error. Try again.";
    }
  };

  const createBrand = async (name: string): Promise<string | null> => {
    const same = (brands ?? []).find((b) => b.name_en.trim().toLowerCase() === name.toLowerCase());
    if (same) {
      setBrandId(same.id);
      return null;
    }
    const post = (slug: string) =>
      fetch("/api/admin/catalog-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "brand", slug, name_en: name }),
      });
    try {
      const base = newSlug(name, "brand");
      let res = await post(base);
      if (res.status === 409) res = await post(`${base}-${shortId()}`);
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) return body.error ?? "Could not create it.";
      const id = body.id;
      setBrands((list) => [...(list ?? []), { id, name_en: name }].sort((a, b) => a.name_en.localeCompare(b.name_en)));
      setBrandId(id);
      return null;
    } catch {
      return "Network error. Try again.";
    }
  };

  /** POST and read back `{ id }`; an error text when it did not work. */
  const postNew = async (url: string, body: unknown): Promise<{ id: string } | { error: string }> => {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; data?: unknown; error?: string };
      const id = data.id ?? (typeof data.data === "string" ? data.data : undefined);
      if (!res.ok || !id) return { error: data.error ?? "Could not create it." };
      return { id };
    } catch {
      return { error: "Network error. Try again." };
    }
  };

  /** The id of the colour with this name, made first when there is none. */
  const makeColor = async (name: string, hex: string): Promise<{ id: string } | { error: string }> => {
    const same = colors.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (same) return { id: same.id };
    const r = await postNew("/api/admin/colors", { name, hex, is_global: true });
    if ("error" in r) return r;
    setCreatedColors((l) => [...l, { id: r.id, name, hex, category_id: null, is_global: true, display_order: 0, is_active: true }]);
    onCreated?.("color");
    return r;
  };

  /** The id of the size with this name, made first (with `type`) when there is none. */
  const makeSize = async (name: string, type: string): Promise<{ id: string } | { error: string }> => {
    const same = sizes.find(
      (s) => (s.display_name || s.name).trim().toLowerCase() === name.toLowerCase() || s.name.toLowerCase() === name.toLowerCase(),
    );
    if (same) return { id: same.id };
    // New sizes go after the existing ones in the size order.
    const sortKey = Math.max(0, ...sizes.map((s) => Number((s as SizeOption & { sort_key?: number }).sort_key) || 0)) + 1;
    // `type` = the size tab that is open (clothing / shoe / accessory).
    const r = await postNew("/api/admin/sizes", { name: name.toLowerCase(), display_name: name, type, sort_key: sortKey });
    if ("error" in r) return r;
    setCreatedSizes((l) => [...l, { id: r.id, name: name.toLowerCase(), display_name: name, type, is_active: true, display_order: 0 }]);
    onCreated?.("size");
    return r;
  };

  const PROMO_ERRORS: Record<string, string> = {
    duplicate_promotion_name: "A promotion with that name already exists.",
    invalid_flat_discount: "The ৳ amount is more than this product's saved price.",
    invalid_percentage_discount: "Percent must be 100 or less.",
    product_not_found: "Save the product first to use a ৳ amount.",
    invalid_timeframe: "The last day must be today or later.",
  };
  const createPromotion = async (p: NewPromotion): Promise<string | null> => {
    const startsAt = new Date();
    // Ends at the end of the chosen day, local time.
    const endsAt = new Date(`${p.endsOn}T23:59:59`);
    const payload: Record<string, unknown> = {
      name: p.name,
      discount_type: p.type,
      discount_value: p.value,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "active",
    };
    // A flat discount is checked against the products it covers, so it has to
    // name this (saved) product. A % one leaves the links to the product save.
    if (p.type === "flat" && product) payload.product_ids = [product.id];
    const r = await postNew("/api/admin/promotions", payload);
    if ("error" in r) return PROMO_ERRORS[r.error] ?? r.error;
    setCreatedPromotions((l) => [
      ...l,
      {
        id: r.id,
        name: p.name,
        description: null,
        discount_type: p.type,
        discount_value: p.value,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "active",
        badge_label: null,
      } as Promotion,
    ]);
    if (!state.promotionIds.includes(r.id)) dispatch({ type: "togglePromotion", id: r.id });
    onCreated?.("promotion");
    return null;
  };

  const [state, dispatch] = useReducer(reducer, product, (p) => {
    if (!p) return blankState();
    return {
      ...blankState(),
      title: p.title ?? "",
      slug: p.slug ?? "",
      // The ids are the authority. A product whose category_id is NULL but
      // whose name is set is a row written before the id existed; it is shown
      // unassigned rather than guessed at, because guessing would attach it to
      // a parent it never had.
      categoryId: p.category_id ?? "",
      subCategoryId: p.sub_category_id ?? "",
      description: p.description ?? "",
      // Read from regular_price, which is what the server writes and the only
      // one of the three money columns that is an input rather than a derived
      // output. Falling back to price would let a legacy 0-price row look
      // populated in the form and be re-saved as a free product.
      regular_price: Number(p.regular_price ?? 0),
      // Rows written before discount_mode existed are read the way the
      // migration backfilled them: a discount means 'custom', no discount with
      // a promotion linked means 'promotion', otherwise 'none'. Guessing from
      // the numbers rather than falling back to a fixed default is what lets an
      // old product reopen on the model it was actually saved with.
      discount_mode:
        p.discount_mode && isProductDiscountMode(p.discount_mode)
          ? p.discount_mode
          : Number(p.discount_value ?? 0) > 0
            ? "custom"
            : (p.promotion_ids?.length ?? 0) > 0
              ? "promotion"
              : "none",
      discount_type: (p.discount_type ?? "percentage") as DiscountType,
      discount_value: Number(p.discount_value ?? 0),
      // The new price of comparison mode is the stored sale price, so
      // comparison mode round-trips a product saved through it instead of
      // coming back with an empty second field.
      comparison_price: Number(p.price ?? p.regular_price ?? 0),
      cost_price: p.cost_price === null || p.cost_price === undefined ? "" : String(Number(p.cost_price)),
      stock: Number(p.stock ?? 0),
      is_featured: p.is_featured ?? false,
      status: p.status ?? "draft",
      // Read through the type guard rather than cast: the column is
      // CHECK-constrained, but a value written before the check existed, or by
      // a direct SQL write, must not put an unrecognised string into the select
      // where React would render it as an option with no label.
      gender: p.gender && isProductGender(p.gender) ? p.gender : null,
      specs: Object.entries(p.specs ?? {}).map(([key, value]) => ({
        uid: nextSpecUid(),
        key,
        value: String(value),
      })),
      colorIds: p.color_ids ?? [],
      sizeIds: p.size_ids ?? [],
      matrix: matrixFromProduct(p),
      promotionIds: p.promotion_ids ?? [],
    };
  });

  // The categories arrive after the form mounts, so a product can be opened
  // before its parent is known. Until they do, the sub-category dropdown is
  // empty and the id is left alone: rewriting it here is what used to drop a
  // valid sub-category whenever the category list was refetched.
  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const children = useMemo(
    () => categories.filter((c) => !!c.parent_id && c.parent_id === state.categoryId),
    [categories, state.categoryId],
  );

  // Size tab: the one the admin opened, else a guess from the chosen sizes / category.
  const [sizeGroupPicked, setSizeGroupPicked] = useState<string | null>(null);
  const sizeGroup =
    sizeGroupPicked ??
    guessSizeGroup(
      sizes,
      state.sizeIds,
      categories
        .filter((c) => c.id === state.categoryId || c.id === state.subCategoryId)
        .map((c) => `${c.name} ${(c as { slug?: string }).slug ?? ""}`)
        .join(" "),
    );

  const set = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => dispatch({ type: "set", field, value }),
    [],
  );

  // The slug follows the title until it is edited by hand, then it is left
  // alone: a slug that changes after a product has been shared is a broken
  // link, and overwriting an admin's deliberate slug is worse than an untidy
  // generated one.
  const onTitleChange = (value: string) => {
    dispatch({ type: "set", field: "title", value });
    if (!slugTouched) dispatch({ type: "set", field: "slug", value: slugify(value) });
  };

  const totalStock = useMemo(
    () => Object.values(state.matrix).reduce((sum, cell) => sum + (cell.is_active ? cell.stock : 0), 0),
    [state.matrix],
  );

  // The discount, normalised once.
  //
  // The three authoring modes collapse to one (regular_price, discount_type,
  // discount_value) triple, and everything below -- the price preview, the
  // badge preview, the comparison readout, the payload -- reads this one value
  // rather than each re-deriving the mode. That is what keeps the badge the
  // admin sees in the form identical to the badge the storefront renders, and
  // the price preview identical to the price that gets stored.
  const discount = useMemo(
    () =>
      normalizeDiscount({
        mode: state.discount_mode,
        regular: state.regular_price,
        discountType: state.discount_type,
        discountValue: state.discount_value,
        comparisonPrice: state.comparison_price,
      }),
    [
      state.discount_mode,
      state.regular_price,
      state.discount_type,
      state.discount_value,
      state.comparison_price,
    ],
  );

  const derived = useMemo(
    () => deriveDiscount(state.regular_price, discount.type, discount.value),
    [state.regular_price, discount.type, discount.value],
  );

  // The badge the storefront will show, in the wording it will use.
  //
  // In promotion mode the badge is the promotion's own: its label if it has
  // one, otherwise its discount, styled with its own badge_type. Previewing the
  // product's own "15% OFF" there instead would show the admin one badge and
  // ship another, and the promotion's badge is the one that carries a seasonal
  // or "popular" claim rather than a price one.
  const badgePreview = useMemo(() => {
    if (state.discount_mode === "promotion") {
      const chosen = promotions.filter((p) => state.promotionIds.includes(p.id));
      const promo = chosen[0];
      if (!promo) return null;
      const label =
        promo.badge_label?.trim() ||
        (promo.discount_type === "percentage"
          ? `${Math.round(Number(promo.discount_value))}% OFF`
          : `${Number(promo.discount_value)} OFF`);
      return {
        label,
        type: promo.badge_type ?? "discount",
        // What the promotion does to THIS product's price, which is the number
        // an admin is actually deciding on.
        sale: salePrice(
          state.regular_price,
          promo.discount_type as DiscountType,
          Number(promo.discount_value),
        ),
        source: promo.name,
      };
    }
    if (!derived.badgeLabel) return null;
    return { label: derived.badgeLabel, type: "discount" as const, sale: derived.sale, source: null };
  }, [
    state.discount_mode,
    state.promotionIds,
    state.regular_price,
    promotions,
    derived.badgeLabel,
    derived.sale,
  ]);

  /**
   * The payload. Names for the category and sub-category are deliberately
   * absent: the server resolves them from the ids and a trigger keeps the two
   * columns in step, so sending a name would give the client a second way to
   * set the same fact.
   *
   * price, original_price and discount_percent are just as deliberately
   * absent, because the server derives all three from regular_price and the
   * discount below. Sending a sale price would be sending a value the server
   * ignores, which is how a 0-price product looks deliberate to the next
   * person to read this code.
   *
   * `stock` is absent for the same reason, and it was a real omission until
   * this pass: admin_save_product never wrote products.stock. A trigger keeps
   * it equal to the sum of the active variants, so the number the Stock field
   * displayed was already not the number that would be stored. The field
   * itself is kept, because the admin still sets per-variant stock in the
   * matrix and the product total is useful to see, but it is labelled as
   * derived and it is not sent.
   */
  const buildPayload = () => {
    const specs: Record<string, string> = {};
    for (const { key, value } of state.specs) {
      const k = key.trim();
      // A pair with a value but no name cannot be stored, because specs is an
      // object keyed by name. Dropping it silently would lose the value.
      if (k) specs[k] = value;
    }

    return {
      ...(isEdit ? { id: product!.id } : {}),
      title: state.title.trim(),
      slug: state.slug.trim(),
      category_id: state.categoryId || null,
      sub_category_id: state.subCategoryId || null,
      description: state.description,
      regular_price: state.regular_price,
      // The mode, the mode's own inputs, and nothing derived. The server
      // normalises the four modes onto one (regular_price, discount_type,
      // discount_value) triple and derives the sale price, the percentage and
      // the badge from it, so this payload carries only what the admin chose.
      discount_mode: state.discount_mode,
      discount_type: state.discount_type,
      discount_value: state.discount_value,
      comparison_price: state.comparison_price,
      // Blank = not recorded (server stores NULL), never 0.
      cost_price: state.cost_price.trim(),
      // badge and badge_type are NOT sent. They are derived from the discount
      // above, on every save, by the server -- which is what stops a badge from
      // being able to contradict the price beside it.
      is_featured: state.is_featured,
      status: state.status,
      // Sent as JSON null, which the server's NULLIF turns into SQL NULL, so
      // "not assigned" stays distinct from all three audiences and the
      // Unassigned filter bucket remains reachable.
      gender: state.gender,
      specs,
      color_ids: state.colorIds,
      size_ids: state.sizeIds,
      promotion_ids: state.promotionIds,
      // Every selected pair is sent, including the ones at zero stock, so the
      // matrix the server builds is the one on screen.
      variants: Object.entries(state.matrix).map(([key, cell]) => {
        const [colorId, sizeId] = key.split(":");
        return {
          color_id: colorId === "-" ? null : colorId,
          size_id: sizeId === "-" ? null : sizeId,
          stock: cell.stock,
          price_override: cell.price_override === null || cell.price_override === "" ? null : cell.price_override,
          sku: cell.sku,
          is_active: cell.is_active,
        };
      }),
    };
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!state.title.trim()) {
      setFormError("A title is required.");
      return;
    }
    if (!state.slug.trim()) {
      setFormError("A slug is required.");
      return;
    }
    if (!state.categoryId) {
      setFormError("Choose a category.");
      return;
    }
    // The database refuses a non-positive price, so this check is not a
    // nicety: without it the save would fail with a sentence written for a
    // database reader rather than for the person holding the form.
    if (!(state.regular_price > 0)) {
      setFormError("Enter a price greater than zero.");
      return;
    }
    if (state.cost_price.trim() !== "" && !(Number(state.cost_price) >= 0)) {
      setFormError("Buying price must be zero or more (or leave it blank).");
      return;
    }
    // The discount is validated through the same normalisation the payload is
    // built with, so what is checked here is what will actually be stored. The
    // old checks were written against discount_type/discount_value directly,
    // which meant they silently did not apply in comparison mode -- the mode
    // whose whole purpose is a new price, and the one most likely to be typed
    // badly.
    if (state.discount_mode === "comparison") {
      if (state.comparison_price < 0) {
        setFormError("The new price cannot be negative.");
        return;
      }
      if (state.comparison_price > state.regular_price) {
        setFormError(
          "The new price is higher than the old price, which is a price rise rather than a discount. Use a custom discount of zero, or lower the old price.",
        );
        return;
      }
    }
    if (state.discount_mode === "custom") {
      if (state.discount_value < 0) {
        setFormError("A discount cannot be negative.");
        return;
      }
      if (state.discount_type === "percentage" && state.discount_value > 100) {
        setFormError("A percentage discount cannot be more than 100.");
        return;
      }
      if (state.discount_type === "flat" && state.discount_value > state.regular_price) {
        setFormError("A flat discount cannot be more than the price.");
        return;
      }
    }
    if (state.discount_mode === "promotion" && state.promotionIds.length === 0) {
      setFormError("Choose a promotion, or switch to another discount mode.");
      return;
    }
    const unnamedSpec = state.specs.some((s) => !s.key.trim() && s.value.trim());
    if (unnamedSpec) {
      setFormError("Every spec needs a name, or the value has nowhere to go.");
      return;
    }
    // specs is an object keyed by name, so two rows sharing a name are one row
    // and the second silently overwrites the first. "Fabric: Cotton" and
    // "Fabric: Linen" saved as a single Fabric spec reading "Linen", and the
    // admin was shown no warning. Case-insensitive because the storefront
    // shows names as labels, where "Fabric" and "fabric" read as one spec.
    const seenSpecs = new Set<string>();
    let duplicateSpec: string | null = null;
    for (const s of state.specs) {
      const k = s.key.trim().toLowerCase();
      if (!k) continue;
      if (seenSpecs.has(k)) {
        duplicateSpec = s.key.trim();
        break;
      }
      seenSpecs.add(k);
    }
    if (duplicateSpec) {
      setFormError(`Two specs are both named "${duplicateSpec}". Spec names have to be different.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data: { error?: string; data?: { id?: string } } = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save product");
      }
      // A new product has an id only now, so its staged pictures go up next.
      // They are already small WebP files. If this step fails the product is
      // saved, so say so rather than losing the work.
      // Staged picture id → its url once uploaded (rows come back in upload order).
      const stagedUrl = new Map<string, string>();
      const stagedVideo = new Map<string, ProductVideo>();
      if (!isEdit && staged.length > 0 && data.data?.id) {
        const form = new FormData();
        await appendImageFiles(form, staged.map((img) => img.file));
        const up = await fetch(`/api/admin/products/${data.data.id}/media`, { method: "POST", body: form });
        const body: { error?: string; data?: ProductImage[] } = await up.json().catch(() => ({}));
        if (!up.ok) {
          alert(`The product was saved, but its images were not uploaded (${body.error ?? "upload failed"}). Open the product and add them under Images.`);
        } else if (body.data?.length === staged.length) {
          staged.forEach((s, i) => stagedUrl.set(s.id, body.data![i].url));
        }
      }
      if (!isEdit && stagedVideos.length > 0 && data.data?.id) {
        const { error: videoError, saved } = await uploadStagedVideos(data.data.id, stagedVideos);
        saved.forEach((v, key) => stagedVideo.set(key, v));
        if (videoError) {
          alert(`The product was saved, but not all its videos were (${videoError}). Open the product and add them under Images & video.`);
        }
      }
      const savedId = product?.id ?? data.data?.id;
      if (savedId && brandId !== savedBrandId) {
        const res = await fetch(`/api/admin/products/${savedId}/brand`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term_id: brandId || null }),
        });
        if (!res.ok) {
          const body: { error?: string } = await res.json().catch(() => ({}));
          alert(`The product was saved, but its brand was not (${body.error ?? "failed"}). Open the product and choose the brand again.`);
        }
      }
      // Colour media, only the product's current colours, only when changed.
      if (savedId) {
        const names = new Set(
          colors.filter((c) => state.colorIds.includes(c.id)).map((c) => c.name.trim().toLowerCase()),
        );
        const toEntry = (key: string): string | undefined => {
          if (isEdit) return key;
          if (key.startsWith("img:")) return stagedUrl.get(key.slice(4));
          const v = stagedVideo.get(key.slice(4));
          return v ? videoEntry(v) : undefined;
        };
        const next: Record<string, string[]> = {};
        for (const [color, list] of Object.entries(liveColorMedia)) {
          const entries = list.map(toEntry).filter((x): x is string => !!x);
          if (entries.length && names.has(color)) next[color] = entries;
        }
        const flat = (m: Record<string, string[]>) =>
          JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k].map(entryKey)]));
        const first: DefaultChoice = {
          color: defaultChoice.color && names.has(defaultChoice.color) ? defaultChoice.color : undefined,
          size: defaultChoice.size,
        };
        const sameFirst = (first.color ?? "") === (savedDefault.color ?? "") && (first.size ?? "") === (savedDefault.size ?? "");
        if (flat(next) !== flat(savedColorMedia) || !sameFirst) {
          const res = await fetch(`/api/admin/products/${savedId}/color-images`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ color_images: next, default_variant: first }),
          });
          if (!res.ok) {
            const body: { error?: string } = await res.json().catch(() => ({}));
            alert(`The product was saved, but its colour pictures were not (${body.error ?? "failed"}). Open the product and pick them again under Variations.`);
          }
        }
      }
      // Last, so the AI writer sees the pictures and brand saved above.
      if (savedId) {
        const seoError = await sendSeoDraft(savedId, seoDraft);
        if (seoError && seoDraft.mode === "manual") {
          alert(`The product was saved, but its search text was not (${seoError}). Open the product and check the SEO tab.`);
        }
      }
      for (const img of staged) URL.revokeObjectURL(img.preview);
      releaseStagedVideos(stagedVideos);
      onSuccess();
    } catch (err) {
      // The message comes from the server's own wording, which already names
      // the field that is wrong, so it is shown as-is.
      setFormError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Full-screen form in the style of an ERP record: a top bar with the
    // breadcrumb and Save/Discard, one card with the big name field, and tabs
    // for the rest. Escape discards.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pf-title-heading"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 bg-surface-subtle overflow-y-auto"
    >
      <div className="sticky top-0 z-10 bg-surface-card border-b border-border-light">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
          >
            <ArrowLeft className="w-4 h-4" /> Products
          </button>
          <span className="text-text-muted">/</span>
          <h2 id="pf-title-heading" className="font-display text-base font-bold text-primary truncate">
            {state.title.trim() || (isEdit ? "Edit product" : "New product")}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex rounded-lg border border-border-light overflow-hidden" role="group" aria-label="Status">
              {statusOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={state.status === o.value}
                  onClick={() => set("status", o.value as ProductStatus)}
                  className={`px-3 h-8 text-xs font-semibold ${
                    state.status === o.value ? "bg-primary text-white" : "text-text-muted hover:bg-surface-subtle"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {isEdit && (
              <a
                href={`/preview/product/${product!.id}`}
                target="_blank"
                rel="noopener"
                title="Opens the last saved version. Save first to see new changes."
                className="inline-flex items-center gap-1.5 px-3 h-8 border border-border-light rounded-lg text-sm font-semibold text-text-muted hover:bg-surface-subtle"
              >
                <Eye className="w-4 h-4" /> Preview
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 h-8 border border-border-light rounded-lg text-sm font-semibold text-text-muted hover:bg-surface-subtle"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 h-8 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-container disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-surface-card rounded-xl border border-border-light shadow-sm">
          <div className="p-6 flex items-start gap-6">
            <div className="flex-1 min-w-0 space-y-3">
              <input
                id="pf-title"
                type="text"
                value={state.title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="e.g. Kookaburra Kahuna Cricket Bat"
                aria-label="Product name"
                className="w-full text-2xl font-display font-bold bg-transparent border-0 border-b border-border-light focus:border-primary focus:outline-none py-1 placeholder:text-text-muted/50"
              />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-on-surface">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="pf-featured"
                    checked={state.is_featured}
                    onChange={(e) => set("is_featured", e.target.checked)}
                  />
                  Featured
                </label>
                <span className="text-[11px] text-text-muted">
                  Bat, ball, kit, accessories — anything. Add colours and sizes/options under Variants only if the
                  product comes in more than one version.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTab("images")}
              aria-label="Product images"
              className="shrink-0 w-24 h-24 rounded-lg border border-border-light bg-surface-subtle overflow-hidden flex items-center justify-center text-text-muted hover:border-primary"
            >
              {staged[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={staged[0].preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-8 h-8" />
              )}
            </button>
          </div>

          <div className="px-6 border-b border-border-light flex gap-1 overflow-x-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 h-10 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:text-on-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

        <div className="p-6 space-y-4">
          {formError && (
            <div className="bg-badge-discount/10 border border-badge-discount/30 rounded-lg p-3" role="alert">
              <p className="text-badge-discount text-sm">{formError}</p>
            </div>
          )}

          <div hidden={tab !== "general"} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-slug" className={labelClass}>
                Slug *
              </label>
              <input
                id="pf-slug"
                type="text"
                value={state.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", slugify(e.target.value));
                }}
                className={inputClass}
              />
            </div>

            <Dropdown
              id="pf-category"
              label="Category"
              required
              loading={categoriesLoading}
              value={state.categoryId}
              onChange={(id) => dispatch({ type: "category", id, categories })}
              onCreate={(name) => createCategory(name, null)}
              createPlaceholder="New category name"
            >
              <option value="">Select category</option>
              {parents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Dropdown>

            <Dropdown
              id="pf-subcategory"
              label="Sub-category"
              value={state.subCategoryId}
              disabled={!state.categoryId}
              loading={categoriesLoading}
              hint={
                !state.categoryId
                  ? "Choose a category first."
                  : children.length === 0
                    ? "This category has no sub-categories."
                    : undefined
              }
              onChange={(id) => dispatch({ type: "subCategory", id })}
              onCreate={(name) => createCategory(name, state.categoryId)}
              createPlaceholder="New sub-category name"
            >
              <option value="">No sub-category</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Dropdown>

            <Dropdown
              id="pf-brand"
              label="Brand"
              value={brandId}
              loading={brands === null}
              hint={brands && brands.length === 0 ? "No brands yet. Use + New to add one." : undefined}
              onChange={setBrandId}
              onCreate={createBrand}
              createPlaceholder="New brand name"
            >
              <option value="">No brand</option>
              {(brands ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_en}
                </option>
              ))}
            </Dropdown>

            <div>
              <label htmlFor="pf-price" className={labelClass}>
                Price *
              </label>
              <input
                id="pf-price"
                type="number"
                min={0}
                step="0.01"
                value={state.regular_price || ""}
                onChange={(e) => set("regular_price", parseFloat(e.target.value) || 0)}
                className={inputClass}
                placeholder="4500"
              />
              {state.regular_price > 0 && (
                <p className="mt-1 text-[11px] text-text-muted">
                  {state.discount_mode === "promotion" ? (
                    <>
                      Shoppers pay {formatTaka(derived.sale)}, or the promotion price while it runs —
                      whichever is lower. The storefront price is worked out on the server.
                    </>
                  ) : (
                    <>
                      Shoppers pay{" "}
                      <span className="font-semibold text-on-surface">
                        {formatTaka(derived.sale)}
                      </span>
                      {derived.hasDiscount && (
                        <>
                          , reduced from{" "}
                          <span className="line-through">{formatTaka(state.regular_price)}</span>
                        </>
                      )}
                      . The storefront price is worked out on the server.
                    </>
                  )}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="pf-cost" className={labelClass}>
                Buying price
              </label>
              <input
                id="pf-cost"
                type="number"
                min={0}
                step="0.01"
                value={state.cost_price}
                onChange={(e) => set("cost_price", e.target.value)}
                className={inputClass}
                placeholder="2800"
              />
              <p className="mt-1 text-[11px] text-text-muted">
                What one piece cost you. Not shown to shoppers. Used for cost and profit in the business report;
                a supplier purchase also updates it.
                {state.cost_price.trim() !== "" && state.regular_price > 0 && (
                  <>
                    {" "}Margin:{" "}
                    <span className="font-semibold text-on-surface">
                      {formatTaka(derived.sale - Number(state.cost_price))}
                    </span>{" "}
                    a piece.
                  </>
                )}
              </p>
            </div>

            <Dropdown
              id="pf-status"
              label="Status"
              value={state.status}
              onChange={(v) => set("status", v as ProductStatus)}
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Dropdown>

            <Dropdown
              id="pf-gender"
              label="Gender / Age Category"
              // The select's "not assigned" option has an empty value, so the
              // empty string is translated back to null on the way in. The two
              // are the same thing to the database and different things to a
              // <select>.
              value={state.gender ?? ""}
              onChange={(v) =>
                set("gender", v === "" ? null : (v as ProductGender))
              }
              hint={
                state.gender
                  ? `Shown in the ${
                      PRODUCT_GENDER_LABELS[state.gender]
                    } section of the storefront.`
                  : "Not assigned. The product still saves and still shows in Shop All, but it will be missing from the Men, Women and Kids sections until this is set."
              }
            >
              <option value="">Not assigned</option>
              {PRODUCT_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {PRODUCT_GENDER_LABELS[g]}
                </option>
              ))}
            </Dropdown>

            <div>
              <label htmlFor="pf-stock" className={labelClass}>
                Stock
              </label>
              <input
                id="pf-stock"
                type="number"
                min={0}
                disabled={state.colorIds.length > 0 || state.sizeIds.length > 0}
                value={state.colorIds.length > 0 || state.sizeIds.length > 0 ? totalStock : state.stock}
                onChange={(e) => set("stock", parseInt(e.target.value, 10) || 0)}
                className={inputClass + (state.colorIds.length > 0 || state.sizeIds.length > 0 ? " bg-surface-subtle" : "")}
                title={
                  state.colorIds.length > 0 || state.sizeIds.length > 0
                    ? "With colours or sizes chosen, stock is the total across the matrix."
                    : undefined
                }
              />
              {(state.colorIds.length > 0 || state.sizeIds.length > 0) && (
                <p className="mt-1 text-[11px] text-text-muted">
                  This is the total across every variant, recalculated by the database. Set each
                  figure in the matrix below.
                </p>
              )}
            </div>

          </div>

          {/*
            The Discount module.

            This replaces three separate fields -- a discount type and value, a
            free-text Badge, and a Badge Type dropdown -- plus the standalone
            Promotions picker. Those were four controls describing one thing, and
            nothing connected them: the badge was typed by hand beside a price the
            server had derived, so a product could be labelled SALE at full price
            and a product 40% under could carry no badge at all, with no check
            anywhere able to notice. Everything a shopper sees about the saving now
            comes from the numbers below, and the badge is what those numbers say
            rather than a second opinion about them.
          */}
          <div className="border border-border-light rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={labelClass}>Discount</p>
                <p className="text-[11px] text-text-muted">
                  {MODE_HELP[state.discount_mode]}
                </p>
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Discount mode">
                {DISCOUNT_MODES.map((m) => {
                  const on = state.discount_mode === m;
                  // Promotion is offered only when there is something to select.
                  // An empty promotion list is not a reason to hide the mode --
                  // it is a reason to say so inside it.
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={on}
                      onClick={() => dispatch({ type: "setDiscountMode", mode: m })}
                      className={`px-3 h-8 text-xs font-semibold rounded-lg border transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border-light text-text-muted hover:border-primary/40"
                      }`}
                    >
                      {DISCOUNT_MODE_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* --- price comparison: two prices, saving derived --- */}
            {state.discount_mode === "comparison" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pf-old-price" className={labelClass}>
                      Old price
                    </label>
                    <input
                      id="pf-old-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={state.regular_price || ""}
                      onChange={(e) => set("regular_price", parseFloat(e.target.value) || 0)}
                      className={inputClass}
                      placeholder="4500"
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-new-price" className={labelClass}>
                      New price
                    </label>
                    <input
                      id="pf-new-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={state.comparison_price || ""}
                      onChange={(e) => set("comparison_price", parseFloat(e.target.value) || 0)}
                      className={inputClass}
                      placeholder="3500"
                    />
                  </div>
                </div>
                {/*
                  The visual comparison. The struck-through old price beside the
                  new one is what a shopper is shown on a product card, so it is
                  shown here too -- an admin should be approving the same
                  comparison the storefront will render, not a table of inputs.

                  The saving is the DIFFERENCE and the percentage, rather than
                  only the percentage: a percentage is the harder of the two to
                  judge against a price, and 15% of 700 is not obviously 105.
                */}
                {state.regular_price > 0 && state.comparison_price > 0 && (
                  <div className="flex flex-wrap items-center gap-3 bg-surface-subtle rounded-lg px-3 py-2.5">
                    <span className="line-through text-text-muted">
                      {formatTaka(state.regular_price)}
                    </span>
                    <span className="text-text-muted" aria-hidden>
                      &rarr;
                    </span>
                    <span className="font-display text-base font-semibold text-primary">
                      {formatTaka(state.comparison_price)}
                    </span>
                    {derived.hasDiscount && (
                      <>
                        <span className="text-[11px] text-text-muted">
                          Save {formatTaka(state.regular_price - derived.sale)} ({derived.percent}% off)
                        </span>
                        {/*
                          Two things can differ between what was typed and what
                          will be stored, and the admin is told about both rather
                          than discovering either on the storefront.

                          The PRICE, when a two-decimal percentage cannot express
                          the pair exactly: 349.99 off 400 is 12.5025%, stored as
                          12.50%, and 12.50% of 400 is 350.00. The stored price is
                          deliberately the one the percentage produces, because
                          get_effective_prices() recomputes the price from the
                          percentage at read time -- storing the typed figure
                          instead would show one price on a product card and
                          charge another at checkout. Every pair a shop actually
                          uses (1000 to 850, 400 to 350) is exact; this only
                          bites on an odd paisa.

                          The PERCENTAGE, because the badge rounds to a whole
                          number for display while the stored value keeps its
                          two decimals.
                        */}
                        {derived.sale !== state.comparison_price && (
                          <span className="text-[11px] font-semibold text-primary">
                            Stores as {formatTaka(derived.sale)} — the nearest price a{" "}
                            {discount.value}% discount gives.
                          </span>
                        )}
                        {derived.percent !== discount.value && (
                          <span className="text-[11px] text-text-muted">
                            Stored as {discount.value}% and shown rounded to {derived.percent}%.
                          </span>
                        )}
                      </>
                    )}
                    {!derived.hasDiscount && state.comparison_price >= state.regular_price && (
                      <span className="text-[11px] text-text-muted">
                        The new price is not below the old one, so this is not a discount.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --- custom: manual amount or percentage --- */}
            {state.discount_mode === "custom" && (
              <div className="space-y-3">
                <div className="flex gap-2 max-w-sm">
                  <div className="w-40">
                    <select
                      aria-label="Discount type"
                      value={state.discount_type}
                      onChange={(e) => set("discount_type", e.target.value as DiscountType)}
                      className={fieldClass}
                    >
                      <option value="percentage">Percentage off</option>
                      <option value="flat">Amount off (৳)</option>
                    </select>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label="Discount value"
                    value={state.discount_value || ""}
                    onChange={(e) => set("discount_value", parseFloat(e.target.value) || 0)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                {/*
                  A flat amount stores no percentage, so one is worked out from
                  the two prices. It is shown because "150 off" and "21% off" are
                  the same markdown and an admin choosing between them needs to
                  see that they are.
                */}
                {derived.hasDiscount && (
                  <div className="flex flex-wrap items-center gap-3 bg-surface-subtle rounded-lg px-3 py-2.5">
                    <span className="line-through text-text-muted">
                      {formatTaka(state.regular_price)}
                    </span>
                    <span className="text-text-muted" aria-hidden>
                      &rarr;
                    </span>
                    <span className="font-display text-base font-semibold text-primary">
                      {formatTaka(derived.sale)}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      Save {formatTaka(state.regular_price - derived.sale)} ({derived.percent}% off)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* --- promotion: the discount comes from Promotions --- */}
            {state.discount_mode === "promotion" && (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className={labelClass} id="pf-promotions">
                    Promotions
                  </p>
                  {!promotionsLoading && adding !== "promotion" && (
                    <NewButton onClick={() => setAdding("promotion")} className="mb-1.5" />
                  )}
                </div>
                {adding === "promotion" && (
                  <div className="mb-2">
                    <PromotionCreate allowFlat={isEdit} onCreate={createPromotion} onDone={() => setAdding(null)} />
                  </div>
                )}
                {promotionsLoading ? (
                  <div className={inputClass + " bg-surface-subtle animate-pulse"} aria-hidden />
                ) : promotions.length === 0 ? (
                  adding !== "promotion" && (
                    <p className="text-[11px] text-text-muted">
                      No promotions yet. Use + New to make one here, or switch to a custom discount to price
                      this product directly.
                    </p>
                  )
                ) : (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="pf-promotions">
                    {promotions.map((promo) => {
                      const on = state.promotionIds.includes(promo.id);
                      const live =
                        promo.status === "active" &&
                        new Date(promo.starts_at) <= new Date() &&
                        new Date(promo.ends_at) > new Date();
                      return (
                        <button
                          type="button"
                          key={promo.id}
                          aria-pressed={on}
                          onClick={() => dispatch({ type: "togglePromotion", id: promo.id })}
                          className={`${chipClass} ${
                            on
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "text-text-muted hover:border-primary/40"
                          }`}
                        >
                          {promo.name}
                          <span className="text-[10px] opacity-70">
                            {promo.discount_type === "percentage"
                              ? `${Math.round(Number(promo.discount_value))}%`
                              : `৳${Number(promo.discount_value)}`}
                          </span>
                          {/* A linked but not-yet-live promotion is the normal
                              state for a scheduled campaign, so it is labelled
                              rather than hidden -- an admin who cannot tell a
                              scheduled promotion from a broken one cannot use
                              the feature. */}
                          {!live && (
                            <span className="text-[10px] opacity-60">scheduled</span>
                          )}
                          {on && <Check className="w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-text-muted">
                  The promotion applies while its dates are live, and supplies the badge. A
                  promotion that would raise the price is ignored, and a coupon is applied on top of
                  the lower of the two.
                </p>
              </div>
            )}

            {/* --- the generated badge --- */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-light">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                Badge
              </span>
              {badgePreview ? (
                <>
                  {/* Rendered with the real badge styling, not described in
                      words: badgeClass is what the storefront calls, so the
                      colour here is the colour there. */}
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${badgeClass(badgePreview.type)}`}
                  >
                    {badgePreview.label}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    Generated from the discount
                    {badgePreview.source ? ` by the “${badgePreview.source}” promotion` : ""}. It
                    cannot be typed over, so it cannot contradict the price.
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-text-muted">
                  No badge. One is generated as soon as there is a discount
                  {state.discount_mode === "promotion" && state.promotionIds.length === 0
                    ? " and a promotion is chosen"
                    : ""}
                  .
                </span>
              )}
            </div>
          </div>
          </div>

          <div hidden={tab !== "description"} className="space-y-4">
          <div>
            <label htmlFor="pf-description" className={labelClass}>
              Description
            </label>
            <RichTextEditor
              value={state.description}
              onChange={(html) => set("description", html)}
              onSanitised={() =>
                setFormError("Some formatting was removed because it is not allowed in a description.")
              }
            />
          </div>
          </div>

          <div hidden={tab !== "images"} className="space-y-4">
          {isEdit && product?.id ? (
            <>
              <ProductMediaManager key={mediaVersion} productId={product.id} onChange={setMediaImages} />
              <ProductVideoManager
                productId={product.id}
                onSavedChange={setMediaVideos}
                onReplaced={(before, after) => {
                  const from = videoEntry(before);
                  const to = videoEntry(after);
                  setColorMedia((cur) =>
                    Object.fromEntries(Object.entries(cur).map(([color, list]) => [color, list.map((k) => (k === from ? to : k))])),
                  );
                }}
              />
            </>
          ) : (
            <>
              <StagedImagePicker images={staged} onChange={setStaged} disabled={submitting} />
              <ProductVideoManager staged={stagedVideos} onStagedChange={setStagedVideos} />
            </>
          )}
          </div>

          {/* Variations: added one by one (or a few at a time), WooCommerce style. */}
          <div hidden={tab !== "variants"}>
            <VariationsPanel
              colors={state.colorIds.flatMap((id) => colors.filter((c) => c.id === id))}
              sizes={state.sizeIds.flatMap((id) => sizes.filter((x) => x.id === id).map((x) => x.display_name))}
              choices={mediaChoices}
              value={liveColorMedia}
              onChange={setColorMedia}
              defaultChoice={defaultChoice}
              onDefaultChange={setDefaultChoice}
              onAddFiles={(color, files) => void addColorFiles(color, files)}
              busyColor={busyColor}
              disabled={submitting}
              editor={{
                colors,
                sizes,
                loading: colorsLoading || sizesLoading,
                value: { colorIds: state.colorIds, sizeIds: state.sizeIds, matrix: state.matrix },
                onChange: (value) => dispatch({ type: "variants", value }),
                basePrice: state.regular_price,
                disabled: submitting,
                sizeGroup,
                onSizeGroupChange: setSizeGroupPicked,
                makeColor,
                makeSize,
              }}
            />
          </div>

          <div hidden={tab !== "seo"}>
            <SeoPanel
              productId={product?.id}
              name={state.title}
              slug={state.slug}
              draft={seoDraft}
              onDraftChange={setSeoDraft}
              disabled={submitting}
            />
          </div>

          <div hidden={tab !== "specs"} className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className={`${labelClass} mb-0`}>Specs</p>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSpecPasteOpen((v) => !v)}
                  className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                >
                  Paste list
                </button>
                {state.specs.some((s) => s.key.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(specsToText(state.specs)).then(() => {
                        setSpecNote("Copied. Paste it into another product or a sheet.");
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-on-surface border border-border-light rounded-lg hover:bg-surface-subtle transition-colors"
                  >
                    Copy all
                  </button>
                )}
                {state.specs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Remove all specs from this product?")) dispatch({ type: "clearSpecs" });
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-text-muted border border-border-light rounded-lg hover:text-badge-discount transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-text-muted mb-2">
              Tip: copy the two columns (name and value) from Google Sheets or Excel and paste into any box below. Every row is filled at once.
              Lines like &quot;Weight: 85 g&quot; work too.
            </p>
            {specPasteOpen && (
              <div className="mb-3 space-y-2 p-3 rounded-lg border border-border-light bg-surface-subtle">
                <textarea
                  value={specPasteText}
                  onChange={(e) => setSpecPasteText(e.target.value)}
                  rows={6}
                  autoFocus
                  placeholder={"Brand\tVE\nModel\tTitan 10\nWeight\t85 g\n\nor\n\nBrand: VE\nModel: Titan 10"}
                  className={`${inputClass} font-mono text-xs`}
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-muted">
                    {specPasteText.trim() ? `${parseSpecPaste(specPasteText).length} specs found` : "Paste the list above"}
                  </span>
                  <button
                    type="button"
                    disabled={parseSpecPaste(specPasteText).length === 0}
                    onClick={() => {
                      const pairs = parseSpecPaste(specPasteText);
                      dispatch({ type: "mergeSpecs", pairs });
                      setSpecNote(`${pairs.length} specs added.`);
                      setSpecPasteText("");
                      setSpecPasteOpen(false);
                    }}
                    className="ml-auto px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg disabled:opacity-40"
                  >
                    Add to specs
                  </button>
                </div>
              </div>
            )}
            {specNote && <p className="text-[11px] text-primary mb-2" role="status">{specNote}</p>}
            <div className="space-y-2">
              {state.specs.length === 0 && (
                <p className="text-[11px] text-text-muted">
                  No specs. Add a row for a material, a weight, or a fit note.
                </p>
              )}
              {state.specs.map((spec, i) => (
                <div key={spec.uid} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={spec.key}
                    placeholder="Fabric"
                    aria-label={`Spec ${i + 1} name`}
                    onChange={(e) => dispatch({ type: "specKey", index: i, value: e.target.value })}
                    onPaste={onSpecPaste}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={spec.value}
                    placeholder="100% Cotton"
                    aria-label={`Spec ${i + 1} value`}
                    onChange={(e) => dispatch({ type: "specValue", index: i, value: e.target.value })}
                    onPaste={onSpecPaste}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "removeSpec", index: i })}
                    aria-label={`Remove spec ${i + 1}`}
                    className="p-2 text-text-muted hover:text-badge-discount rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => dispatch({ type: "addSpec" })}
                className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
              >
                Add spec
              </button>
            </div>
          </div>
          </div>

        </div>
      </div>
    </div>
    </div>
  );
}
