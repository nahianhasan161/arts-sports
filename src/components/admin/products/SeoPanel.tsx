"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { SEO_LIMITS, type ProductSeo, type SeoFields, type StoredSeo } from "@/lib/seo/product-seo";

/**
 * SEO tab of the product form: how the product shows in Google, and the text
 * behind it.
 *
 * Nothing to do by default: every product gets search text automatically, and
 * with the AI writer on (ANTHROPIC_API_KEY) it is rewritten after each save
 * when the product changed. Typing here makes it "your text", which the AI
 * leaves alone until "Back to automatic".
 *
 * The form sends `draft` to POST /api/admin/products/[id]/seo after saving.
 */

export type SeoDraft = { mode: "keep" } | { mode: "reset" } | { mode: "manual"; fields: Partial<SeoFields> };

interface Loaded {
  seo: StoredSeo;
  preview: ProductSeo;
  aiEnabled: boolean;
  columnMissing: boolean;
}

const input =
  "w-full px-3 py-2 border border-border-light rounded-lg text-sm bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary/20";
const label = "block text-xs font-semibold text-on-surface mb-1.5";

type TextKey = Exclude<keyof SeoFields, "keywords">;

function Counter({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={`text-[11px] tabular-nums ${over ? "text-red-600" : "text-text-muted"}`}>
      {value.length}/{max}
    </span>
  );
}

export function SeoPanel({
  productId,
  name,
  slug,
  draft,
  onDraftChange,
  disabled,
}: {
  productId?: string;
  name: string;
  slug: string;
  draft: SeoDraft;
  onDraftChange: (draft: SeoDraft) => void;
  disabled?: boolean;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [writing, setWriting] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (!productId) return;
    let alive = true;
    fetch(`/api/admin/products/${productId}/seo`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Could not load the search text");
        if (alive) setLoaded(body as Loaded);
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : "Could not load the search text"));
    return () => {
      alive = false;
    };
  }, [productId]);

  const stored = loaded?.seo ?? {};
  const isManual = draft.mode === "manual" || (draft.mode === "keep" && stored.source === "manual");
  // What is in the boxes: the draft, else the stored manual text.
  const fields: Partial<SeoFields> =
    draft.mode === "manual" ? draft.fields : draft.mode === "keep" && stored.source === "manual" ? stored : {};
  const preview = loaded?.preview;

  const placeholder = (k: TextKey): string => {
    if (!preview) return "";
    const map: Record<TextKey, string> = {
      title_en: preview.title,
      title_bn: preview.titleBn,
      description_en: preview.description,
      description_bn: preview.descriptionBn,
      image_alt_en: preview.imageAlt,
      image_alt_bn: preview.imageAltBn,
    };
    return draft.mode === "reset" ? "" : map[k];
  };

  const setField = (k: keyof SeoFields, v: string) => {
    const next: Partial<SeoFields> = { ...fields };
    if (k === "keywords") next.keywords = v.split(",").map((s) => s.trim()).filter(Boolean);
    else next[k] = v;
    const empty = Object.values(next).every((x) => (Array.isArray(x) ? x.length === 0 : !x));
    onDraftChange(empty ? { mode: "reset" } : { mode: "manual", fields: next });
  };

  const writeWithAi = async () => {
    if (!productId) return;
    setWriting(true);
    setAiError("");
    try {
      const r = await fetch(`/api/admin/products/${productId}/seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest" }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "The AI writer failed");
      onDraftChange({ mode: "manual", fields: body.suggestion as SeoFields });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "The AI writer failed");
    } finally {
      setWriting(false);
    }
  };

  const shownTitle = (fields.title_en || placeholder("title_en") || name || "Product name").trim();
  const shownDescription = (fields.description_en || placeholder("description_en")).trim();
  const host = typeof window !== "undefined" ? window.location.host : "artssports.com";

  const status = !productId
    ? "Written automatically after the first save."
    : draft.mode === "reset"
      ? "Back to automatic after you save."
      : isManual
        ? "Your text. Kept as it is: the AI does not change it."
        : stored.source === "ai"
          ? "Written by AI from the product. Rewritten when you change the product."
          : loaded?.aiEnabled
            ? "Automatic from the product. The AI writes better text after you save."
            : "Automatic from the product (name, category, brand, price, colours, sizes).";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border-light bg-surface-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Google preview</p>
        <p className="text-xs text-text-muted truncate">
          {host} › products › {slug || "…"}
        </p>
        <p className="text-[17px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8] truncate">{shownTitle} | Arts Sports</p>
        <p className="text-[13px] text-on-surface/80 line-clamp-2">{shownDescription || "The description appears after the first save."}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-text-muted flex-1 min-w-[200px]">{status}</p>
        {productId && loaded?.aiEnabled && (
          <button
            type="button"
            onClick={writeWithAi}
            disabled={disabled || writing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-light text-xs font-semibold hover:bg-surface-container disabled:opacity-50"
          >
            {writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Write with AI
          </button>
        )}
        {productId && (isManual || stored.source) && draft.mode !== "reset" && (
          <button
            type="button"
            onClick={() => onDraftChange({ mode: "reset" })}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-light text-xs font-semibold hover:bg-surface-container disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Back to automatic
          </button>
        )}
      </div>
      {aiError && <p className="text-xs text-red-600">{aiError}</p>}
      {loadError && <p className="text-xs text-red-600">{loadError}</p>}
      {loaded?.columnMissing && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The automatic text works, but your own or AI text can be saved only after migration 20261126110000 is applied.
        </p>
      )}
      {productId && loaded && !loaded.aiEnabled && (
        <p className="text-[11px] text-text-muted">AI writer is off (no ANTHROPIC_API_KEY on the server).</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(
          [
            ["title_en", "Search title (English)", SEO_LIMITS.title],
            ["title_bn", "Search title (Bangla)", SEO_LIMITS.title],
          ] as const
        ).map(([k, text, max]) => (
          <div key={k}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`seo-${k}`} className={label}>
                {text}
              </label>
              <Counter value={fields[k] ?? ""} max={max} />
            </div>
            <input
              id={`seo-${k}`}
              className={input}
              value={fields[k] ?? ""}
              placeholder={placeholder(k)}
              disabled={disabled}
              onChange={(e) => setField(k, e.target.value)}
            />
          </div>
        ))}
        {(
          [
            ["description_en", "Description (English)"],
            ["description_bn", "Description (Bangla)"],
          ] as const
        ).map(([k, text]) => (
          <div key={k}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`seo-${k}`} className={label}>
                {text}
              </label>
              <Counter value={fields[k] ?? ""} max={SEO_LIMITS.description} />
            </div>
            <textarea
              id={`seo-${k}`}
              rows={3}
              className={input}
              value={fields[k] ?? ""}
              placeholder={placeholder(k)}
              disabled={disabled}
              onChange={(e) => setField(k, e.target.value)}
            />
          </div>
        ))}
        <div className="md:col-span-2">
          <label htmlFor="seo-keywords" className={label}>
            Search words (comma between)
          </label>
          <input
            id="seo-keywords"
            className={input}
            value={(fields.keywords ?? []).join(", ")}
            placeholder={draft.mode === "reset" ? "" : (preview?.keywords ?? []).join(", ")}
            disabled={disabled}
            onChange={(e) => setField("keywords", e.target.value)}
          />
        </div>
        {(
          [
            ["image_alt_en", "Picture text (English)"],
            ["image_alt_bn", "Picture text (Bangla)"],
          ] as const
        ).map(([k, text]) => (
          <div key={k}>
            <label htmlFor={`seo-${k}`} className={label}>
              {text}
            </label>
            <input
              id={`seo-${k}`}
              className={input}
              value={fields[k] ?? ""}
              placeholder={placeholder(k)}
              disabled={disabled}
              onChange={(e) => setField(k, e.target.value)}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">
        Grey text = what is used now. Leave a box empty to keep it automatic. The price is added to the title by the site.
      </p>
    </div>
  );
}

/** After the product is saved: store typed text, or let the server (re)write it and tell search engines. */
export async function sendSeoDraft(productId: string, draft: SeoDraft): Promise<string | null> {
  const body =
    draft.mode === "manual"
      ? { action: "saved", seo: draft.fields }
      : { action: "saved", reset: draft.mode === "reset" };
  try {
    const r = await fetch(`/api/admin/products/${productId}/seo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return null;
    const res: { error?: string } = await r.json().catch(() => ({}));
    return res.error ?? "failed";
  } catch {
    return "no connection";
  }
}
