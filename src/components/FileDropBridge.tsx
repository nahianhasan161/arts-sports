"use client";

import { useEffect } from "react";

/**
 * Makes every file picker on the site accept drag-and-drop.
 *
 * Most uploaders are a <label> wrapping a hidden <input type="file">, which
 * only reacts to clicks. This listens at the document level: when files are
 * dropped onto such a label (or anything inside it), it hands them to the
 * input and fires a normal `change` event, so the component's own onChange
 * runs exactly as if the user had browsed. Components with their own onDrop
 * (they call preventDefault) are left alone. Drops elsewhere are swallowed so
 * the browser doesn't navigate away to the image.
 */

function findInput(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element)) return null;
  const label = target.closest("label");
  if (!label) return null;
  const forId = label.getAttribute("for");
  const input = forId
    ? document.getElementById(forId)
    : label.querySelector('input[type="file"]');
  return input instanceof HTMLInputElement && input.type === "file" && !input.disabled ? input : null;
}

function accepts(input: HTMLInputElement, file: File): boolean {
  const accept = input.accept.trim();
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.split(",").some((raw) => {
    const rule = raw.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

const HIGHLIGHT = ["ring-2", "ring-primary", "ring-offset-1"];

export function FileDropBridge() {
  useEffect(() => {
    let lit: Element | null = null;
    const light = (el: Element | null) => {
      if (lit === el) return;
      lit?.classList.remove(...HIGHLIGHT);
      el?.classList.add(...HIGHLIGHT);
      lit = el;
    };
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (e.defaultPrevented) return light(null); // a component handles it
      e.preventDefault();
      const input = findInput(e.target);
      if (e.dataTransfer) e.dataTransfer.dropEffect = input ? "copy" : "none";
      light(input ? (e.target as Element).closest("label") : null);
    };
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) light(null);
    };
    const onDrop = (e: DragEvent) => {
      light(null);
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const input = findInput(e.target);
      if (!input || !e.dataTransfer) return;
      let files = Array.from(e.dataTransfer.files).filter((f) => accepts(input, f));
      if (!input.multiple) files = files.slice(0, 1);
      if (files.length === 0) return;
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
      light(null);
    };
  }, []);
  return null;
}
