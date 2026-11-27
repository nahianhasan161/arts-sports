"use client";

/**
 * Image picker for a product that has not been saved yet.
 *
 * Uploading needs a product id, so a new product keeps its pictures here, in
 * the browser, until the form is saved. Each file is resized and re-encoded as
 * WebP the moment it is chosen (same helper the saved-product manager uses), so
 * the admin sees the final, smaller size straight away and only that small file
 * is uploaded later.
 */

import { useRef, useState } from "react";
import { usePasteImages } from "@/lib/media/paste";
import { ImagePlus, Star, X, Loader2 } from "lucide-react";
import { optimizeImageFile } from "@/lib/media/client-optimize";
import { MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES, MEDIA_MAX_PER_PRODUCT } from "@/types";

export interface StagedImage {
  id: string;
  file: File;
  preview: string;
  originalBytes: number;
}

/**
 * Shrinks picked/pasted files into staged pictures (at most `room` of them).
 * Also used by the colour media box, which adds pasted pictures for a colour.
 */
export async function stageImageFiles(files: File[], room: number): Promise<{ added: StagedImage[]; rejected: number }> {
  const added: StagedImage[] = [];
  let rejected = 0;
  for (const original of files.slice(0, Math.max(0, room))) {
    const file = await optimizeImageFile(original);
    const okType = (MEDIA_ACCEPTED_TYPES as readonly string[]).includes(file.type);
    if (!okType || file.size > MEDIA_MAX_BYTES) {
      rejected++;
      continue;
    }
    added.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), originalBytes: original.size });
  }
  return { added, rejected };
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Props {
  images: StagedImage[];
  onChange: (next: StagedImage[]) => void;
  disabled?: boolean;
}

export default function StagedImagePicker({ images, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (files: File[]) => {
    setError(null);
    const room = MEDIA_MAX_PER_PRODUCT - images.length;
    if (room <= 0) {
      setError(`A product can have at most ${MEDIA_MAX_PER_PRODUCT} images.`);
      return;
    }
    setBusy(true);
    try {
      const { added, rejected } = await stageImageFiles(files, room);
      onChange([...images, ...added]);
      if (rejected > 0) setError(`${rejected} file(s) skipped: only JPEG, PNG, WebP or AVIF under 5 MB.`);
      else if (files.length > room) setError(`Only ${room} more image(s) fit; the rest were skipped.`);
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    const gone = images.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    onChange(images.filter((i) => i.id !== id));
  };

  // Ctrl/⌘+V pastes pictures in; tiles can be dragged into a new order.
  const rootRef = useRef<HTMLDivElement>(null);
  usePasteImages(rootRef, (files) => void add(files), !disabled && !busy);
  const [dragId, setDragId] = useState<string | null>(null);
  const dropOn = (targetId: string) => {
    const from = images.findIndex((i) => i.id === dragId);
    const to = images.findIndex((i) => i.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const makeFirst = (id: string) => {
    const pick = images.find((i) => i.id === id);
    if (pick) onChange([pick, ...images.filter((i) => i.id !== id)]);
  };

  return (
    <div ref={rootRef} className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) void add(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
        }}
        className="border-2 border-dashed border-border-light rounded-xl p-6 text-center bg-surface-subtle"
      >
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          {busy ? "Optimising…" : "Add images"}
        </button>
        <p className="mt-2 text-[11px] text-text-muted">
          Drop files here, browse, or paste with Ctrl/⌘+V. Drag the pictures below to change their order. Every image is converted to a smaller WebP automatically. The first one is the
          main image.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void add(files);
          }}
        />
      </div>

      {error && <p className="text-xs text-badge-discount">{error}</p>}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {images.map((img, i) => (
            <li
              key={img.id}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragId(img.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.stopPropagation();
                dropOn(img.id);
              }}
              onDragEnd={() => setDragId(null)}
              className={`relative border border-border-light rounded-lg overflow-hidden bg-surface-card cursor-grab active:cursor-grabbing ${
                dragId === img.id ? "opacity-40" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt="" className="w-full aspect-square object-cover" />
              <div className="px-2 py-1 text-[10px] text-text-muted">
                {kb(img.originalBytes)} → <span className="font-semibold text-on-surface">{kb(img.file.size)}</span>
              </div>
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[10px] font-semibold bg-primary text-white rounded px-1.5 py-0.5">
                  Main
                </span>
              )}
              <div className="absolute top-1 right-1 flex gap-1">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeFirst(img.id)}
                    aria-label="Make main image"
                    className="p-1 rounded bg-black/60 text-white"
                  >
                    <Star className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  aria-label="Remove image"
                  className="p-1 rounded bg-black/60 text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
