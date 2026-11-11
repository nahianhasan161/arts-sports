"use client";

import { useEffect, useState } from "react";

export interface ProofBadge {
  bestseller: boolean;
  new: boolean;
}

/**
 * "Bestseller" / "New" flag for a product card.
 *
 * Cards ask one at a time; requests made in the same tick are merged into a
 * single call to /api/catalog/badges, and answers are kept for the page's
 * life. A product under the thresholds gets null, so no badge is shown.
 */
const known = new Map<string, ProofBadge | null>();
const waiting = new Map<string, ((b: ProofBadge | null) => void)[]>();
let scheduled = false;

function flush() {
  scheduled = false;
  const ids = [...waiting.keys()];
  const callbacks = new Map(waiting);
  waiting.clear();
  fetch(`/api/catalog/badges?ids=${encodeURIComponent(ids.join(","))}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((map: Record<string, ProofBadge>) => {
      for (const id of ids) {
        const value = map[id] ?? null;
        known.set(id, value);
        callbacks.get(id)?.forEach((cb) => cb(value));
      }
    });
}

export function useProofBadge(productId: string): ProofBadge | null {
  const [badge, setBadge] = useState<ProofBadge | null>(known.get(productId) ?? null);

  useEffect(() => {
    // Already answered: the initial state above came from the same cache.
    if (known.has(productId)) return;
    const list = waiting.get(productId) ?? [];
    list.push(setBadge);
    waiting.set(productId, list);
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 30);
    }
  }, [productId]);

  return badge;
}
