"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/tracking/attribution";

/** Saves UTM tags and fbclid from the landing URL so the order can carry them. */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
