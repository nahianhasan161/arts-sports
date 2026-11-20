"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ImagePlus, Plus, Trash2 } from "lucide-react";
import { JerseyPreview } from "@/components/custom-jersey/JerseyPreview";
import { estimate } from "@/lib/custom-jersey/pricing";
import { PATTERNS, SPORTS, type Fabric, type JerseyTemplate, type PricingConfig } from "@/lib/custom-jersey/types";
import { taka } from "@/components/admin/custom-orders/labels";

interface Setup {
  fabrics: Fabric[];
  templates: JerseyTemplate[];
  pricing: PricingConfig;
}

const field = "px-2.5 py-1.5 text-sm bg-surface-subtle rounded border border-border-light";
const btn = "inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase px-3 py-2 rounded disabled:opacity-50";
const primary = `${btn} bg-primary text-primary-foreground`;
const outline = `${btn} border border-border-light bg-surface-card`;
const h2 = "font-display text-lg uppercase font-bold text-primary mb-1";
const EXTRAS: { key: keyof PricingConfig["extras"]; label: string }[] = [
  { key: "name", label: "Name print" },
  { key: "number", label: "Number print" },
  { key: "logo_print", label: "Logo: printed" },
  { key: "logo_dtf", label: "Logo: DTF print" },
  { key: "logo_silicon", label: "Logo: silicon" },
  { key: "logo_embroidery", label: "Logo: embroidery" },
  { key: "full_sleeve", label: "Full sleeve" },
  { key: "shorts", label: "Shorts" },
  { key: "polo_collar", label: "Polo collar" },
];

async function uploadImage(file: File, kind: "fabric"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json.path as string;
}

export default function CustomJerseySetupPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [fabricDraft, setFabricDraft] = useState<Partial<Fabric> & { image_path?: string }>({});
  const [templateDraft, setTemplateDraft] = useState<Partial<JerseyTemplate>>({ sport: "football", pattern: "plain", default_colors: ["#0b3d91", "#ffffff", "#c89b3c"] });

  const fetchSetup = useCallback(async (): Promise<{ setup?: Setup; error?: string }> => {
    const res = await fetch("/api/admin/custom-jersey").catch(() => null);
    const json = await res?.json().catch(() => ({}));
    return res?.ok ? { setup: json } : { error: json?.error ?? "Could not load the setup" };
  }, []);
  const show = useCallback((result: { setup?: Setup; error?: string }) => {
    if (!result.setup) return setError(result.error ?? "Could not load the setup");
    const loaded = result.setup;
    setError(null);
    setSetup(loaded);
    setPricing((p) => p ?? loaded.pricing);
  }, []);
  const load = useCallback(() => fetchSetup().then(show), [fetchSetup, show]);
  useEffect(() => {
    let alive = true;
    fetchSetup().then((result) => alive && show(result));
    return () => {
      alive = false;
    };
  }, [fetchSetup, show]);

  const flash = (what: string) => {
    setSaved(what);
    setTimeout(() => setSaved(null), 2000);
  };

  async function save(entity: "fabric" | "template", body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/admin/custom-jersey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, ...body }) });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Could not save");
      return false;
    }
    setError(null);
    await load();
    return true;
  }
  async function remove(entity: string, id: string, what: string) {
    if (!confirm(`Delete ${what}? Old orders keep their own copy of the name.`)) return;
    const res = await fetch(`/api/admin/custom-jersey?entity=${entity}&id=${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not delete");
    await load();
  }
  async function savePricing() {
    const res = await fetch("/api/admin/custom-jersey", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricing }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "Could not save the prices");
    setError(null);
    setPricing(json.pricing);
    flash("pricing");
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  if (!setup || !pricing) {
    return (
      <div className="p-space-base max-w-4xl">
        <h1 className="font-display text-xl uppercase font-bold text-primary mb-3">Custom jersey setup</h1>
        {error ? (
          <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>
        ) : (
          <p className="text-sm text-text-muted">Loading…</p>
        )}
      </div>
    );
  }

  // A worked example, so a price change can be checked before saving.
  const sampleFabric = setup.fabrics.find((f) => f.is_active) ?? setup.fabrics[0];
  const samples = sampleFabric
    ? [1, 5, 11, 21, 51].map((quantity) => ({
        quantity,
        result: estimate({ fabricPrice: sampleFabric.price_per_piece, fabricTiers: sampleFabric.price_tiers, quantity, sleeve: "short", collar: "round", withShorts: false, withNames: true, withNumbers: true, logoType: null }, pricing),
      }))
    : [];

  return (
    <div className="p-space-base max-w-4xl space-y-8">
      <div>
        <Link href="/admin/online/custom-orders" className="inline-flex items-center gap-1 text-xs text-text-muted mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Custom orders</Link>
        <h1 className="font-display text-xl uppercase font-bold text-primary mb-1">Custom jersey setup</h1>
        <p className="text-sm text-text-muted">Fabrics, the price table and the design templates customers can pick. The site shows these prices as an estimate; the final price is set on each order.</p>
        {error && <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2 mt-3" role="alert"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      </div>

      {/* Fabrics */}
      <section>
        <h2 className={h2}>Fabrics</h2>
        <div className="bg-surface-card rounded-xl border border-border-light divide-y divide-border-light">
          {setup.fabrics.map((f) => (
            <form
              key={f.id}
              className="p-3 grid sm:grid-cols-[56px_1fr_1fr_110px_auto] gap-2 items-start"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                if (await save("fabric", { id: f.id, name_en: d.get("name_en"), name_bn: d.get("name_bn"), description_en: d.get("description_en"), description_bn: d.get("description_bn"), price_per_piece: Number(d.get("price")), display_order: f.display_order, is_active: d.get("is_active") === "on" })) flash(f.id);
              }}
            >
              <label className="w-14 h-14 rounded border border-border-light bg-surface-subtle flex items-center justify-center cursor-pointer overflow-hidden" title="Change picture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.image_url ? <img src={f.image_url} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-text-muted" />}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await save("fabric", { ...f, image_path: await uploadImage(file, "fabric") });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Upload failed");
                    }
                  }}
                />
              </label>
              <div className="flex flex-col gap-1">
                <input name="name_en" className={field} defaultValue={f.name_en} placeholder="Name (English)" required />
                <input name="description_en" className={field} defaultValue={f.description_en ?? ""} placeholder="Description (English)" />
              </div>
              <div className="flex flex-col gap-1">
                <input name="name_bn" className={field} defaultValue={f.name_bn ?? ""} placeholder="নাম (বাংলা)" />
                <input name="description_bn" className={field} defaultValue={f.description_bn ?? ""} placeholder="বর্ণনা (বাংলা)" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs flex items-center gap-1">৳<input name="price" type="number" min={0} className={`${field} w-full`} defaultValue={f.price_per_piece} aria-label="Price per piece" required /></label>
                <label className="text-xs flex items-center gap-1.5"><input name="is_active" type="checkbox" defaultChecked={f.is_active} /> On the site</label>
              </div>
              <div className="flex gap-1.5">
                <button type="submit" className={outline}>{saved === f.id ? "Saved" : "Save"}</button>
                <button type="button" aria-label={`Delete ${f.name_en}`} className="p-2 text-text-muted hover:text-badge-discount" onClick={() => remove("fabric", f.id, f.name_en)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </form>
          ))}
          <form
            className="p-3 flex flex-wrap gap-2 items-center bg-surface-subtle/50"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save("fabric", { ...fabricDraft, display_order: (setup.fabrics.at(-1)?.display_order ?? 0) + 10 })) setFabricDraft({});
            }}
          >
            <input className={`${field} flex-1 min-w-32`} placeholder="New fabric name" value={fabricDraft.name_en ?? ""} onChange={(e) => setFabricDraft({ ...fabricDraft, name_en: e.target.value })} required />
            <input className={`${field} flex-1 min-w-32`} placeholder="নাম (বাংলা)" value={fabricDraft.name_bn ?? ""} onChange={(e) => setFabricDraft({ ...fabricDraft, name_bn: e.target.value })} />
            <input type="number" min={0} className={`${field} w-28`} placeholder="৳ per piece" value={fabricDraft.price_per_piece ?? ""} onChange={(e) => setFabricDraft({ ...fabricDraft, price_per_piece: num(e.target.value) })} required />
            <button type="submit" className={primary}><Plus className="w-3.5 h-3.5" /> Add fabric</button>
          </form>
        </div>
      </section>

      {/* Pricing */}
      <section>
        <h2 className={h2}>Price table</h2>
        <div className="bg-surface-card rounded-xl border border-border-light p-4 grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Quantity discount on the fabric price</h3>
            <div className="flex flex-col gap-1.5">
              {pricing.tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  from
                  <input type="number" min={1} className={`${field} w-20`} value={tier.min} disabled={i === 0} onChange={(e) => setPricing({ ...pricing, tiers: pricing.tiers.map((x, n) => (n === i ? { ...x, min: num(e.target.value) } : x)) })} aria-label="From quantity" />
                  pieces:
                  <input type="number" min={0} max={90} className={`${field} w-20`} value={tier.discount_percent} onChange={(e) => setPricing({ ...pricing, tiers: pricing.tiers.map((x, n) => (n === i ? { ...x, discount_percent: num(e.target.value) } : x)) })} aria-label="Discount percent" />
                  % off
                  {i > 0 && <button aria-label="Remove step" className="text-text-muted hover:text-badge-discount" onClick={() => setPricing({ ...pricing, tiers: pricing.tiers.filter((_, n) => n !== i) })}><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
              <button className={`${outline} self-start mt-1`} onClick={() => setPricing({ ...pricing, tiers: [...pricing.tiers, { min: (pricing.tiers.at(-1)?.min ?? 1) + 10, discount_percent: pricing.tiers.at(-1)?.discount_percent ?? 0 }] })}><Plus className="w-3.5 h-3.5" /> Add a step</button>
            </div>
            <p className="text-xs text-text-muted mt-2">Orders with several designs (shop counter) count all designs together and take the % off the whole price, except fabric that has its own price by quantity.</p>
            <label className="flex items-center gap-2 text-sm mt-2">Lowest price per piece <input type="number" min={0} className={`${field} w-24`} value={pricing.min_per_piece} onChange={(e) => setPricing({ ...pricing, min_per_piece: num(e.target.value) })} /> ৳ (0 = no limit)</label>

            <h3 className="text-sm font-semibold mt-5 mb-2">Time and advance</h3>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="flex items-center gap-2">Normal time <input type="number" min={1} className={`${field} w-20`} value={pricing.rush.normal_days} onChange={(e) => setPricing({ ...pricing, rush: { ...pricing.rush, normal_days: num(e.target.value) } })} /> days</label>
              <label className="flex items-center gap-2">Fastest possible <input type="number" min={0} className={`${field} w-20`} value={pricing.rush.min_days} onChange={(e) => setPricing({ ...pricing, rush: { ...pricing.rush, min_days: num(e.target.value) } })} /> days</label>
              <label className="flex items-center gap-2">Urgent charge <input type="number" min={0} className={`${field} w-20`} value={pricing.rush.percent} onChange={(e) => setPricing({ ...pricing, rush: { ...pricing.rush, percent: num(e.target.value) } })} /> % of the price</label>
              <label className="flex items-center gap-2">Advance <input type="number" min={0} max={100} className={`${field} w-20`} value={pricing.advance_percent} onChange={(e) => setPricing({ ...pricing, advance_percent: num(e.target.value) })} /> % of the total</label>
              <label className="flex items-center gap-2">Free mockup changes <input type="number" min={0} className={`${field} w-20`} value={pricing.free_revisions} onChange={(e) => setPricing({ ...pricing, free_revisions: num(e.target.value) })} /></label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-1">Extras, taka per piece</h3>
            <p className="text-xs text-text-muted mb-2">0 = free (shown to customers as &quot;Free&quot;).</p>
            <div className="flex flex-col gap-1.5 text-sm">
              {EXTRAS.map((x) => (
                <label key={x.key} className="flex items-center gap-2">
                  <span className="w-36">{x.label}</span> ৳
                  <input type="number" min={0} className={`${field} w-24`} value={pricing.extras[x.key]} onChange={(e) => setPricing({ ...pricing, extras: { ...pricing.extras, [x.key]: num(e.target.value) } })} />
                </label>
              ))}
            </div>

            {sampleFabric && (
              <>
                <h3 className="text-sm font-semibold mt-5 mb-2">Check: {sampleFabric.name_en}, with name and number</h3>
                <table className="text-sm w-full tabular-nums">
                  <thead><tr className="text-left text-[11px] uppercase text-text-muted"><th>Pieces</th><th>Per piece</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {samples.map((s) => (
                      <tr key={s.quantity} className="border-t border-border-light"><td className="py-1">{s.quantity}</td><td>{taka(s.result.perPiece)}</td><td className="text-right">{taka(s.result.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
          <button onClick={savePricing} className={`${primary} justify-self-start md:col-span-2`}>{saved === "pricing" ? "Saved" : "Save price table"}</button>
        </div>
      </section>

      {/* Templates */}
      <section>
        <h2 className={h2}>Designs customers can pick</h2>
        <p className="text-sm text-text-muted mb-3">Each design is one of the built-in patterns with three starting colours. The customer changes the colours and adds a team name, a number and a logo.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {setup.templates.map((tpl) => (
            <div key={tpl.id} className={`bg-surface-card rounded-xl border border-border-light p-2 text-xs flex flex-col gap-1 ${tpl.is_active ? "" : "opacity-50"}`}>
              <JerseyPreview pattern={tpl.pattern} colors={tpl.default_colors} side="front" className="w-full h-auto bg-surface-subtle rounded-lg" />
              <strong className="text-sm">{tpl.name_en}</strong>
              <span className="text-text-muted capitalize">{tpl.sport} · {tpl.pattern}</span>
              <div className="flex items-center gap-2 mt-1">
                <button className="underline underline-offset-2" onClick={() => save("template", { ...tpl, is_active: !tpl.is_active })}>{tpl.is_active ? "Hide" : "Show"}</button>
                <button className="underline underline-offset-2" onClick={() => setTemplateDraft(tpl)}>Edit</button>
                <button aria-label={`Delete ${tpl.name_en}`} className="ml-auto text-text-muted hover:text-badge-discount" onClick={() => remove("template", tpl.id, tpl.name_en)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>

        <form
          className="mt-4 bg-surface-card rounded-xl border border-border-light p-4 grid sm:grid-cols-[140px_1fr] gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save("template", { ...templateDraft, display_order: templateDraft.display_order ?? 100 })) setTemplateDraft({ sport: "football", pattern: "plain", default_colors: ["#0b3d91", "#ffffff", "#c89b3c"] });
          }}
        >
          <JerseyPreview pattern={templateDraft.pattern ?? "plain"} colors={templateDraft.default_colors ?? []} side="front" teamName="TEAM" number="10" className="w-full h-auto bg-surface-subtle rounded-lg" />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{templateDraft.id ? `Edit “${templateDraft.name_en}”` : "Add a design"}</h3>
            <div className="flex flex-wrap gap-2">
              <input className={`${field} flex-1 min-w-32`} placeholder="Name" value={templateDraft.name_en ?? ""} onChange={(e) => setTemplateDraft({ ...templateDraft, name_en: e.target.value })} required />
              <input className={`${field} flex-1 min-w-32`} placeholder="নাম (বাংলা)" value={templateDraft.name_bn ?? ""} onChange={(e) => setTemplateDraft({ ...templateDraft, name_bn: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select className={`${field} capitalize`} value={templateDraft.sport} onChange={(e) => setTemplateDraft({ ...templateDraft, sport: e.target.value as JerseyTemplate["sport"] })} aria-label="Sport">
                {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className={`${field} capitalize`} value={templateDraft.pattern} onChange={(e) => setTemplateDraft({ ...templateDraft, pattern: e.target.value as JerseyTemplate["pattern"] })} aria-label="Pattern">
                {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {(templateDraft.default_colors ?? []).map((c, i) => (
                <input key={i} type="color" value={c} aria-label={`Colour ${i + 1}`} className="w-9 h-9 rounded border border-border-light bg-surface-card p-0.5" onChange={(e) => setTemplateDraft({ ...templateDraft, default_colors: (templateDraft.default_colors ?? []).map((x, n) => (n === i ? e.target.value : x)) })} />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" className={primary}>{templateDraft.id ? "Save design" : "Add design"}</button>
              {templateDraft.id && <button type="button" className={outline} onClick={() => setTemplateDraft({ sport: "football", pattern: "plain", default_colors: ["#0b3d91", "#ffffff", "#c89b3c"] })}>Cancel</button>}
            </div>
          </div>
        </form>
      </section>

      {/* Designs live in their own catalogue now */}
      <section>
        <h2 className={h2}>Design catalogue</h2>
        <p className="text-sm text-text-muted mb-3">
          Our own designs, by category (Club jersey, Player Edition...), are managed on their own page. Customers see them on{" "}
          <Link href="/custom-jersey/gallery" className="underline underline-offset-2">/custom-jersey/gallery</Link>.
        </p>
        <Link href="/admin/online/designs" className={primary}><ImagePlus className="w-4 h-4" /> Open the design catalogue</Link>
      </section>
    </div>
  );
}
