"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

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
  const { t } = useT();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);

  const ask = useCallback<Ask>((o) => {
    resolver.current?.(false);
    setReason("");
    setOptions(o);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (result: ConfirmResult) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const needsReason = Boolean(options?.reason);
  const canConfirm = !needsReason || reason.trim().length > 0;

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && finish(false)}>
        <AlertDialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canConfirm) finish({ reason: reason.trim() });
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{options?.title}</AlertDialogTitle>
              {options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            {options?.reason && (
              <label className="grid gap-1 text-sm font-medium text-on-surface">
                {options.reason.label}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={options.reason.placeholder}
                  maxLength={500}
                  autoFocus
                  className="min-h-20 rounded-md border border-border-light bg-surface-card p-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{options?.cancelText ?? t("shop.common.cancel")}</AlertDialogCancel>
              <Button type="submit" variant={options?.danger ? "destructive" : "default"} disabled={!canConfirm} autoFocus={!needsReason}>
                {options?.confirmText ?? t("shop.common.confirm")}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
