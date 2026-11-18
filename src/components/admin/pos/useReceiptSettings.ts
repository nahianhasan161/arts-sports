"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/admin/pos/api";
import { EMPTY_RECEIPT_SETTINGS, type ReceiptSettings } from "@/lib/pos/receipt-settings";

/** Receipt settings for the print pages; null until loaded (defaults on error). */
export function useReceiptSettings(): ReceiptSettings | null {
  const [s, setS] = useState<ReceiptSettings | null>(null);
  useEffect(() => {
    void api<{ settings: ReceiptSettings }>("/api/admin/pos/receipt-settings").then((res) => setS(res.ok ? res.data.settings : EMPTY_RECEIPT_SETTINGS));
  }, []);
  return s;
}
