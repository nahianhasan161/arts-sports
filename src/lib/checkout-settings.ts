"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Delivery fees and the free-delivery line, as set by admin (same values the order RPC uses). */
export interface CheckoutSettings {
  delivery_fee_dhaka: number;
  delivery_fee_outside: number;
  free_delivery_over: number;
  cod_min_advance: number;
  dhaka_inside_thanas: string | null;
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  delivery_fee_dhaka: 60,
  delivery_fee_outside: 120,
  free_delivery_over: 1500,
  cod_min_advance: 120,
  dhaka_inside_thanas: null,
};

let cache: Promise<CheckoutSettings> | null = null;

function load(): Promise<CheckoutSettings> {
  if (!cache) {
    const supabase = getSupabaseBrowserClient();
    cache = supabase
      ? Promise.resolve(supabase.rpc("checkout_settings")).then(({ data, error }) =>
          error || !data ? DEFAULT_CHECKOUT_SETTINGS : { ...DEFAULT_CHECKOUT_SETTINGS, ...(data as Partial<CheckoutSettings>) }
        )
      : Promise.resolve(DEFAULT_CHECKOUT_SETTINGS);
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
