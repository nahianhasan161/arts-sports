"use client";

import { useEffect } from "react";
import { trackEvent, type EventItem } from "@/lib/tracking/events";

/**
 * Browser half of the order event. The id is derived from the order, the
 * same one the server sends to the Conversions API, so Meta counts it once
 * and a reload does not count it again.
 */
export function OrderPixel({
  event,
  orderId,
  value,
  items,
}: {
  event: "Purchase" | "Lead";
  orderId: string;
  value: number;
  items: EventItem[];
}) {
  useEffect(() => {
    const key = `as_px_${event}_${orderId}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: Meta still dedupes by event id.
    }
    trackEvent(event, { value, items, orderId }, `${event === "Purchase" ? "purchase" : "lead"}-${orderId}`);
  }, [event, orderId, value, items]);
  return null;
}
