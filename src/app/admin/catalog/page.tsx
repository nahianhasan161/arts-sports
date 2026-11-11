"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { ProductPicker } from "@/components/admin/catalog/ProductPicker";

type TermType = "team" | "league" | "player" | "season" | "brand" | "edition";
const TYPES: TermType[] = ["team", "league", "edition", "season", "player", "brand"];
const TYPE_LABEL: Record<TermType, string> = {
  team: "Teams", league: "Leagues", edition: "Editions", season: "Seasons", player: "Players", brand: "Brands",
};

interface Term {
  id?: string;
  type: TermType;
  slug: string;
  name_en: string;
  name_bn: string;
  description_en: string;
  image_url: string;
  details: Record<string, string>;
  is_featured: boolean;
  display_order: number;
  is_active: boolean;
  product_ids: string[];
}

interface Collection {
  id?: string;
  slug: string;
  title_en: string;
  title_bn: string;
  description_en: string;
  banner_url: string;
  kind: "manual" | "new" | "bestseller";
  starts_at: string;
  ends_at: string;
  show_countdown: boolean;
  show_in_menu: boolean;
  display_order: number;
  is_active: boolean;
  product_ids: string[];
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const field = "w-full px-3 py-2 text-sm bg-surface-subtle rounded-lg border border-border-light";
const label = "text-xs font-semibold text-text-muted block mb-1";

const emptyTerm = (type: TermType): Term => ({ type, slug: "", name_en: "", name_bn: "", description_en: "", image_url: "", details: {}, is_featured: false, display_order: 0, is_active: true, product_ids: [] });
const emptyCollection = (): Collection => ({ slug: "", title_en: "", title_bn: "", description_en: "", banner_url: "", kind: "manual", starts_at: "", ends_at: "", show_countdown: false, show_in_menu: false, display_order: 0, is_active: true, product_ids: [] });

export default function CatalogAdminPage() {
  const [tab, setTab] = useState<TermType | "collections">("team");
  const [terms, setTerms] = useState<Term[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([fetch("/api/admin/catalog-terms"), fetch("/api/admin/collections")]);
      const tj = await t.json();
      const cj = await c.json();
      if (!t.ok) throw new Error(tj.error ?? "Could not load terms. Has the Phase 2 migration been applied?");
      if (!c.ok) throw new Error(cj.error ?? "Could not load collections");
      setTerms(tj.terms);
      setCollections(cj.collections);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(url: string, body: unknown, done: () => void) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not save");
    done();
    await load();
  }
  async function remove(url: string) {
    if (!confirm("Delete this? Products are not deleted, only the link.")) return;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not delete");
    else await load();
  }

  const list = terms.filter((t) => t.type === tab);

  return (
    <div className="p-space-base max-w-5xl">
      <h1 className="font-display text-xl uppercase font-bold text-primary mb-1">Teams, leagues and collections</h1>
      <p className="text-sm text-text-muted mb-4">
        Filters on the shop page and the /team/… and /collection/… pages come from here. Attach products to each one.
      </p>
      {error && (
        <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-1 flex-wrap mb-4">
        {[...TYPES, "collections" as const].map((t) => (
          <button key={t} onClick={() => { setTab(t); setTerm(null); setCollection(null); }}
            className={`px-3 py-1.5 text-xs font-display uppercase font-bold rounded border ${tab === t ? "bg-primary text-white border-primary" : "bg-surface-card border-border-light"}`}>
            {t === "collections" ? "Collections" : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {tab !== "collections" && !term && (
        <div>
          <button onClick={() => setTerm(emptyTerm(tab))} className="mb-3 inline-flex items-center gap-1 px-3 py-2 bg-primary text-white text-xs font-bold uppercase rounded-lg">
            <Plus className="w-4 h-4" /> Add {tab}
          </button>
          <ul className="divide-y divide-border-light bg-surface-card rounded-xl border border-border-light">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <button className="flex-1 text-left" onClick={() => setTerm({ ...t, name_bn: t.name_bn ?? "", description_en: t.description_en ?? "", image_url: t.image_url ?? "", details: t.details ?? {} })}>
                  <span className="font-semibold text-sm">{t.name_en}</span>
                  <span className="text-xs text-text-muted ml-2">/{t.slug} · {t.product_ids.length} products{!t.is_active && " · hidden"}</span>
                </button>
                <button onClick={() => remove(`/api/admin/catalog-terms?id=${t.id}`)} aria-label="Delete" className="text-text-muted hover:text-badge-discount"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
            {list.length === 0 && <li className="px-4 py-6 text-sm text-text-muted text-center">None yet.</li>}
          </ul>
        </div>
      )}

      {tab !== "collections" && term && (
        <form className="bg-surface-card rounded-xl border border-border-light p-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void save("/api/admin/catalog-terms", term, () => setTerm(null)); }}>
          <h2 className="font-display text-sm uppercase font-bold">{term.id ? "Edit" : "New"} {term.type}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Name</label>
              <input className={field} required value={term.name_en} onChange={(e) => setTerm({ ...term, name_en: e.target.value, slug: term.id ? term.slug : slugify(e.target.value) })} /></div>
            <div><label className={label}>Name in Bangla</label>
              <input className={field} value={term.name_bn} onChange={(e) => setTerm({ ...term, name_bn: e.target.value })} /></div>
            <div><label className={label}>Slug (in the web address)</label>
              <input className={field} required value={term.slug} onChange={(e) => setTerm({ ...term, slug: e.target.value })} /></div>
            <div><label className={label}>Image or logo URL</label>
              <input className={field} value={term.image_url} onChange={(e) => setTerm({ ...term, image_url: e.target.value })} /></div>
          </div>
          <div><label className={label}>Description</label>
            <textarea className={field} rows={2} value={term.description_en} onChange={(e) => setTerm({ ...term, description_en: e.target.value })} /></div>
          {term.type === "edition" && (
            <div className="grid sm:grid-cols-2 gap-3 bg-surface-subtle p-3 rounded-lg">
              {(["fabric", "fit", "logo", "price_note"] as const).map((k) => (
                <div key={k}><label className={label}>{k === "price_note" ? "Price note" : k[0].toUpperCase() + k.slice(1)}</label>
                  <input className={field} value={term.details[k] ?? ""} onChange={(e) => setTerm({ ...term, details: { ...term.details, [k]: e.target.value } })} /></div>
              ))}
            </div>
          )}
          <div className="flex gap-4 flex-wrap text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={term.is_active} onChange={(e) => setTerm({ ...term, is_active: e.target.checked })} /> Show on the site</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={term.is_featured} onChange={(e) => setTerm({ ...term, is_featured: e.target.checked })} /> Featured</label>
            <label className="flex items-center gap-1.5">Order <input type="number" className="w-16 px-2 py-1 bg-surface-subtle rounded border border-border-light" value={term.display_order} onChange={(e) => setTerm({ ...term, display_order: Number(e.target.value) })} /></label>
          </div>
          <div><label className={label}>Products</label>
            <ProductPicker value={term.product_ids} onChange={(ids) => setTerm({ ...term, product_ids: ids })} /></div>
          <div className="flex gap-2">
            <button disabled={busy} className="px-5 py-2 bg-primary text-white text-xs font-bold uppercase rounded-lg disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setTerm(null)} className="px-5 py-2 text-xs font-bold uppercase rounded-lg border border-border-light">Cancel</button>
          </div>
        </form>
      )}

      {tab === "collections" && !collection && (
        <div>
          <button onClick={() => setCollection(emptyCollection())} className="mb-3 inline-flex items-center gap-1 px-3 py-2 bg-primary text-white text-xs font-bold uppercase rounded-lg">
            <Plus className="w-4 h-4" /> Add collection
          </button>
          <ul className="divide-y divide-border-light bg-surface-card rounded-xl border border-border-light">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <button className="flex-1 text-left" onClick={() => setCollection({ ...c, title_bn: c.title_bn ?? "", description_en: c.description_en ?? "", banner_url: c.banner_url ?? "", starts_at: toLocal(c.starts_at), ends_at: toLocal(c.ends_at) })}>
                  <span className="font-semibold text-sm">{c.title_en}</span>
                  <span className="text-xs text-text-muted ml-2">/collection/{c.slug} · {c.kind}{c.kind === "manual" && ` · ${c.product_ids.length} products`}{!c.is_active && " · hidden"}</span>
                </button>
                <button onClick={() => remove(`/api/admin/collections?id=${c.id}`)} aria-label="Delete" className="text-text-muted hover:text-badge-discount"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
            {collections.length === 0 && <li className="px-4 py-6 text-sm text-text-muted text-center">None yet.</li>}
          </ul>
        </div>
      )}

      {tab === "collections" && collection && (
        <form className="bg-surface-card rounded-xl border border-border-light p-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void save("/api/admin/collections", collection, () => setCollection(null)); }}>
          <h2 className="font-display text-sm uppercase font-bold">{collection.id ? "Edit" : "New"} collection</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Title</label>
              <input className={field} required value={collection.title_en} onChange={(e) => setCollection({ ...collection, title_en: e.target.value, slug: collection.id ? collection.slug : slugify(e.target.value) })} /></div>
            <div><label className={label}>Title in Bangla</label>
              <input className={field} value={collection.title_bn} onChange={(e) => setCollection({ ...collection, title_bn: e.target.value })} /></div>
            <div><label className={label}>Slug</label>
              <input className={field} required value={collection.slug} onChange={(e) => setCollection({ ...collection, slug: e.target.value })} /></div>
            <div><label className={label}>Type</label>
              <select className={field} value={collection.kind} onChange={(e) => setCollection({ ...collection, kind: e.target.value as Collection["kind"] })}>
                <option value="manual">Hand-picked products</option>
                <option value="new">New (published in the last 30 days)</option>
                <option value="bestseller">Bestsellers (most sold in 30 days)</option>
              </select></div>
            <div><label className={label}>Starts (optional)</label>
              <input type="datetime-local" className={field} value={collection.starts_at} onChange={(e) => setCollection({ ...collection, starts_at: e.target.value })} /></div>
            <div><label className={label}>Ends (optional)</label>
              <input type="datetime-local" className={field} value={collection.ends_at} onChange={(e) => setCollection({ ...collection, ends_at: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={label}>Banner image URL</label>
              <input className={field} value={collection.banner_url} onChange={(e) => setCollection({ ...collection, banner_url: e.target.value })} /></div>
          </div>
          <div><label className={label}>Description</label>
            <textarea className={field} rows={2} value={collection.description_en} onChange={(e) => setCollection({ ...collection, description_en: e.target.value })} /></div>
          <div className="flex gap-4 flex-wrap text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={collection.is_active} onChange={(e) => setCollection({ ...collection, is_active: e.target.checked })} /> Active</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={collection.show_in_menu} onChange={(e) => setCollection({ ...collection, show_in_menu: e.target.checked })} /> Show in menu</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={collection.show_countdown} onChange={(e) => setCollection({ ...collection, show_countdown: e.target.checked })} /> Countdown to end time</label>
          </div>
          {collection.kind === "manual" && (
            <div><label className={label}>Products</label>
              <ProductPicker value={collection.product_ids} onChange={(ids) => setCollection({ ...collection, product_ids: ids })} /></div>
          )}
          <div className="flex gap-2">
            <button disabled={busy} className="px-5 py-2 bg-primary text-white text-xs font-bold uppercase rounded-lg disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setCollection(null)} className="px-5 py-2 text-xs font-bold uppercase rounded-lg border border-border-light">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
