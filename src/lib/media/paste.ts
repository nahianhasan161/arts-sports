"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Picture files in a paste or drop (screenshots, "Copy image" in a browser, files copied in Finder/Explorer). */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const f = item.getAsFile();
    if (!f) continue;
    // Pasted screenshots are all called "image.png"; give each its own name.
    const name = f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}-${out.length + 1}.${f.type.split("/")[1] || "png"}`;
    out.push(new File([f], name, { type: f.type }));
  }
  if (out.length === 0) {
    for (const f of Array.from(data.files ?? [])) if (f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Ctrl/⌘+V anywhere on the page sends pasted pictures to `onFiles`, while the
 * element in `ref` is on screen (a hidden form tab does not take them) and the
 * cursor is not in a text box (pasting text there still works).
 */
export function usePasteImages(ref: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void, enabled = true) {
  const latest = useRef(onFiles);
  useEffect(() => {
    latest.current = onFiles;
  });
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = ref.current;
      if (!el || el.getClientRects().length === 0 || editable(e.target)) return;
      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      latest.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [ref, enabled]);
}
