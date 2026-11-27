"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { btnGhost } from "@/components/admin/pos/api";

const READER_ID = "camera-scan-reader";
/** The same code seen again within this time is one scan, not many. */
const REPEAT_MS = 2000;

/**
 * Camera scanner for the register and the purchase screen. Reads QR codes and
 * Code 128 barcodes from the device camera and hands each new code to
 * `onCode`, the same as a scanner would type it. Stays open for the next item;
 * the staff member closes it with Done.
 *
 * The scanner library is loaded only when the panel opens.
 */
export function CameraScan({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  const lastSeen = useRef({ text: "", at: 0 });

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let cancelled = false;
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null = null;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode(READER_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
          verbose: false,
        });
        scanner = instance;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.floor(Math.min(w, h) * 0.75), height: Math.floor(Math.min(w, h) * 0.75) }) },
          (text: string) => {
            const now = Date.now();
            const last = lastSeen.current;
            if (text === last.text && now - last.at < REPEAT_MS) return;
            lastSeen.current = { text, at: now };
            setLastCode(text);
            onCodeRef.current(text);
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch {
        if (!cancelled) {
          setStarting(false);
          setError(t("shop.scan.cameraError"));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanner?.isScanning) {
        void scanner.stop().then(() => scanner?.clear()).catch(() => {});
      }
    };
    // The camera starts once; the callback is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-surface-card border border-border-light shadow-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-on-surface flex items-center gap-2">
            <Camera className="w-4 h-4" /> {t("shop.scan.camera")}
          </p>
          <button type="button" onClick={onClose} className="p-1 text-text-muted hover:text-on-surface" aria-label={t("shop.scan.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-text-muted">{t("shop.scan.cameraTitle")}</p>
        <div className="relative rounded-lg overflow-hidden bg-black min-h-[16rem]">
          <div id={READER_ID} className="w-full" />
          {starting && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white">{t("shop.scan.cameraStarting")}</p>}
        </div>
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        {lastCode && <p className="text-xs text-text-muted font-mono break-all">{lastCode}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={btnGhost}>
            {t("shop.scan.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
