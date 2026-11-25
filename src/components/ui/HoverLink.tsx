"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";

/**
 * A link that is prefetched when someone points at or touches it, not as soon
 * as it is on screen. A page full of plain links downloads every page they
 * lead to, which on a slow connection competes with the page being read.
 */
export function HoverLink({ onMouseEnter, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [wanted, setWanted] = useState(false);
  return (
    <Link
      {...props}
      prefetch={wanted ? null : false}
      onMouseEnter={(e) => {
        setWanted(true);
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setWanted(true);
        onTouchStart?.(e);
      }}
    />
  );
}
