"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openPaymentPopup } from "@/lib/payments/popup";

/** Reopens the bKash / Nagad popup for an order that is not paid yet. */
export function FinishPaymentButton({
  checkoutUrl,
  className,
  label = "Finish payment",
}: {
  checkoutUrl: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let new-tab clicks through to the plain link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setOpen(true);
    const outcome = await openPaymentPopup(checkoutUrl);
    setOpen(false);
    // Re-read the payment from the gateway on the server.
    if (outcome !== "redirected") router.refresh();
  };

  return (
    <a href={checkoutUrl} onClick={onClick} aria-disabled={open} className={className}>
      {open ? "Opening…" : label}
    </a>
  );
}
