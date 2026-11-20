"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileText, FileUp, Images, Loader2, Maximize2, Plus, Search, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { usePasteDrop } from "@/components/custom-jersey/usePasteDrop";
import type { UploadedFile } from "@/lib/custom-jersey/types";
import { categoryName, OTHER_CATEGORY, type DesignCategoryRow, type DesignRow } from "@/lib/custom-jersey/designs";
import { usePosCatalog, useCatalog } from "@/lib/pos/catalog-store";
import type { PosProduct } from "@/lib/pos/types";
import { api, btnGhost, field } from "../api";

const PARTS = ["front", "back", "collar", "sleeve", "logo", "sponsor", "reference"] as const;
export const MAX_REFS = 10;

/** A reference on the slip: the stored file plus what the screen can show for it. */
export type DesignRef = UploadedFile & { preview?: string | null };

/**
 * The design references for a counter order, as cards like the product grid:
 * the picture, a part chip (front, collar, back...) and a note underneath.
 * Pictures come from the customer (uploaded), our design gallery, or the product catalogue.
 */
export function DesignRefs({ refs, setRefs, uploading, onUpload }: {
  refs: DesignRef[];
  setRefs: React.Dispatch<React.SetStateAction<DesignRef[]>>;
  uploading: boolean;
  onUpload: (list: FileList | File[] | null) => void;
}) {
  const { t } = useT();
  const [catalog, setCatalog] = useState(false);
  const [big, setBig] = useState<number | null>(null);
  const shown = refs.map((r, i) => ({ i, src: r.preview ?? "", title: r.note || r.name })).filter((x) => x.src);
  const full = refs.length >= MAX_REFS;
  const { dragging, dropProps } = usePasteDrop((list) => onUpload(list), !uploading && !full);
  const patch = (i: number, p: Partial<DesignRef>) => setRefs((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const remove = (i: number) =>
    setRefs((l) => {
      const url = l[i]?.preview;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
      return l.filter((_, j) => j !== i);
    });
  const labels = PARTS.map((p) => t(`customJersey.upload.tags.${p}`));

  return (
    <div {...dropProps} className={`flex flex-col gap-2 rounded-lg ${dragging ? "ring-2 ring-primary bg-primary/10" : ""}`}>
      <p className="text-xs text-text-muted">{t("customJersey.upload.pasteHint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className={`${btnGhost} h-11 ${full || uploading ? "opacity-50" : "cursor-pointer"}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {uploading ? t("shop.customNew.uploading") : t("shop.customNew.addFile")}
          <input type="file" multiple accept="image/*,.pdf,.ai,.eps" className="hidden" disabled={uploading || full} onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
        </label>
        <button type="button" className={`${btnGhost} h-11`} disabled={full} onClick={() => setCatalog(true)}>
          <Images className="w-4 h-4" /> {t("shop.customNew.fromCatalog")}
        </button>
      </div>

      {catalog && !full && (
        <CatalogGallery
          room={MAX_REFS - refs.length}
          onClose={() => setCatalog(false)}
          onAdd={(list) =>
            setRefs((l) => [
              ...l,
              ...list
                .slice(0, MAX_REFS - l.length)
                .map((p) => ({ path: p.image, name: p.title, mime: "image/*", size: 0, kind: "reference" as const, product_id: p.product_id, design_id: p.design_id, preview: p.image })),
            ])
          }
        />
      )}
      <Lightbox items={shown} index={big} setIndex={setBig} />

      {refs.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {refs.map((r, i) => {
            const part = labels.find((l) => r.note === l || r.note?.startsWith(`${l} — `));
            const body = part ? (r.note ?? "").slice(part.length).replace(/^ — /, "") : r.note ?? "";
            const save = (p: string | undefined, b: string) => patch(i, { note: p ? (b ? `${p} — ${b}` : p) : b || undefined });
            return (
              <li key={`${r.path}-${i}`} className="flex flex-col rounded-lg overflow-hidden bg-surface-card border border-border-light shadow-sm">
                <div className="relative aspect-square bg-surface-subtle">
                  {r.preview ? (
                    <button type="button" onClick={() => setBig(shown.findIndex((x) => x.i === i))} aria-label={t("shop.customNew.viewBig")} className="absolute inset-0 cursor-zoom-in">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.preview} alt={r.note || r.name} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-text-muted">
                      <FileText className="w-8 h-8" />
                      <span className="text-[11px] truncate max-w-full">{r.name}</span>
                    </div>
                  )}
                  {part && (
                    <span className="absolute top-1.5 right-1.5 rounded bg-surface-card/95 text-on-surface border border-border-light px-1.5 py-0.5 text-[11px] font-semibold shadow-sm">{part}</span>
                  )}
                  {(r.product_id || r.design_id) && (
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-primary/90 text-white px-1.5 py-0.5 text-[10px] font-semibold">{t(r.design_id ? "shop.customNew.designTag" : "shop.customNew.catalogTag")}</span>
                  )}
                  <button type="button" onClick={() => remove(i)} aria-label={t("shop.common.remove")} className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-badge-discount">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 p-1.5 border-b-[3px] border-accent-gold">
                  <div className="flex flex-wrap gap-1">
                    {labels.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => save(part === l ? undefined : l, body)}
                        className={`text-[11px] rounded-full border px-2 py-0.5 ${part === l ? "border-primary bg-primary text-white" : "border-border-light bg-surface-card hover:bg-surface-subtle"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    maxLength={170}
                    value={body}
                    onChange={(e) => save(part, e.target.value)}
                    placeholder={t("shop.customNew.refNote")}
                    aria-label={t("shop.customNew.refNote")}
                    className="w-full rounded border border-border-light bg-surface-subtle px-2 py-1 text-xs resize-none"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Big view of one picture, with arrows when there are several. */
export function Lightbox({ items, index, setIndex }: { items: { src: string; title: string }[]; index: number | null; setIndex: (i: number | null) => void }) {
  const { t } = useT();
  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setIndex(null); }
      if (e.key === "ArrowRight") setIndex((index + 1) % items.length);
      if (e.key === "ArrowLeft") setIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, items.length, setIndex]);
  if (index == null || !items[index]) return null;
  const it = items[index];
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" onClick={() => setIndex(null)}>
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm truncate">{it.title}</span>
        <button type="button" aria-label={t("shop.customNew.galleryClose")} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.src} alt={it.title} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
        {items.length > 1 && (
          <>
            <button type="button" aria-label="‹" onClick={(e) => { e.stopPropagation(); setIndex((index - 1 + items.length) % items.length); }} className="absolute left-3 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center"><ChevronLeft className="w-6 h-6" /></button>
            <button type="button" aria-label="›" onClick={(e) => { e.stopPropagation(); setIndex((index + 1) % items.length); }} className="absolute right-3 w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center"><ChevronRight className="w-6 h-6" /></button>
          </>
        )}
      </div>
    </div>
  );
}

type Pick = { key: string; image: string; title: string; product_id?: string; design_id?: string };
type Tab = "designs" | "products";

/**
 * Picture picker with two separate sources:
 *  - "Our designs": the custom-jersey design gallery (custom_gallery), by category
 *  - "Products": the shop's product catalogue, by name/SKU
 * Tick several, open any picture big, then add the ticked ones as references.
 */
function CatalogGallery({ room, onAdd, onClose }: { room: number; onAdd: (list: Pick[]) => void; onClose: () => void }) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<Tab>("designs");
  const [category, setCategory] = useState("");
  const [serverCats, setCats] = useState<DesignCategoryRow[]>([]);
  // Designs and products come from the copy kept on this device when it has
  // them (lib/pos/catalog-store.ts); otherwise the server pages them as before.
  const deviceCatalog = useCatalog();
  const cats = deviceCatalog?.designCategories ?? serverCats;
  const hasDevice = deviceCatalog !== null;
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Pick[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Map<string, Pick>>(new Map());
  const [big, setBig] = useState<number | null>(null);

  const load = useCallback(async (which: Tab, cat: string, term: string, offset: number) => {
    const local = usePosCatalog.getState().catalog;
    const needle = term.toLowerCase();
    if (which === "designs" && local?.designs) {
      const all = local.designs.filter(
        (d) =>
          (!cat || (cat === OTHER_CATEGORY ? !d.category || d.category === OTHER_CATEGORY : d.category === cat)) &&
          (!needle || `${d.title ?? ""}\n${d.caption ?? ""}`.toLowerCase().includes(needle))
      );
      return {
        list: all.slice(offset, offset + 40).map((d) => ({ key: `d:${d.id}`, image: d.image_url, title: d.title || d.caption || t("shop.customNew.tabDesigns"), design_id: d.id })),
        more: all.length > offset + 40,
      };
    }
    if (which === "products" && local) {
      const all = local.products.filter(
        (p) => p.image && (!needle || [p.title, p.sku ?? "", ...p.variants.flatMap((v) => [v.sku ?? "", v.barcode ?? ""])].join("\n").toLowerCase().includes(needle))
      );
      return {
        list: all.slice(offset, offset + 40).map((p) => ({ key: `p:${p.product_id}`, image: p.image!, title: p.title, product_id: p.product_id })),
        more: all.length > offset + 40,
      };
    }
    setLoading(true);
    const qs = new URLSearchParams({ limit: "40", offset: String(offset) });
    if (term) qs.set("q", term);
    if (which === "designs") {
      if (cat) qs.set("category", cat);
      const res = await api<{ designs: DesignRow[]; has_more?: boolean; categories?: DesignCategoryRow[] }>(`/api/admin/pos/designs?${qs}`);
      setLoading(false);
      if (!res.ok) return { list: [] as Pick[], more: false };
      if (res.data.categories) setCats(res.data.categories);
      return {
        list: res.data.designs.map((d) => ({ key: `d:${d.id}`, image: d.image_url, title: d.title || d.caption || t("shop.customNew.tabDesigns"), design_id: d.id })),
        more: Boolean(res.data.has_more),
      };
    }
    const res = await api<{ products: PosProduct[]; has_more?: boolean }>(`/api/admin/pos/products?${qs}`);
    setLoading(false);
    if (!res.ok) return { list: [] as Pick[], more: false };
    return {
      list: res.data.products.filter((p) => p.image).map((p) => ({ key: `p:${p.product_id}`, image: p.image!, title: p.title, product_id: p.product_id })),
      more: Boolean(res.data.has_more),
    };
    // hasDevice: when the device copy arrives, the list is read again from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, hasDevice]);

  useEffect(() => {
    let live = true;
    const term = q.trim();
    const id = setTimeout(() => {
      void load(tab, category, term, 0).then((r) => { if (live) { setItems(r.list); setMore(r.more); } });
    }, term ? 300 : 0);
    return () => { live = false; clearTimeout(id); };
  }, [tab, category, q, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && big == null) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big, onClose]);

  const toggle = (p: Pick) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(p.key)) n.delete(p.key);
      else if (n.size < room) n.set(p.key, p);
      return n;
    });
  const switchTab = (next: Tab) => { if (next !== tab) { setTab(next); setItems([]); setQ(""); } };
  const chip = (on: boolean) => `shrink-0 text-xs rounded-full border px-3 py-1.5 ${on ? "border-primary bg-primary text-white" : "border-border-light bg-surface-card hover:bg-surface-subtle"}`;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-surface-card text-on-surface w-full sm:max-w-4xl sm:rounded-xl flex flex-col max-h-full sm:max-h-[90vh] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b border-border-light">
          <Images className="w-5 h-5 text-primary shrink-0" />
          <h3 className="font-semibold flex-1">{t("shop.customNew.galleryTitle")}</h3>
          <span className="text-xs text-text-muted">{t("shop.customNew.galleryRoom", { n: room })}</span>
          <button type="button" onClick={onClose} aria-label={t("shop.customNew.galleryClose")} className="w-9 h-9 rounded-full hover:bg-surface-subtle flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex flex-col gap-2 p-3 pb-0">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-subtle p-1" role="tablist">
            {(["designs", "products"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => switchTab(k)} className={`h-9 rounded-md text-sm font-semibold ${tab === k ? "bg-surface-card shadow-sm text-primary" : "text-text-muted"}`}>
                {t(k === "designs" ? "shop.customNew.tabDesigns" : "shop.customNew.tabProducts")}
              </button>
            ))}
          </div>
          {tab === "designs" && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button type="button" className={chip(category === "")} onClick={() => setCategory("")}>{t("shop.customNew.allDesigns")}</button>
              {cats.map((c) => (
                <button key={c.slug} type="button" className={chip(category === c.slug)} onClick={() => setCategory(c.slug)}>{categoryName(c, locale)}</button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(tab === "designs" ? "shop.customNew.searchDesigns" : "shop.customNew.searchCatalog")} className={`${field} pl-8 h-10`} />
            {loading && <Loader2 className="w-4 h-4 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {items.length === 0 && !loading && <p className="text-sm text-text-muted text-center py-8">{t(tab === "designs" ? "shop.customNew.noDesigns" : "shop.customNew.noCatalog")}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {items.map((p, i) => {
              const on = picked.has(p.key);
              return (
                <div key={p.key} className={`relative flex flex-col rounded-lg overflow-hidden border-2 bg-surface-card ${on ? "border-primary" : "border-border-light"}`}>
                  <button type="button" onClick={() => toggle(p)} className="relative aspect-square bg-surface-subtle" aria-pressed={on}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt={p.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    <span className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${on ? "bg-primary border-primary text-white" : "bg-white/80 border-white"}`}>
                      {on && <Check className="w-4 h-4" />}
                    </span>
                  </button>
                  <button type="button" onClick={() => setBig(i)} aria-label={t("shop.customNew.viewBig")} className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <span className="text-xs px-1.5 py-1 truncate">{p.title}</span>
                </div>
              );
            })}
          </div>
          {more && (
            <div className="flex justify-center pt-3">
              <button type="button" className={`${btnGhost} h-10 px-4`} disabled={loading} onClick={() => void load(tab, category, q.trim(), items.length).then((r) => { setItems((l) => [...l, ...r.list.filter((p) => !l.some((x) => x.key === p.key))]); setMore(r.more); })}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {t("shop.customNew.loadMore")}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 p-3 border-t border-border-light">
          <span className="text-sm flex-1">{t("shop.customNew.gallerySelected", { n: picked.size })}</span>
          {picked.size > 0 && <button type="button" className={`${btnGhost} h-11 px-3`} onClick={() => setPicked(new Map())}>{t("shop.customNew.galleryClear")}</button>}
          <button type="button" disabled={picked.size === 0} onClick={() => { onAdd([...picked.values()]); onClose(); }} className="h-11 px-4 rounded-lg bg-primary text-white font-semibold flex items-center gap-1.5 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {t("shop.customNew.galleryAdd", { n: picked.size })}
          </button>
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Lightbox items={items.map((p) => ({ src: p.image, title: p.title }))} index={big} setIndex={setBig} />
      </div>
    </div>
  );
}
