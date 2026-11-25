"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

// On every page but rarely opened, so it is downloaded with the first question.
const ConfirmDialog = dynamic(() => import("./confirm-dialog"), { ssr: false });

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button (delete, undo money). */
  danger?: boolean;
  /** Ask for a typed reason; confirm stays disabled until it is filled. */
  reason?: { label: string; placeholder?: string };
}

/** `false` when cancelled; otherwise `{ reason }` (empty string when no reason was asked). */
export type ConfirmResult = false | { reason: string };

type Ask = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<Ask | null>(null);

/** Promise-based replacement for window.confirm / window.prompt. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  // The last question stays after it is answered, so the dialog can fade out with its text.
  const [question, setQuestion] = useState<{ id: number; options: ConfirmOptions; open: boolean } | null>(null);
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);

  const ask = useCallback<Ask>((options) => {
    resolver.current?.(false);
    setQuestion((q) => ({ id: (q?.id ?? 0) + 1, options, open: true }));
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (result: ConfirmResult) => {
    resolver.current?.(result);
    resolver.current = null;
    setQuestion((q) => q && { ...q, open: false });
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {question && <ConfirmDialog key={question.id} options={question.options} open={question.open} finish={finish} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
