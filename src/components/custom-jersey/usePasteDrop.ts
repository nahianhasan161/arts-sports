"use client";

import { useEffect, useRef, useState } from "react";

/** Pasted screenshots arrive as "image.png"; give them a unique, readable name. */
function named(file: File, i: number): File {
  if (file.name && file.name !== "image.png") return file;
  const ext = file.type.split("/")[1] || "png";
  return new File([file], `pasted-${Date.now()}-${i}.${ext}`, { type: file.type });
}

/**
 * Lets people add design files by pasting (Ctrl/Cmd+V anywhere on the page) or
 * dragging them onto the returned drop zone. Paste into a text box keeps working
 * for text; only clipboard files are taken.
 */
export function usePasteDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFiles);
  useEffect(() => { cb.current = onFiles; });

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      cb.current(files.map(named));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enabled]);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => { if (!enabled || !hasFiles(e)) return; e.preventDefault(); depth.current++; setDragging(true); },
    onDragOver: (e: React.DragEvent) => { if (!enabled || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: () => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } },
    onDrop: (e: React.DragEvent) => {
      // An inner drop target (e.g. one design card) that called preventDefault() has taken the files.
      const taken = e.defaultPrevented;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (!enabled || taken) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length) cb.current(files.map(named));
    },
  };
  return { dragging, dropProps };
}
