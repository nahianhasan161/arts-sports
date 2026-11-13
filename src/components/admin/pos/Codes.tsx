"use client";

import { useMemo } from "react";
import { code128, qrMatrix } from "@/lib/pos/codes";

/** A Code 128 barcode. Renders nothing when the text cannot be encoded. */
export function Barcode({ value, height = 40, className }: { value: string; height?: number; className?: string }) {
  const bars = useMemo(() => code128(value), [value]);
  if (!bars) return null;
  return (
    <svg viewBox={`0 0 ${bars.width} ${height}`} preserveAspectRatio="none" className={className} role="img" aria-label={value}>
      <rect width={bars.width} height={height} fill="#fff" />
      {bars.rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}

export function QrCode({ value, size = 96, className }: { value: string; size?: number; className?: string }) {
  const qr = useMemo(() => qrMatrix(value), [value]);
  return (
    <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} width={size} height={size} className={className} shapeRendering="crispEdges" role="img" aria-label="QR">
      <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
