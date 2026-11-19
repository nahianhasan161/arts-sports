"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, EyeOff, ImagePlus, Images, Loader2, Maximize, Pencil, Plus, Search, Shirt, Star, Trash2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { usePasteDrop } from "@/components/custom-jersey/usePasteDrop";
import { MAX_DESIGN_IMAGES, OTHER_CATEGORY, categoryName, designImages, type DesignCategoryRow, type DesignRow } from "@/lib/custom-jersey/designs";
import { DesignSlideshow } from "./DesignSlideshow";
import { readUrlParam, useUrlState, writeUrlParams } from "@/lib/url-state";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { optimizeImageFile } from "@/lib/media/client-optimize";

const URL_ = "/api/admin/custom-jersey/designs";

/**
 * Pictures are made smaller in the browser first (like product photos): phone
 * photos are often over the 5 MB limit for gallery pictures, which made uploads fail.
 * The error names the file, so staff know which one to fix.
 */
async function uploadImage(file: File): Promise<string> {
  const small = await optimizeImageFile(file, { maxWidth: 2400, maxHeight: 2400, quality: 0.85 }).catch(() => file);
  const form = new FormData();
  form.append("file", small, small.name || file.name);
  form.append("kind", "gallery");
  const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  if (!res?.ok) throw new Error(`${file.name}: ${json.error ?? "Upload failed"}`);
  return json.path as string;
}

/** An empty design for the "new design" editor. */
const newDesign = (category: string): DesignRow => ({ id: "", image_url: "", images: [], title: "", caption: null, category, is_published: true, display_order: 0 });

const onlyImages = (list: FileList | File[] | null) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));

const nameFromFile = (f: File) => f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 120);

type Listing = { categories: DesignCategoryRow[]; total: number; designs: DesignRow[]; has_more: boolean };

/**
 * Custom-jersey design catalogue, laid out like the register's product grid:
 * category tiles on top (with a + tile to add one), design cards below (with a + tile
 * that uploads into the open category). Click a card to edit it; tick cards to move them.
 */
export function DesignCatalog() {
  const { t, locale } = useT();
  const [cats, setCats] = useState<DesignCategoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cat, setCat] = useUrlState<string>("category", "");
  const [q, setQ] = useState("");
  const [designs, setDesigns] = useState<DesignRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
  const [editing, setEditingRaw] = useState<DesignRow | null>(null);
  const [catForm, setCatFormRaw] = useState<Partial<DesignCategoryRow> & { isNew?: boolean } | null>(null);
  // Open modals get a link: ?design=<id> for the editor, ?edit_category=<slug|new> for the category form.
  const setEditing = useCallback((d: DesignRow | null) => { setEditingRaw(d); writeUrlParams({ design: d?.id || null }); }, []);
  const setCatForm = useCallback((c: (Partial<DesignCategoryRow> & { isNew?: boolean }) | null) => {
    setCatFormRaw(c);
    writeUrlParams({ edit_category: c ? (c.isNew ? "new" : c.slug ?? null) : null });
  }, []);
  const restored = useRef(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [show, setShow] = useState<{ list: DesignRow[]; start: number; img?: number } | null>(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (offset: number) => {
    const qs = new URLSearchParams({ offset: String(offset) });
    if (cat) qs.set("category", cat);
    if (q.trim()) qs.set("q", q.trim());
    return api<Listing>(`${URL_}?${qs}`);
  }, [cat, q]);

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    const res = await fetchPage(0);
    if (id !== reqId.current) return;
    if (!res.ok) { setError(res.error); setDesigns([]); return; }
    setError(null);
    setCats(res.data.categories);
    setTotal(res.data.total);
    setDesigns(res.data.designs);
    setMore(res.data.has_more);
    // First load: reopen the modal named in the URL (?design= / ?edit_category=).
    if (!restored.current) {
      restored.current = true;
      const { designs: list, categories } = res.data;
      const id = readUrlParam("design");
      const d = id ? list.find((x) => x.id === id) : null;
      if (d) setEditingRaw(d); else if (id) writeUrlParams({ design: null });
      const cs = readUrlParam("edit_category");
      if (cs === "new") setCatFormRaw({ isNew: true, is_active: true, display_order: (categories.filter((c) => c.slug !== OTHER_CATEGORY).at(-1)?.display_order ?? 0) + 10 });
      else if (cs) { const c = categories.find((x) => x.slug === cs); if (c) setCatFormRaw(c); else writeUrlParams({ edit_category: null }); }
    }
  }, [fetchPage]);

  useEffect(() => {
    const timer = setTimeout(() => void reload(), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [reload, q]);

  const loadMore = async () => {
    if (!designs) return;
    setLoadingMore(true);
    const res = await fetchPage(designs.length);
    setLoadingMore(false);
    if (res.ok) { setDesigns((l) => [...(l ?? []), ...res.data.designs.filter((d) => !l?.some((x) => x.id === d.id))]); setMore(res.data.has_more); }
  };

  const upload = async (list: FileList | File[] | null) => {
    const files = onlyImages(list);
    if (!files.length) return;
    setUploading({ done: 0, of: files.length });
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const path = await uploadImage(files[i]);
        const res = await api(URL_, { entity: "design", image_path: path, title: nameFromFile(files[i]), category: cat || OTHER_CATEGORY, is_published: true });
        if (!res.ok) throw new Error(res.error);
        setUploading({ done: i + 1, of: files.length });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shop.designs.uploadFailed"));
    } finally {
      setUploading(null);
      void reload();
    }
  };
  // The editor takes pastes/drops itself while it is open.
  const { dragging, dropProps } = usePasteDrop((l) => void upload(l), !uploading && !editing && !catForm);

  /** Files dropped on one card become extra pictures of that design. */
  const addToDesign = async (d: DesignRow, list: FileList) => {
    const files = onlyImages(list);
    if (!files.length) return;
    setUploading({ done: 0, of: files.length });
    setError(null);
    try {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        paths.push(await uploadImage(files[i]));
        setUploading({ done: i + 1, of: files.length });
      }
      const res = await api(URL_, { entity: "design", ...d, images: [...designImages(d), ...paths] });
      if (!res.ok) throw new Error(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shop.designs.uploadFailed"));
    } finally {
      setUploading(null);
      void reload();
    }
  };

  const saveDesign = async (d: DesignRow, images: string[]) => {
    const res = await api(URL_, { entity: "design", ...d, images });
    if (!res.ok) { setError(res.error); return false; }
    void reload();
    return true;
  };
  const removeDesign = async (d: DesignRow) => {
    if (!confirm(t("shop.designs.deleteConfirm", { name: d.title || "" }))) return;
    const res = await api(`${URL_}?entity=design&id=${encodeURIComponent(d.id)}`, undefined, "DELETE");
    if (!res.ok) { setError(res.error); return; }
    setEditing(null);
    void reload();
  };
  const moveTo = async (category: string) => {
    const res = await api(URL_, { entity: "move", ids: [...picked], category });
    if (!res.ok) { setError(res.error); return; }
    setPicked(new Set());
    void reload();
  };

  const label = (slug: string | null) => {
    const c = cats.find((x) => x.slug === (slug ?? OTHER_CATEGORY));
    return c ? categoryName(c, locale) : slug ?? "";
  };
  const current = cats.find((c) => c.slug === cat);
  const tile = (on: boolean) => `relative shrink-0 snap-start min-w-[10rem] h-16 px-3 rounded-md text-sm font-medium text-on-surface transition overflow-hidden flex items-center gap-2 ${on ? "bg-accent-gold/70 ring-2 ring-accent-gold" : "bg-accent-gold/30 hover:bg-accent-gold/45"}`;

  return (
    <div {...dropProps} className={`flex flex-col gap-3 ${dragging ? "ring-2 ring-accent-gold rounded-lg" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl uppercase font-bold text-primary">{t("shop.designs.title")}</h1>
          <p className="text-sm text-text-muted max-w-2xl">
            {t("shop.designs.intro")}{" "}
            <Link href="/custom-jersey/gallery" target="_blank" className="underline underline-offset-2">/custom-jersey/gallery</Link>
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          disabled={!designs?.some((d) => d.is_published !== false)}
          onClick={() => setShow({ list: (designs ?? []).filter((d) => d.is_published !== false), start: 0 })}
          className={`${btnPrimary} h-10 shrink-0`}
        >
          <Maximize className="w-4 h-4" /> {t("shop.designs.showFullscreen")}
        </button>
        <div className="relative flex-1 sm:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.designs.search")} className={`${field} pl-8 h-10`} />
        </div>
        </div>
      </div>

      {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded px-3 py-2">{error}</p>}

      {/* Category tiles */}
      <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar snap-x pb-1">
        <button type="button" onClick={() => setCat("")} className={tile(cat === "")}>
          <span className="flex-1 text-center">{t("shop.designs.all")} <span className="text-xs text-text-muted">({total})</span></span>
        </button>
        {cats.map((c) => (
          <div key={c.slug} className="relative shrink-0 snap-start group">
            <button type="button" onClick={() => setCat(c.slug)} className={`${tile(cat === c.slug)} ${c.is_active ? "" : "opacity-50"}`}>
              {c.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image_url} alt="" loading="lazy" className="w-12 h-12 rounded object-cover flex-shrink-0" />
              )}
              <span className="flex-1 text-center leading-tight">
                {categoryName(c, locale)} <span className="text-xs text-text-muted">({c.count ?? 0})</span>
              </span>
            </button>
            <button type="button" onClick={() => setCatForm(c)} aria-label={t("shop.designs.editCategory")} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-surface-card/90 text-on-surface flex items-center justify-center opacity-70 hover:opacity-100">
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setCatForm({ isNew: true, is_active: true, display_order: (cats.filter((c) => c.slug !== OTHER_CATEGORY).at(-1)?.display_order ?? 0) + 10 })} className="shrink-0 snap-start min-w-[6rem] h-16 rounded-md border-2 border-dashed border-accent-gold/60 text-accent-gold hover:bg-accent-gold/10 flex items-center justify-center" title={t("shop.designs.addCategory")} aria-label={t("shop.designs.addCategory")}>
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Bulk move bar */}
      {picked.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-surface-card border border-accent-gold px-3 py-2 shadow-sm">
          <span className="text-sm font-semibold">{t("shop.designs.selected", { n: picked.size })}</span>
          <select className={`${field} !w-auto h-9`} defaultValue="" onChange={(e) => { if (e.target.value) void moveTo(e.target.value); e.target.value = ""; }}>
            <option value="" disabled>{t("shop.designs.moveTo")}</option>
            {cats.map((c) => <option key={c.slug} value={c.slug}>{categoryName(c, locale)}</option>)}
          </select>
          <Link
            href={`/admin/offline/custom-jersey?designs=${[...picked].slice(0, 10).join(",")}`}
            className={`${btnPrimary} h-9 ml-auto`}
          >
            <Shirt className="w-4 h-4" /> {t("shop.designs.makeJersey")}
          </Link>
          <button type="button" className={`${btnGhost} h-9`} onClick={() => setPicked(new Set())}>{t("shop.common.cancel")}</button>
        </div>
      )}

      {/* Design grid */}
      {designs === null ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
          {Array.from({ length: 8 }).map((_, i) => <li key={i} aria-hidden className="h-52 rounded-md bg-surface-subtle animate-pulse" />)}
        </ul>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
          {designs.map((d) => {
            const on = picked.has(d.id);
            const count = designImages(d).length;
            return (
              <li
                key={d.id}
                className={`relative rounded-md ${dropOn === d.id ? "ring-4 ring-primary" : ""}`}
                onDragOver={(e) => { if (uploading || !e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setDropOn(d.id); }}
                onDragLeave={() => setDropOn((x) => (x === d.id ? null : x))}
                onDrop={(e) => {
                  setDropOn(null);
                  if (uploading || !e.dataTransfer.files.length) return;
                  e.preventDefault();
                  void addToDesign(d, e.dataTransfer.files);
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditing(d)}
                  className={`group relative w-full h-52 flex flex-col text-left rounded-md border bg-surface-card overflow-hidden border-b-4 transition ${on ? "border-accent-gold ring-2 ring-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"} ${d.is_published === false ? "opacity-55" : ""}`}
                >
                  <span className="relative flex-1 min-h-0 bg-surface-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                  </span>
                  <span className="px-2 pt-1.5 text-sm text-on-surface leading-snug line-clamp-1">{d.title || d.caption || "—"}</span>
                  <span className="px-2 pb-1.5 text-[11px] text-text-muted truncate">{label(d.category)}</span>
                  {d.is_published === false && (
                    <span className="absolute top-1 right-1 rounded bg-neutral-900/80 text-white text-[11px] font-semibold px-1.5 py-0.5 inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /> {t("shop.designs.hidden")}</span>
                  )}
                  {count > 1 && (
                    <span className="absolute bottom-12 right-1 rounded bg-neutral-900/80 text-white text-[11px] font-semibold px-1.5 py-0.5 inline-flex items-center gap-1"><Images className="w-3 h-3" /> {count}</span>
                  )}
                  {dropOn === d.id && (
                    <span className="absolute inset-0 bg-primary/60 text-white text-sm font-semibold flex items-center justify-center text-center px-2">{t("shop.designs.dropOnCard")}</span>
                  )}
                  {d.custom_order_id && <span className="absolute bottom-12 left-1 rounded bg-primary/90 text-white text-[10px] font-semibold px-1.5 py-0.5">{t("shop.designs.fromOrder")}</span>}
                </button>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={t("shop.designs.select")}
                  onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                  className={`absolute top-1.5 left-1.5 w-7 h-7 rounded-full border-2 flex items-center justify-center ${on ? "bg-accent-gold border-accent-gold text-white" : "bg-white/80 border-white text-transparent hover:text-neutral-400"}`}
                >
                  <Check className="w-4 h-4" />
                </button>
              </li>
            );
          })}
          {!q && (
            <li>
              <div className="w-full h-52 rounded-md border-2 border-dashed border-accent-gold/60 flex flex-col overflow-hidden">
                <button
                  type="button"
                  disabled={!!uploading}
                  onClick={() => setEditing(newDesign(cat || OTHER_CATEGORY))}
                  className="flex-1 text-accent-gold hover:bg-accent-gold/10 flex flex-col items-center justify-center gap-1 text-sm font-semibold text-center px-2 disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Plus className="w-8 h-8" />}
                  {uploading ? t("shop.designs.uploading", { done: uploading.done, of: uploading.of }) : t("shop.designs.newDesign")}
                  <span className="text-[11px] font-normal">{t("shop.designs.into", { name: current ? categoryName(current, locale) : label(OTHER_CATEGORY) })}</span>
                </button>
                <label className={`border-t border-dashed border-accent-gold/60 py-2 text-[11px] font-semibold text-accent-gold text-center hover:bg-accent-gold/10 ${uploading ? "opacity-60" : "cursor-pointer"}`} title={t("shop.designs.bulkHint")}>
                  <ImagePlus className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                  {t("shop.designs.addDesigns")}
                  <input type="file" multiple accept="image/*" className="hidden" disabled={!!uploading} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
            </li>
          )}
          {loadingMore && Array.from({ length: 4 }).map((_, k) => <li key={`sk${k}`} aria-hidden className="h-52 rounded-md bg-surface-subtle animate-pulse" />)}
        </ul>
      )}
      {designs && designs.length === 0 && q && <p className="text-sm text-text-muted text-center py-6">{t("shop.designs.noResults")}</p>}
      {more && !loadingMore && (
        <div className="flex justify-center"><button type="button" className={`${btnGhost} h-10 px-4`} onClick={() => void loadMore()}>{t("shop.designs.loadMore")}</button></div>
      )}
      <p className="text-xs text-text-muted">{t("shop.designs.pasteHint")}</p>

      {editing && (
        <DesignEditor
          design={editing}
          cats={cats}
          locale={locale}
          onClose={() => setEditing(null)}
          onSave={async (d, images) => { if (await saveDesign(d, images)) setEditing(null); }}
          onDelete={() => void removeDesign(editing)}
          onShow={(img) => {
            const list = (designs ?? []).filter((d) => d.is_published !== false);
            const k = list.findIndex((d) => d.id === editing.id);
            setShow(k >= 0 ? { list, start: k, img } : { list: [editing], start: 0, img });
          }}
        />
      )}
      {show && (
        <DesignSlideshow
          designs={show.list}
          start={show.start}
          startImage={show.img}
          heading={current ? categoryName(current, locale) : t("shop.designs.all")}
          onClose={() => setShow(null)}
        />
      )}
      {catForm && (
        <CategoryEditor
          value={catForm}
          onClose={() => setCatForm(null)}
          onSaved={(slug) => { setCatForm(null); if (slug) setCat(slug); void reload(); }}
          onDeleted={() => { setCatForm(null); setCat(""); void reload(); }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-surface-card text-on-surface w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl max-h-[92vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b border-border-light">
          <h3 className="font-semibold flex-1">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-surface-subtle flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** A picture in the editor: an existing URL, or a fresh upload (path + local preview). */
type Pic = { src: string; path?: string };

function DesignEditor({ design, cats, locale, onClose, onSave, onDelete, onShow }: {
  onShow: (image: number) => void;
  design: DesignRow;
  cats: DesignCategoryRow[];
  locale: string;
  onClose: () => void;
  /** `images` = ordered list, cover first: existing URLs or new upload paths. */
  onSave: (d: DesignRow, images: string[]) => Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useT();
  const [d, setD] = useState<DesignRow>({ ...design, category: design.category ?? OTHER_CATEGORY });
  const isNew = !design.id;
  const [pics, setPics] = useState<Pic[]>(() => (isNew ? [] : designImages(design).filter(Boolean).map((src) => ({ src }))));
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const room = MAX_DESIGN_IMAGES - pics.length;

  const add = async (list: FileList | File[] | null) => {
    const files = onlyImages(list).slice(0, Math.max(0, room));
    if (!files.length) { if (room <= 0) setErr(t("shop.designs.tooManyImages", { n: MAX_DESIGN_IMAGES })); return; }
    setErr(null);
    setAdding(files.length);
    for (const f of files) {
      try {
        const path = await uploadImage(f);
        setPics((p) => [...p, { src: URL.createObjectURL(f), path }]);
      } catch (x) { setErr(x instanceof Error ? x.message : t("shop.designs.uploadFailed")); }
      setAdding((n) => n - 1);
    }
  };
  const { dragging, dropProps } = usePasteDrop((l) => void add(l), !busy && !adding);

  const move = (i: number, by: number) => setPics((p) => {
    const j = i + by;
    if (j < 0 || j >= p.length) return p;
    const n = [...p];
    [n[i], n[j]] = [n[j], n[i]];
    setSel(j);
    return n;
  });
  const makeCover = (i: number) => { setPics((p) => [p[i], ...p.filter((_, k) => k !== i)]); setSel(0); };
  const drop = (i: number) => { setPics((p) => p.filter((_, k) => k !== i)); setSel((s) => Math.max(0, s >= i ? s - 1 : s)); };
  const shown = pics[Math.min(sel, pics.length - 1)];

  return (
    <Modal title={isNew ? t("shop.designs.newDesign") : t("shop.designs.editDesign")} onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div {...dropProps} className={`flex flex-col gap-2 rounded-lg ${dragging ? "ring-2 ring-accent-gold" : ""}`}>
          <div className="relative w-full aspect-square bg-surface-subtle rounded-lg overflow-hidden">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown.src} alt="" className="w-full h-full object-contain" />
            ) : <span className="absolute inset-0 flex items-center justify-center text-xs text-text-muted px-4 text-center">{t("shop.designs.needImage")}</span>}
            {shown && pics.every((p) => !p.path) && (
              <button type="button" onClick={() => onShow(sel)} aria-label={t("shop.designs.showFullscreen")} title={t("shop.designs.showFullscreen")} className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-neutral-900/70 text-white hover:bg-neutral-900 flex items-center justify-center"><Maximize className="w-4 h-4" /></button>
            )}
            {sel === 0 && shown && <span className="absolute top-1.5 left-1.5 rounded bg-accent-gold text-white text-[11px] font-semibold px-1.5 py-0.5 inline-flex items-center gap-1"><Star className="w-3 h-3" /> {t("shop.designs.cover")}</span>}
          </div>
          {shown && (
            <div className="flex items-center gap-1 text-xs">
              <button type="button" className={`${btnGhost} h-8 px-2`} disabled={sel === 0} onClick={() => move(sel, -1)} aria-label={t("shop.designs.moveLeft")}><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" className={`${btnGhost} h-8 px-2`} disabled={sel >= pics.length - 1} onClick={() => move(sel, 1)} aria-label={t("shop.designs.moveRight")}><ChevronRight className="w-4 h-4" /></button>
              {sel > 0 && <button type="button" className={`${btnGhost} h-8 px-2`} onClick={() => makeCover(sel)}><Star className="w-3.5 h-3.5" /> {t("shop.designs.makeCover")}</button>}
              <button type="button" className={`${btnGhost} h-8 px-2 ml-auto text-badge-discount`} onClick={() => drop(sel)}><Trash2 className="w-3.5 h-3.5" /> {t("shop.common.remove")}</button>
            </div>
          )}
          <ul className="grid grid-cols-5 gap-1.5">
            {pics.map((p, i) => (
              <li key={p.src}>
                <button type="button" onClick={() => setSel(i)} className={`relative block w-full aspect-square rounded overflow-hidden border-2 ${i === sel ? "border-accent-gold" : "border-transparent hover:border-border-light"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <Star className="absolute top-0.5 left-0.5 w-3.5 h-3.5 text-accent-gold fill-accent-gold drop-shadow" />}
                </button>
              </li>
            ))}
            {Array.from({ length: adding }).map((_, k) => <li key={`up${k}`} className="aspect-square rounded bg-surface-subtle flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-text-muted" /></li>)}
            {room > adding && (
              <li>
                <label className="w-full aspect-square rounded border-2 border-dashed border-accent-gold/60 text-accent-gold hover:bg-accent-gold/10 flex items-center justify-center cursor-pointer" title={t("shop.designs.addImages")}>
                  <ImagePlus className="w-5 h-5" />
                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
                </label>
              </li>
            )}
          </ul>
          <p className="text-[11px] text-text-muted">{t("shop.designs.imagesHint", { n: MAX_DESIGN_IMAGES })}</p>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">{t("shop.designs.name")}
            <input className={field} value={d.title ?? ""} maxLength={120} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">{t("shop.designs.category")}
            <select className={field} value={d.category ?? OTHER_CATEGORY} onChange={(e) => setD({ ...d, category: e.target.value })}>
              {cats.map((c) => <option key={c.slug} value={c.slug}>{categoryName(c, locale)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">{t("shop.designs.caption")}
            <textarea className={`${field} resize-none`} rows={3} maxLength={200} value={d.caption ?? ""} onChange={(e) => setD({ ...d, caption: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">{t("shop.designs.order")}
            <input type="number" className={field} value={d.display_order ?? 0} onChange={(e) => setD({ ...d, display_order: Number(e.target.value) })} />
            <span className="text-[11px] text-text-muted">{t("shop.designs.orderHint")}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.is_published !== false} onChange={(e) => setD({ ...d, is_published: e.target.checked })} />
            {t("shop.designs.published")}
          </label>
          {err && <p className="text-badge-discount text-xs">{err}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-light">
        {isNew ? (
          <span className="ml-auto" />
        ) : (
          <>
            <button type="button" onClick={onDelete} className={`${btnGhost} h-10 text-badge-discount`}><Trash2 className="w-4 h-4" /> {t("shop.common.delete")}</button>
            <Link href={`/admin/offline/custom-jersey?designs=${design.id}`} className={`${btnGhost} h-10 ml-auto`}>
              <Shirt className="w-4 h-4" /> {t("shop.designs.makeJersey")}
            </Link>
          </>
        )}
        <button type="button" onClick={onClose} className={`${btnGhost} h-10`}>{t("shop.common.cancel")}</button>
        <button type="button" disabled={busy || adding > 0 || pics.length === 0} onClick={async () => { setBusy(true); await onSave(d, pics.map((p) => p.path ?? p.src)); setBusy(false); }} className={`${btnPrimary} h-10`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t("shop.designs.save")}
        </button>
      </div>
    </Modal>
  );
}

function CategoryEditor({ value, onClose, onSaved, onDeleted }: {
  value: Partial<DesignCategoryRow> & { isNew?: boolean };
  onClose: () => void;
  onSaved: (slug?: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useT();
  const [c, setC] = useState(value);
  const [image, setImage] = useState<{ path: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isOther = c.slug === OTHER_CATEGORY;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const res = await api<{ slug: string }>(URL_, { entity: "category", ...c, image_path: image?.path });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved(res.data.slug);
  };
  const remove = async () => {
    if (!c.slug || !confirm(t("shop.designs.deleteCategoryConfirm", { name: c.name_en ?? "" }))) return;
    const res = await api(`${URL_}?entity=category&slug=${encodeURIComponent(c.slug)}`, undefined, "DELETE");
    if (!res.ok) { setErr(res.error); return; }
    onDeleted();
  };

  return (
    <Modal title={t(c.isNew ? "shop.designs.addCategory" : "shop.designs.editCategory")} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-3">
          <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border-light flex items-center justify-center overflow-hidden cursor-pointer bg-surface-subtle shrink-0">
            {image?.preview || c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image?.preview ?? c.image_url ?? ""} alt="" className="w-full h-full object-cover" />
            ) : <ImagePlus className="w-6 h-6 text-text-muted" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              try { setImage({ path: await uploadImage(f), preview: URL.createObjectURL(f) }); } catch (x) { setErr(x instanceof Error ? x.message : "Upload failed"); }
              setBusy(false);
            }} />
          </label>
          <div className="flex flex-col gap-1 text-xs text-text-muted">
            {t("shop.designs.categoryImage")}
            {(image || c.image_url) && <button type="button" className="underline self-start" onClick={() => { setImage(null); setC({ ...c, image_url: null }); }}>{t("shop.common.remove")}</button>}
          </div>
        </div>
        <label className="flex flex-col gap-1">{t("shop.designs.nameEn")}
          <input className={field} value={c.name_en ?? ""} maxLength={60} placeholder="Player Edition" onChange={(e) => setC({ ...c, name_en: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">{t("shop.designs.nameBn")}
          <input className={field} value={c.name_bn ?? ""} maxLength={60} placeholder="প্লেয়ার এডিশন" onChange={(e) => setC({ ...c, name_bn: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">{t("shop.designs.order")}
          <input type="number" className={field} value={c.display_order ?? 0} onChange={(e) => setC({ ...c, display_order: Number(e.target.value) })} />
        </label>
        {!isOther && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={c.is_active !== false} onChange={(e) => setC({ ...c, is_active: e.target.checked })} />
            {t("shop.designs.categoryActive")}
          </label>
        )}
        {err && <p className="text-badge-discount text-xs">{err}</p>}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-light">
        {!c.isNew && !isOther && <button type="button" onClick={() => void remove()} className={`${btnGhost} h-10 text-badge-discount`}><Trash2 className="w-4 h-4" /> {t("shop.common.delete")}</button>}
        <button type="button" onClick={onClose} className={`${btnGhost} h-10 ml-auto`}>{t("shop.common.cancel")}</button>
        <button type="button" disabled={busy || !c.name_en?.trim()} onClick={() => void submit()} className={`${btnPrimary} h-10`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {t("shop.designs.save")}
        </button>
      </div>
    </Modal>
  );
}
