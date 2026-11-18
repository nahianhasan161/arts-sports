"use client";

import { useState, type RefObject } from "react";
import { Check, Copy, Download } from "lucide-react";
import { domToBlob } from "modern-screenshot";
import { useT } from "@/i18n/client";

/**
 * Turns the element in `target` into a PNG and puts it on the clipboard, so staff
 * can paste the receipt straight into Messenger / WhatsApp chat (online & Facebook sales).
 * If the browser blocks image copy, it downloads the PNG instead.
 * `mode="download"` skips the clipboard and just saves the PNG.
 */
export function CopyImageButton({
  target,
  fileName,
  className,
  mode = "copy",
}: {
  target: RefObject<HTMLElement | null>;
  fileName: string;
  className?: string;
  mode?: "copy" | "download";
}) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "busy" | "copied" | "saved" | "failed">("idle");

  const render = async () => {
    const el = target.current;
    if (!el) throw new Error("no receipt");
    const blob = await domToBlob(el, { scale: 2, backgroundColor: "#ffffff", type: "image/png" });
    if (!blob) throw new Error("render failed");
    return blob;
  };

  const download = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const flash = (s: typeof state) => {
    setState(s);
    setTimeout(() => setState("idle"), 2500);
  };

  const save = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      download(await render());
      flash("saved");
    } catch {
      flash("failed");
    }
  };

  const copy = async () => {
    if (state === "busy") return;
    setState("busy");
    // Pass a promise to ClipboardItem so Safari keeps the click as the user gesture.
    const blobP = render();
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobP })]);
      flash("copied");
    } catch {
      try {
        download(await blobP);
        flash("saved");
      } catch {
        flash("failed");
      }
    }
  };

  const isDl = mode === "download";
  const Icon = state === "copied" ? Check : state === "saved" ? (isDl ? Check : Download) : isDl ? Download : Copy;
  const label =
    state === "busy" ? t("shop.receipt.copying")
    : state === "copied" ? t("shop.receipt.copied")
    : state === "saved" ? t("shop.receipt.savedImage")
    : state === "failed" ? t("shop.receipt.copyFailed")
    : isDl ? t("shop.receipt.downloadImage")
    : t("shop.receipt.copyImage");

  return (
    <button
      type="button"
      className={className}
      onClick={isDl ? save : copy}
      disabled={state === "busy"}
      title={t(isDl ? "shop.receipt.downloadImageHint" : "shop.receipt.copyImageHint")}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
