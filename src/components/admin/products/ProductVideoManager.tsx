"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Film, Link2, Loader2, Pencil, Play, Trash2, Upload, X } from "lucide-react";
import {
  MAX_VIDEOS,
  MAX_VIDEO_SECONDS,
  VIDEO_HOST_LABEL,
  isShortLink,
  parseVideoLink,
  videoPoster,
  type ProductVideo,
} from "@/lib/media/video";

/**
 * Videos of one product, saved straight away (like the images above it).
 *
 * A link costs no storage, so it is the first choice; an upload is shrunk in
 * this browser to 720p (lib/media/video-compress.ts) before it is sent.
 */

type Busy = { step: "shrink" | "upload"; done: number; name: string } | null;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function uploadWithProgress(url: string, form: FormData, onProgress: (done: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(form);
  });
}

/**
 * A video picked for a product that is not saved yet. Links are ready as they
 * are; a clip is already shrunk and waits here until the product has an id.
 */
export interface StagedVideo {
  key: string;
  video: ProductVideo;
  clip?: { file: File; poster: File | null; width: number; height: number; seconds: number };
}

function clipForm(clip: NonNullable<StagedVideo["clip"]>): FormData {
  const form = new FormData();
  form.append("file", clip.file);
  if (clip.poster) form.append("poster", clip.poster);
  form.append("width", String(clip.width));
  form.append("height", String(clip.height));
  form.append("seconds", String(clip.seconds));
  return form;
}

/** Frees the browser previews of staged clips. */
export function releaseStagedVideos(staged: StagedVideo[]) {
  for (const s of staged) {
    if (!s.clip) continue;
    URL.revokeObjectURL(s.video.url);
    if (s.video.poster) URL.revokeObjectURL(s.video.poster);
  }
}

/**
 * Saves staged videos onto a product that now exists, keeping their order:
 * clips are uploaded first (each one is appended), then the whole list is put
 * in the chosen order. Returns an error sentence, or null when all went up.
 */
export async function uploadStagedVideos(
  productId: string,
  staged: StagedVideo[],
): Promise<{ error: string | null; saved: Map<string, ProductVideo> }> {
  /** Staged key → the video as saved (for the colour media picker). */
  const saved = new Map<string, ProductVideo>();
  if (staged.length === 0) return { error: null, saved };
  const api = `/api/admin/products/${productId}/videos`;
  const ordered: Partial<ProductVideo>[] = [];
  const keys: string[] = [];
  let failed = 0;
  let lastError = "";
  for (const s of staged) {
    if (!s.clip) {
      ordered.push({ kind: s.video.kind, url: s.video.url });
      keys.push(s.key);
      continue;
    }
    try {
      const r = await fetch(api, { method: "POST", body: clipForm(s.clip) });
      const body = (await r.json().catch(() => ({}))) as { video?: ProductVideo; error?: string };
      if (!r.ok || !body.video) throw new Error(body.error ?? `Upload failed (${r.status})`);
      ordered.push(body.video);
      keys.push(s.key);
    } catch (e) {
      failed++;
      lastError = (e as Error).message;
    }
  }
  if (ordered.length > 0) {
    const r = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videos: ordered }) });
    const body = (await r.json().catch(() => ({}))) as { error?: string; videos?: ProductVideo[] };
    if (!r.ok) return { error: body.error ?? "Could not save videos", saved };
    // The server drops repeats, so only trust the order when nothing was dropped.
    if (body.videos?.length === keys.length) keys.forEach((k, i) => saved.set(k, body.videos![i]));
  }
  return { error: failed > 0 ? `${failed} clip(s) did not upload (${lastError})` : null, saved };
}

type Props =
  | {
      productId: string;
      staged?: never;
      onStagedChange?: never;
      onSavedChange?: (videos: ProductVideo[]) => void;
      /** A video's link was changed (so the form can move its colour choices to the new one). */
      onReplaced?: (before: ProductVideo, after: ProductVideo) => void;
    }
  | { productId?: never; staged: StagedVideo[]; onStagedChange: (next: StagedVideo[]) => void; onSavedChange?: never; onReplaced?: never };

export default function ProductVideoManager({ productId, staged, onStagedChange, onSavedChange, onReplaced }: Props) {
  const isStaged = !productId;
  const api = `/api/admin/products/${productId}/videos`;
  const [savedVideos, setVideos] = useState<ProductVideo[]>([]);
  const videos = isStaged ? staged!.map((s) => s.video) : savedVideos;
  const [loading, setLoading] = useState(!isStaged);
  // The form's colour media picker lists the saved videos (once they are known).
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!isStaged && loaded) onSavedChange?.(savedVideos);
  }, [isStaged, loaded, savedVideos, onSavedChange]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isStaged) return () => abortRef.current?.abort();
    let live = true;
    fetch(api)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setError(body.error ?? "Could not load videos");
        else {
          setVideos(body.videos ?? []);
          setLoaded(true);
        }
      })
      .catch(() => live && setError("Could not load videos"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
      abortRef.current?.abort();
    };
  }, [api, isStaged]);

  const save = useCallback(
    async (next: ProductVideo[]) => {
      if (isStaged) {
        // Same objects come back, so each one finds its staged entry; a new link has none.
        const list = staged!;
        const mapped = next.map((v) => list.find((s) => s.video === v) ?? { key: crypto.randomUUID(), video: v });
        releaseStagedVideos(list.filter((s) => !mapped.includes(s)));
        onStagedChange!(mapped);
        return true;
      }
      setSaving(true);
      setError(null);
      try {
        const r = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videos: next }) });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Could not save videos");
        setVideos(body.videos ?? next);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [api, isStaged, staged, onStagedChange],
  );

  const addLink = async () => {
    const raw = link.trim();
    if (!raw) return;
    const parsed = readLink(raw);
    if (!parsed) return;
    if (await save([...videos, parsed])) setLink("");
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setBusy({ step: "shrink", done: 0, name: file.name });
      const { compressVideo } = await import("@/lib/media/video-compress");
      const out = await compressVideo(file, (done) => setBusy({ step: "shrink", done, name: file.name }), controller.signal);
      const clip = { file: out.file, poster: out.poster, width: out.width, height: out.height, seconds: out.seconds };

      if (isStaged) {
        const video: ProductVideo = {
          kind: "file",
          url: URL.createObjectURL(out.file),
          poster: out.poster ? URL.createObjectURL(out.poster) : null,
          bytes: out.file.size,
          seconds: Math.round(out.seconds) || undefined,
          vertical: out.height > out.width,
        };
        onStagedChange!([...staged!, { key: crypto.randomUUID(), video, clip }]);
        setNotice(
          `Ready: ${mb(out.file.size)}${out.shrunk ? ` (was ${mb(file.size)})` : ""}, ${out.width}×${out.height}. It uploads when you save the product.`,
        );
        return;
      }

      setBusy({ step: "upload", done: 0, name: file.name });
      const res = await uploadWithProgress(api, clipForm(clip), (done) => setBusy({ step: "upload", done, name: file.name }));
      const body = (res.body ?? {}) as { videos?: ProductVideo[]; error?: string };
      if (res.status >= 400) throw new Error(body.error ?? `Upload failed (${res.status})`);
      setVideos(body.videos ?? videos);
      setNotice(
        out.shrunk
          ? `Saved ${mb(out.file.size)} (was ${mb(file.size)}), ${out.width}×${out.height}.`
          : `Saved as it was (${mb(out.file.size)}); it was already small.`,
      );
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  };

  /** Checks a pasted link; null (with the reason shown) when it cannot be used. */
  const readLink = (raw: string): ProductVideo | null => {
    if (isShortLink(raw)) {
      setError("This is a short/share link. Open it in the browser and copy the full address from the address bar, or paste the video's Embed code.");
      return null;
    }
    const parsed = parseVideoLink(raw);
    if (!parsed) setError("Paste a link to one video on YouTube, Facebook, TikTok, Instagram, Vimeo or Google Drive.");
    return parsed;
  };

  // Changing a link in place: same spot in the list, same colour choices.
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const saveEdit = async () => {
    if (!editing) return;
    const raw = editing.text.trim();
    const old = videos[editing.index];
    if (!old || !raw) return;
    if (raw === old.url) {
      setEditing(null);
      return;
    }
    setError(null);
    const parsed = readLink(raw);
    if (!parsed) return;
    if (isStaged) {
      // Keep the staged key, so colour choices made for this video stay.
      onStagedChange!(staged!.map((s, k) => (k === editing.index ? { ...s, video: parsed } : s)));
      setEditing(null);
      return;
    }
    const next = videos.map((v, k) => (k === editing.index ? parsed : v));
    if (await save(next)) {
      onReplaced?.(old, parsed);
      setEditing(null);
    }
  };

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= videos.length) return;
    const next = [...videos];
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
  };

  const remove = (i: number) => {
    const v = videos[i];
    if (isStaged) {
      void save(videos.filter((_, k) => k !== i));
      return;
    }
    const what = v.kind === "file" ? "This deletes the uploaded file." : "The video itself stays on " + VIDEO_HOST_LABEL[v.kind] + ".";
    if (!window.confirm(`Remove this video from the product? ${what}`)) return;
    void save(videos.filter((_, k) => k !== i));
  };

  const full = videos.length >= MAX_VIDEOS;
  const disabled = loading || saving || !!busy;

  return (
    <div className="flex flex-col gap-3 border-t border-border-light pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-on-surface">Videos</p>
        <span className="text-[10px] text-text-muted">
          {videos.length}/{MAX_VIDEOS}
        </span>
      </div>
      <p className="text-[11px] text-text-muted">
        Best: put the video on YouTube (or Facebook / TikTok) and paste the link. It costs no storage and plays
        smoothly on slow phones. Upload only short clips (up to {MAX_VIDEO_SECONDS} s); they are made smaller
        (720p) in this browser before upload. The first video shows second in the product gallery, after the main photo.
        {isStaged && " They are saved together with the product when you press Save."}
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2 text-[11px] text-badge-discount">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {notice && <p className="text-[11px] text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border-light bg-surface-card px-2.5">
          <Link2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addLink();
              }
            }}
            placeholder="Video link or embed code (YouTube, Facebook, TikTok...)"
            className="h-9 flex-1 min-w-0 bg-transparent text-xs text-on-surface outline-none"
            disabled={disabled || full}
          />
        </div>
        <button
          type="button"
          onClick={() => void addLink()}
          disabled={disabled || full || !link.trim()}
          className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Add link
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || full}
          className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-light px-3 text-xs font-semibold text-on-surface hover:bg-surface-subtle disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" /> Upload clip
        </button>
        <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>

      {busy && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-2.5 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="text-[11px] flex-1 truncate">
            {busy.step === "shrink" ? "Making it smaller (keep this tab open)" : "Uploading"}: {busy.name}
          </span>
          <div className="w-24 h-1 bg-border-light rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(busy.done * 100)}%` }} />
          </div>
          <span className="text-[10px] text-text-muted w-8 text-right">{Math.round(busy.done * 100)}%</span>
          {busy.step === "shrink" && (
            <button type="button" onClick={() => abortRef.current?.abort()} className="text-[10px] text-badge-discount font-semibold">
              Stop
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-text-muted">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading videos...
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <Film className="w-5 h-5 text-text-muted" />
          <p className="text-[11px] text-text-muted">No videos yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {videos.map((v, i) => {
            const poster = videoPoster(v);
            return (
              <li key={`${v.kind}-${v.id ?? v.storage_path ?? v.url}`} className="flex items-center gap-2.5 rounded-lg border border-border-light bg-surface-card p-2">
                <div className="relative w-16 h-12 shrink-0 overflow-hidden rounded bg-surface-subtle">
                  {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Film className="absolute inset-0 m-auto w-5 h-5 text-text-muted" />
                  )}
                  <Play className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" fill="currentColor" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-on-surface">
                    {VIDEO_HOST_LABEL[v.kind]}
                    {v.vertical && <span className="ml-1.5 text-[10px] font-normal text-text-muted">tall</span>}
                    {i === 0 && <span className="ml-1.5 text-[10px] font-normal text-primary">shown first</span>}
                  </p>
                  {editing?.index === i ? (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        autoFocus
                        value={editing.text}
                        onChange={(e) => setEditing({ index: i, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveEdit();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                        placeholder="New video link"
                        aria-label="New video link"
                        className="h-8 min-w-0 flex-1 rounded border border-border-light bg-surface-card px-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button type="button" onClick={() => void saveEdit()} disabled={saving} aria-label="Save link" className="p-1.5 rounded text-primary hover:bg-primary/10 disabled:opacity-30">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="p-1.5 rounded hover:bg-surface-subtle">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <a href={v.url} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-text-muted hover:text-primary">
                      {v.kind === "file" ? [v.seconds ? `${v.seconds} s` : null, v.bytes ? mb(v.bytes) : null].filter(Boolean).join(" · ") || "Open" : v.url}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {v.kind !== "file" && editing?.index !== i && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setEditing({ index: i, text: v.url });
                      }}
                      disabled={disabled}
                      aria-label="Change link"
                      title="Change link"
                      className="p-1.5 rounded hover:bg-surface-subtle disabled:opacity-30"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label="Move up" className="p-1.5 rounded hover:bg-surface-subtle disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === videos.length - 1} aria-label="Move down" className="p-1.5 rounded hover:bg-surface-subtle disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(i)} disabled={disabled} aria-label="Remove video" className="p-1.5 rounded text-badge-discount hover:bg-badge-discount/10 disabled:opacity-30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
