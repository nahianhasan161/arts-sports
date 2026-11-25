"use client";

import { useState } from "react";
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
import type { ConfirmOptions, ConfirmResult } from "./confirm";

/** The dialog behind useConfirm(); downloaded with the first question. A new question gets a new key, so the reason starts empty. */
export default function ConfirmDialog({ options, open, finish }: { options: ConfirmOptions; open: boolean; finish: (result: ConfirmResult) => void }) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const needsReason = Boolean(options.reason);
  const canConfirm = !needsReason || reason.trim().length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && finish(false)}>
      <AlertDialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canConfirm) finish({ reason: reason.trim() });
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {options.reason && (
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
            <AlertDialogCancel type="button" className="sp-btn sp-yellow">{options.cancelText ?? t("common.cancel")}</AlertDialogCancel>
            <Button type="submit" className={options.danger ? "sp-btn sp-red" : "sp-btn sp-goal"} variant={options.danger ? "destructive" : "default"} disabled={!canConfirm} autoFocus={!needsReason}>
              {options.confirmText ?? t("common.confirm")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
