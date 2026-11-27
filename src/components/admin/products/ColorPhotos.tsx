"use client";

import { useRef, useState, type DragEvent } from "react";
import { ClipboardPaste, GripVertical, ImageIcon, Loader2, Play, Star, X } from "lucide-react";
import { imageFilesFrom, usePasteImages } from "@/lib/media/paste";
import { VariantEditor, type VariantEditorProps } from "./VariantEditor";

/**
 * Variations tab: the variation list and each colour's pictures in one place.
 *
 * 1. "Shown first" bar: the colour (and size) the product page opens on.
 *    Product cards show that colour's first picture.
 * 2. The variation list (`VariantEditor`). Under every colour heading sits that
 *    colour's media strip: the top row is its media in the order shoppers see
 *    it (drag to reorder, × to take off); below are the product's other
 *    pictures/videos (tap to add). Pictures can be pasted (Ctrl/⌘+V, goes to
 *    the highlighted colour) or dropped on a colour: they are uploaded to the
 *    product and given to that colour.
 *
 * On the product page a colour's own media is shown first, then the media no
 * colour has; media that only other colours have is hidden.
 *
 * `value` maps a lower-case colour name to tile keys; the form turns keys into
 * stored entries (image url / `video:<key>`).
 */
export interface MediaChoice {
  key: string;
  /** Picture, or a video's poster (null = no poster). */
  src: string | null;
  video?: boolean;
  label: string;
}

export interface DefaultChoice {
  color?: string;
  size?: string;
}

interface Props {
  /** The product's colours, in order. */
  colors: { id: string; name: string; hex: string }[];
  /** Size / option labels of the product. */
  sizes: string[];
  choices: MediaChoice[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  defaultChoice: DefaultChoice;
  onDefaultChange: (next: DefaultChoice) => void;
  /** Upload pasted/dropped pictures and give them to the colour. */
  onAddFiles: (color: string, files: File[]) => void;
  /** Colour whose pictures are being uploaded. */
  busyColor?: string | null;
  disabled?: boolean;
  /** The variation list; the colour slots are filled here. */
  editor: Omit<VariantEditorProps, "colorBadge" | "colorExtra">;
}

const lc = (x: string) => x.trim().toLowerCase();
const selectClass =
  "h-8 rounded-md border border-border-light bg-surface-card px-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30";

export function VariationsPanel({
  colors,
  sizes,
  choices,
  value,
  onChange,
  defaultChoice,
  onDefaultChange,
  onAddFiles,
  busyColor,
  disabled,
  editor,
}: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const activeColor = active && colors.some((c) => lc(c.name) === active) ? active : colors[0] ? lc(colors[0].name) : null;
  usePasteImages(sectionRef, (files) => activeColor && onAddFiles(activeColor, files), !disabled && colors.length > 0);
  // Drag: a chosen tile moving inside its row, or a not-chosen tile being added at a spot.
  const [drag, setDrag] = useState<{ color: string; key: string } | null>(null);
  const [over, setOver] = useState<{ color: string; index: number } | null>(null);
  const [fileOver, setFileOver] = useState<string | null>(null);

  const byId = new Map(colors.map((c) => [c.id, c]));
  const byKey = new Map(choices.map((c) => [c.key, c]));
  const chosenOf = (color: string) => (value[color] ?? []).filter((k) => byKey.has(k));

  const setList = (color: string, list: string[]) => {
    const next = { ...value };
    if (list.length) next[color] = list;
    else delete next[color];
    onChange(next);
  };
  const toggle = (color: string, key: string) => {
    const cur = value[color] ?? [];
    setList(color, cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };
  const dropAt = (color: string, index: number) => {
    if (!drag || drag.color !== color) return;
    const cur = (value[color] ?? []).filter((k) => k !== drag.key);
    const from = (value[color] ?? []).indexOf(drag.key);
    // Moving right inside the same list: the gap left behind shifts the spot.
    const at = from >= 0 && from < index ? index - 1 : index;
    cur.splice(Math.min(at, cur.length), 0, drag.key);
    setList(color, cur);
    setDrag(null);
    setOver(null);
  };
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  /** Heading badge: the colour's cover picture and how many it has. */
  const badge = (id: string) => {
    const c = byId.get(id);
    if (!c) return null;
    const color = lc(c.name);
    const chosen = chosenOf(color);
    const cover = chosen[0] ? byKey.get(chosen[0]) : undefined;
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
        {cover && (
          <span className="relative h-6 w-6 overflow-hidden rounded border border-border-light bg-surface-card">
            <Tile p={cover} />
          </span>
        )}
        <ImageIcon className="h-3 w-3" aria-hidden />
        {chosen.length}
        {defaultChoice.color === color && (
          <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            <Star className="h-3 w-3" aria-hidden /> Shown first
          </span>
        )}
      </span>
    );
  };

  /** The colour's media strip, under its heading. */
  const strip = (id: string) => {
    const c = byId.get(id);
    if (!c) return null;
    const color = lc(c.name);
    const chosen = chosenOf(color);
    const rest = choices.filter((p) => !chosen.includes(p.key));
    const isActive = activeColor === color;
    const busy = busyColor === color;
    const isDefault = defaultChoice.color === color;
    return (
      <div
        tabIndex={-1}
        onMouseEnter={() => setActive(color)}
        onFocus={() => setActive(color)}
        onClick={() => setActive(color)}
        onDragOver={(e) => {
          if (!hasFiles(e) || disabled) return;
          e.preventDefault();
          setFileOver(color);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver((x) => (x === color ? null : x));
        }}
        onDrop={(e) => {
          if (!hasFiles(e) || disabled) return;
          e.preventDefault();
          setFileOver(null);
          const files = imageFilesFrom(e.dataTransfer);
          if (files.length) onAddFiles(color, files);
        }}
        className={`mx-1.5 mb-1.5 mt-1 rounded-lg border p-2 outline-none transition ${
          fileOver === color ? "border-primary bg-primary/5" : isActive ? "border-primary/40" : "border-border-light/70"
        }`}
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-text-muted">Pictures &amp; videos</span>
          {busy && (
            <span className="inline-flex items-center gap-1 text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Uploading…
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            {!isDefault && (
              <button type="button" disabled={disabled} className="text-primary hover:underline" onClick={() => onDefaultChange({ ...defaultChoice, color })}>
                Show first
              </button>
            )}
            {rest.length > 0 && (
              <button type="button" disabled={disabled} className="text-primary hover:underline" onClick={() => setList(color, [...chosen, ...rest.map((x) => x.key)])}>
                All
              </button>
            )}
            {chosen.length > 0 && (
              <button type="button" disabled={disabled} className="text-text-muted hover:underline" onClick={() => setList(color, [])}>
                Clear
              </button>
            )}
          </span>
        </div>

        {/* This colour's media, in order */}
        <div
          className={`flex min-h-[4.25rem] flex-wrap items-center gap-2 rounded-md border border-dashed p-1.5 ${
            over?.color === color && over.index === chosen.length ? "border-primary" : "border-border-light"
          }`}
          onDragOver={(e) => {
            if (!drag || drag.color !== color) return;
            e.preventDefault();
            if (e.target === e.currentTarget) setOver({ color, index: chosen.length });
          }}
          onDrop={(e) => {
            if (!drag) return;
            e.preventDefault();
            e.stopPropagation();
            dropAt(color, over?.color === color ? over.index : chosen.length);
          }}
        >
          {chosen.length === 0 && (
            <span className="flex items-center gap-1.5 px-1 text-xs text-text-muted">
              <ClipboardPaste className="h-4 w-4" aria-hidden />
              {choices.length ? "Tap pictures below, paste (Ctrl/⌘+V) or drop files." : "Paste (Ctrl/⌘+V) or drop pictures here."}
            </span>
          )}
          {chosen.map((key, i) => {
            const p = byKey.get(key)!;
            return (
              <div
                key={key}
                draggable={!disabled}
                onDragStart={(e) => {
                  setDrag({ color, key });
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                onDragOver={(e) => {
                  if (!drag || drag.color !== color) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const index = e.clientX > r.left + r.width / 2 ? i + 1 : i;
                  if (over?.color !== color || over.index !== index) setOver({ color, index });
                }}
                className={`group relative h-14 w-14 shrink-0 cursor-grab overflow-hidden rounded-md border-2 border-primary bg-surface-subtle active:cursor-grabbing ${
                  drag?.key === key && drag.color === color ? "opacity-40" : ""
                }`}
                title={`${p.label} · drag to move`}
              >
                {over?.color === color && over.index === i && <span className="absolute inset-y-0 left-0 z-10 w-1 bg-primary" />}
                {over?.color === color && over.index === i + 1 && i === chosen.length - 1 && (
                  <span className="absolute inset-y-0 right-0 z-10 w-1 bg-primary" />
                )}
                <Tile p={p} />
                <span className="absolute left-0.5 top-0.5 min-w-4 rounded bg-primary px-1 text-[10px] font-bold leading-4 text-white">{i + 1}</span>
                <GripVertical className="absolute bottom-0.5 left-0.5 h-3 w-3 text-white drop-shadow" aria-hidden />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(color, key)}
                  aria-label={`Take ${p.label} off ${c.name}`}
                  className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* The product's other media: tap (or drag up) to add */}
        {rest.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {rest.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(e) => {
                  setDrag({ color, key: p.key });
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                onClick={() => toggle(color, p.key)}
                aria-label={`Add ${p.label} to ${c.name}`}
                title={`${p.label} · tap to add`}
                className="relative h-10 w-10 overflow-hidden rounded-md border-2 border-border-light bg-surface-subtle opacity-60 transition hover:opacity-100"
              >
                <Tile p={p} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={sectionRef} className="space-y-3">
      {/* Shown first */}
      {(colors.length > 0 || sizes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-light bg-surface-card px-3 py-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface">
            <Star className="h-3.5 w-3.5 text-primary" aria-hidden /> Shown first
          </span>
          {colors.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Colour
              <select
                className={selectClass}
                disabled={disabled}
                value={defaultChoice.color ?? ""}
                onChange={(e) => onDefaultChange({ ...defaultChoice, color: e.target.value || undefined })}
              >
                <option value="">Automatic</option>
                {colors.map((c) => (
                  <option key={c.id} value={lc(c.name)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sizes.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Size / option
              <select
                className={selectClass}
                disabled={disabled}
                value={defaultChoice.size ?? ""}
                onChange={(e) => onDefaultChange({ ...defaultChoice, size: e.target.value || undefined })}
              >
                <option value="">Automatic</option>
                {sizes.map((s) => (
                  <option key={s} value={lc(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="w-full text-[11px] text-text-muted sm:w-auto sm:flex-1">
            The product page opens on this; cards show this colour&apos;s first picture. Automatic = first in stock.
          </span>
        </div>
      )}

      <VariantEditor {...editor} colorBadge={colors.length ? badge : undefined} colorExtra={colors.length ? strip : undefined} />

      {colors.length > 0 && (
        <p className="text-[11px] leading-relaxed text-text-muted">
          Each colour&apos;s pictures sit under its name: tap to add, drag to set the order, paste (Ctrl/⌘+V, goes to the
          highlighted colour) or drop files on a colour to upload them. Pictures no colour has are shown for every colour.
        </p>
      )}
    </div>
  );
}

function Tile({ p }: { p: MediaChoice }) {
  return (
    <>
      {p.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.src} alt="" draggable={false} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center p-0.5 text-center text-[9px] text-text-muted">{p.label}</span>
      )}
      {p.video && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 p-1 text-white">
            <Play className="h-3 w-3" aria-hidden />
          </span>
        </span>
      )}
    </>
  );
}
