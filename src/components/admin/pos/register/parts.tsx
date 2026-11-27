"use client";

import { useRef, useState, type ReactNode } from "react";
import { Delete, Minus, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/i18n/client";

/** One press on the number pad: a digit, ".", "back" or "clear". */
export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back" | "clear";

/** What the typed text becomes after one more key. */
export function applyKey(buffer: string, key: PadKey): string {
  if (key === "clear") return "";
  if (key === "back") return buffer.slice(0, -1);
  if (key === ".") return buffer.includes(".") ? buffer : `${buffer || "0"}.`;
  return `${buffer === "0" ? "" : buffer}${key}`.slice(0, 9);
}

const KEYS: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/** A touch number pad. `side` is an extra column on the right (Qty / Disc, or quick amounts). */
export function Numpad({ onKey, side, disabled }: { onKey: (key: PadKey) => void; side?: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={`grid gap-1.5 ${side ? "grid-cols-4" : "grid-cols-3"}`}>
      <div className="col-span-3 grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onKey(k)}
            className="h-12 rounded-lg border border-border-light bg-surface-card text-lg font-semibold text-on-surface hover:bg-surface-subtle active:bg-surface-container disabled:opacity-40 flex items-center justify-center"
            aria-label={k === "back" ? "Backspace" : k}
          >
            {k === "back" ? <Delete className="w-5 h-5" /> : k}
          </button>
        ))}
      </div>
      {side && <div className="grid auto-rows-fr gap-1.5">{side}</div>}
    </div>
  );
}

export const padSide = (active: boolean) =>
  `rounded-lg border text-sm font-semibold px-1 ${active ? "border-accent-gold bg-accent-gold text-white" : "border-border-light bg-surface-card text-on-surface hover:bg-surface-subtle"} disabled:opacity-40`;

/** A centred dialog over the register. Without `onClose` it cannot be dismissed. */
export function Dialog({ title, onClose, wide, children }: { title: string; onClose?: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-md"} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-surface-card border border-border-light shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-light flex-shrink-0">
          <h2 className="font-bold text-primary">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:bg-surface-subtle" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export type OrderMode = "qty" | "disc" | "price";

/** The register's 4×4 pad: digits, the three modes on the right, +/-, "." and backspace. */
export function OrderPad({ onKey, onSign, mode, setMode, disabled, labels, noDisc }: { noDisc?: boolean; onKey: (key: PadKey) => void; onSign: () => void; mode: OrderMode; setMode: (m: OrderMode) => void; disabled?: boolean; labels: { qty: string; price: string; sign: string } }) {
  const cell = "h-[52px] border-r border-b border-border-light text-lg text-on-surface flex items-center justify-center disabled:opacity-40 transition-colors";
  const digit = `${cell} bg-surface-subtle hover:bg-surface-container active:bg-surface-container`;
  const modeBtn = (m: OrderMode, label: string) => (
    <button type="button" onClick={() => setMode(m)} className={`${cell} ${mode === m ? "bg-primary/10 ring-2 ring-inset ring-primary font-semibold" : "bg-surface-subtle hover:bg-surface-container"}`}>
      {label}
    </button>
  );
  const d = (k: PadKey) => (
    <button key={k} type="button" disabled={disabled} onClick={() => onKey(k)} className={digit}>
      {k}
    </button>
  );
  return (
    <div className="grid grid-cols-4 border-l border-t border-border-light rounded-md overflow-hidden">
      {d("1")}{d("2")}{d("3")}{modeBtn("qty", labels.qty)}
      {d("4")}{d("5")}{d("6")}{noDisc ? <span className={`${cell} bg-surface-subtle`} /> : modeBtn("disc", "%")}
      {d("7")}{d("8")}{d("9")}{modeBtn("price", labels.price)}
      <button type="button" disabled={disabled} onClick={onSign} title={labels.sign} className={`${cell} bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60`}>+/-</button>
      {d("0")}
      <button type="button" disabled={disabled} onClick={() => onKey(".")} className={`${cell} bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50`}>.</button>
      <button type="button" disabled={disabled} onClick={() => onKey("back")} aria-label="Backspace" className={`${cell} bg-red-200 hover:bg-red-300 dark:bg-red-900/50 dark:hover:bg-red-900/70`}>
        <Delete className="w-5 h-5" />
      </button>
    </div>
  );
}

/** A slip line that swipes right to show delete / +1 / −1 (shop bill and custom order slip). */
export function SwipeRow({ open, setOpen, onSelect, onPlus, onMinus, onRemove, className = "", children }: {
  open: boolean;
  setOpen: (on: boolean) => void;
  onSelect: () => void;
  onPlus: () => void;
  onMinus: () => void;
  onRemove: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  const WIDTH = 132;
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const shift = drag ?? (open ? WIDTH : 0);

  return (
    <li className={`relative overflow-hidden ${className}`}>
      <div className={`absolute inset-y-0 left-0 flex ${shift > 0 ? "" : "invisible"}`} style={{ width: WIDTH }} aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} onClick={onRemove} className="w-11 flex items-center justify-center bg-badge-discount text-white active:opacity-80" aria-label={t("shop.register.removeLine")}>
          <Trash2 className="w-4 h-4" />
        </button>
        <button type="button" tabIndex={open ? 0 : -1} onClick={onMinus} className="w-11 flex items-center justify-center bg-amber-500 text-white active:opacity-80" aria-label="-1">
          <Minus className="w-4 h-4" />
        </button>
        <button type="button" tabIndex={open ? 0 : -1} onClick={onPlus} className="w-11 flex items-center justify-center bg-emerald-600 text-white active:opacity-80" aria-label="+1">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <button
        type="button"
        style={{ transform: `translateX(${shift}px)`, transition: drag === null ? "transform 150ms ease-out" : "none", touchAction: "pan-y" }}
        className="relative block w-full text-left text-sm bg-surface-card"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, base: open ? WIDTH : 0 };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!moved.current && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - s.y))) return;
          if (!moved.current) e.currentTarget.setPointerCapture(e.pointerId);
          moved.current = true;
          setDrag(Math.max(0, Math.min(WIDTH, s.base + dx)));
        }}
        onPointerUp={() => {
          if (moved.current && drag !== null) setOpen(drag > WIDTH / 2);
          start.current = null;
          setDrag(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onClick={() => {
          if (moved.current) return void (moved.current = false);
          if (open) return setOpen(false);
          onSelect();
        }}
      >
        {children}
      </button>
    </li>
  );
}
