"use client";

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { appendImageFiles } from "@/lib/media/client-optimize";
import { OFFLINE } from "@/components/admin/nav";
import { api, btnGhost, btnPrimary, field } from "../api";

type Tab = "product" | "category";

/** A slug from the English part of a name; Bangla-only names get a random one. */
function slugify(name: string, prefix: string) {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Uploads one image to the media store; with `productId` it is attached to that product. */
async function uploadImage(file: File, productId?: string): Promise<string | null> {
  const form = new FormData();
  await appendImageFiles(form, [file]);
  if (productId) form.append("productId", productId);
  try {
    const res = await fetch("/api/admin/media", { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { items?: { url?: string }[] };
    return res.ok ? (json.items?.[0]?.url ?? null) : null;
  } catch {
    return null;
  }
}

function ImageField({ file, setFile, label }: { file: File | null; setFile: (f: File | null) => void; label: string }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <label className="relative flex flex-col items-center justify-center gap-2 h-36 rounded-md border border-dashed border-border-light bg-surface-subtle text-text-muted text-sm cursor-pointer hover:border-primary overflow-hidden">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <ImagePlus className="w-6 h-6" /> {label}
        </>
      )}
      <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {file && (
        <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="absolute top-1 right-1 p-1 rounded bg-surface-card/90 text-on-surface" aria-label="Remove">
          <X className="w-4 h-4" />
        </button>
      )}
    </label>
  );
}

/**
 * Side panel on the register for adding a product or a category without
 * leaving the bill. Products are saved published with no options (one
 * unnamed variant); sizes, colours and stock are set in the full editor.
 */
export function QuickAdd({ categories, onClose, onSaved }: { categories: { id: string; name: string }[]; onClose: () => void; onSaved: (kind: Tab) => void }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("product");
  const [name, setName] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function clear() {
    setName(""); setNameBn(""); setPrice(""); setFile(null);
  }

  async function saveProduct() {
    const amount = Number(price);
    if (!name.trim() || !(amount > 0)) return setMsg({ ok: false, text: t("shop.register.needNamePrice") });
    if (!categoryId) return setMsg({ ok: false, text: t("shop.register.needCategory") });
    setBusy(true);
    setMsg(null);
    const res = await api<{ data: { id: string } }>("/api/admin/products", {
      title: name.trim(),
      title_bn: nameBn.trim() || null,
      slug: slugify(name, "p"),
      category_id: categoryId,
      regular_price: amount,
      status: "published",
      variants: [],
    });
    if (!res.ok) {
      setBusy(false);
      return setMsg({ ok: false, text: res.error });
    }
    const imgOk = file ? Boolean(await uploadImage(file, res.data.data.id)) : true;
    setBusy(false);
    setMsg({ ok: imgOk, text: imgOk ? t("shop.register.productSaved") : t("shop.register.imageFailed") });
    clear();
    onSaved("product");
  }

  async function saveCategory() {
    if (!name.trim()) return setMsg({ ok: false, text: t("shop.register.needNamePrice") });
    setBusy(true);
    setMsg(null);
    const image = file ? await uploadImage(file) : null;
    const row = { name: name.trim(), name_bn: nameBn.trim() || null, slug: slugify(name, "c"), parent_id: null };
    let res = await api("/api/admin/categories", image ? { ...row, image_url: image } : row);
    // Before the image_url migration is applied the column is missing; keep the category anyway.
    if (!res.ok && image && res.error.includes("image_url")) res = await api("/api/admin/categories", row);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    const imgOk = !file || Boolean(image);
    setMsg({ ok: imgOk, text: imgOk ? t("shop.register.categorySaved") : t("shop.register.imageFailed") });
    clear();
    onSaved("category");
  }

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" onClick={() => { setTab(id); setMsg(null); }} className={`flex-1 h-10 text-sm font-semibold ${tab === id ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("shop.register.quickAddTitle")}>
      <aside className="w-full max-w-md h-full bg-surface-card border-l border-border-light shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-border-light flex-shrink-0">
          <h2 className="font-semibold text-on-surface">{t("shop.register.quickAddTitle")}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-md text-text-muted hover:bg-surface-subtle" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="m-4 mb-0 flex rounded-md border border-border-light overflow-hidden">
          {tabBtn("product", t("shop.register.addProductTab"))}
          {tabBtn("category", t("shop.register.addCategoryTab"))}
        </div>
        <form
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void (tab === "product" ? saveProduct() : saveCategory());
          }}
        >
          <ImageField file={file} setFile={setFile} label={t("shop.register.chooseImage")} />
          <label className="text-sm font-semibold flex flex-col gap-1">
            {tab === "product" ? t("shop.register.productName") : t("shop.register.categoryName")}
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} font-normal`} maxLength={200} autoFocus />
          </label>
          <label className="text-sm font-semibold flex flex-col gap-1">
            {t("shop.register.nameBn")}
            <input value={nameBn} onChange={(e) => setNameBn(e.target.value)} className={`${field} font-normal`} maxLength={200} />
          </label>
          {tab === "product" && (
            <>
              <label className="text-sm font-semibold flex flex-col gap-1">
                {t("shop.register.salePrice")}
                <input value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} font-normal`} inputMode="decimal" />
              </label>
              <label className="text-sm font-semibold flex flex-col gap-1">
                {t("shop.register.category")}
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${field} font-normal`}>
                  <option value="">{t("shop.register.pickCategory")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-badge-discount"}`}>{msg.text}</p>}
          <button type="submit" className={`${btnPrimary} h-12`} disabled={busy}>
            {tab === "product" ? t("shop.register.saveProduct") : t("shop.register.saveCategory")}
          </button>
          {tab === "product" && (
            <a href={`${OFFLINE}/products`} target="_blank" rel="noreferrer" className={btnGhost}>
              {t("shop.register.fullEditor")}
            </a>
          )}
        </form>
      </aside>
    </div>
  );
}
