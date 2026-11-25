"use client";

import { useEffect, useState } from "react";

export interface LiveBadge {
  badge_label: string;
  badge_type: string;
  discount_percent: number;
  base_price: number;
  final_price: number;
  promotion_id: string;
  promotion_name: string;
}

export type BadgeMap = Record<string, LiveBadge>;

/**
 * Every card asks for its own product. Requests made in the same tick are
 * merged into one call, so a grid of ten cards is one request, not ten.
 */
const BATCH = 100;
let queue: { ids: string[]; done: (badges: BadgeMap) => void }[] = [];

function flush() {
  const asked = queue;
  queue = [];
  const ids = [...new Set(asked.flatMap((q) => q.ids))];
  const calls: Promise<BadgeMap>[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    calls.push(
      fetch(`/api/pricing/badges?product_ids=${encodeURIComponent(ids.slice(i, i + BATCH).join(","))}`)
        .then((res) => (res.ok ? res.json() : { data: {} }))
        .then((json: { data?: BadgeMap }) => json.data ?? {})
        .catch(() => ({}))
    );
  }
  void Promise.all(calls).then((parts) => {
    const all: BadgeMap = Object.assign({}, ...parts);
    for (const { ids: wanted, done } of asked) {
      done(Object.fromEntries(wanted.filter((id) => all[id]).map((id) => [id, all[id]])));
    }
  });
}

/**
 * Live promotion badge + effective price for a set of products.
 *
 * Returns a map keyed by product id. Products with no live promotion are
 * absent from the map, which is the caller's signal to fall back to the
 * product's own badge and price. Fetch failures degrade silently to that
 * same fallback rather than blanking the grid.
 */
export function useLiveBadges(productIds: string[]): BadgeMap {
  const [badges, setBadges] = useState<BadgeMap>({});
  const key = productIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setBadges({});
      return;
    }
    if (queue.length === 0) setTimeout(flush, 30);
    queue.push({ ids: key.split(","), done: (b) => !cancelled && setBadges(b) });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return badges;
}
