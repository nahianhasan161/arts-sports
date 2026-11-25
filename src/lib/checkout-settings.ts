"use client";

import { useEffect, useState } from "react";

/** Delivery fees and the free-delivery line, as set by admin (same values the order RPC uses). */
export interface CheckoutSettings {
  delivery_fee_dhaka: number;
  delivery_fee_outside: number;
  free_delivery_over: number;
  cod_min_advance: number;
  dhaka_inside_thanas: string | null;
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  delivery_fee_dhaka: 70,
  delivery_fee_outside: 120,
  free_delivery_over: 1500,
  cod_min_advance: 120,
  dhaka_inside_thanas: null,
};

let cache: Promise<CheckoutSettings> | null = null;

async function read(): Promise<CheckoutSettings> {
  // Loaded on demand: the cart drawer uses this and is on every page.
  const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return DEFAULT_CHECKOUT_SETTINGS;
  const { data, error } = await supabase.rpc("checkout_settings");
  return error || !data ? DEFAULT_CHECKOUT_SETTINGS : { ...DEFAULT_CHECKOUT_SETTINGS, ...(data as Partial<CheckoutSettings>) };
}

function load(): Promise<CheckoutSettings> {
  if (!cache) {
    cache = read();
    // A failed load (slow or lost connection) is tried again by the next caller.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export function useCheckoutSettings(): CheckoutSettings {
  const [settings, setSettings] = useState(DEFAULT_CHECKOUT_SETTINGS);
  useEffect(() => {
    let alive = true;
    load().then((s) => alive && setSettings(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
