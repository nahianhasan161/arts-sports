"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { flattenCategoryTree, slugify } from "@/lib/utils";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { ProductFormModal } from "@/components/admin/products/ProductFormModal";
import type { Category, ColorOption, Promotion, SizeOption } from "@/types";

async function list<T>(url: string): Promise<T[]> {
  const res = await api<{ data?: T[] }>(url);
  return res.ok ? (res.data.data ?? []) : [];
}

/** The full product form, opened from the purchase screen. */
export function NewProduct({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [colors, setColors] = useState<ColorOption[] | null>(null);
  const [sizes, setSizes] = useState<SizeOption[] | null>(null);
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);

  useEffect(() => {
    void list<Category>("/api/admin/categories?limit=100").then((c) => setCategories(flattenCategoryTree(c)));
    void list<ColorOption>("/api/admin/colors?limit=100").then(setColors);
    void list<SizeOption>("/api/admin/sizes?limit=100").then(setSizes);
    void list<Promotion>("/api/admin/promotions?limit=100").then(setPromotions);
  }, []);

  return (
    <ProductFormModal
      product={null}
      categories={categories ?? []}
      categoriesLoading={categories === null}
      colors={colors ?? []}
      colorsLoading={colors === null}
      sizes={sizes ?? []}
      sizesLoading={sizes === null}
      promotions={promotions ?? []}
      promotionsLoading={promotions === null}
      onClose={onClose}
      onSuccess={onSaved}
    />
  );
}

/** Name, slug and (optionally) the parent category. */
export function NewCategory({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [parents, setParents] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void list<Category>("/api/admin/categories?limit=100").then((c) => setParents(c.filter((x) => !x.parent_id)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api("/api/admin/categories", { name: name.trim(), slug: slug.trim(), ...(parentId && { parent_id: parentId }) });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="text-sm font-semibold text-on-surface">
        {t("shop.purchase.categoryName")}
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          className={`${field} mt-1 w-full`}
          required
          autoFocus
        />
      </label>
      <label className="text-sm font-semibold text-on-surface">
        Slug
        <input
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className={`${field} mt-1 w-full`}
          required
        />
      </label>
      <label className="text-sm font-semibold text-on-surface">
        {t("shop.purchase.parentCategory")}
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={`${field} mt-1 w-full`}>
          <option value="">{t("shop.purchase.noParent")}</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          {t("shop.common.cancel")}
        </button>
        <button type="submit" className={btnPrimary} disabled={busy || !name.trim() || !slug.trim()}>
          {t("shop.common.save")}
        </button>
      </div>
    </form>
  );
}
