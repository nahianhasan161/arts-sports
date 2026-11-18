"use client";

import { useCallback, useEffect, useState } from "react";

/** Read one query param from the current URL (client only). */
export function readUrlParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Set or clear query params without a navigation (replaceState keeps Next's router state),
 * so a page/modal state gets a link that can be copied or reloaded. `null`/"" removes the key.
 */
export function writeUrlParams(params: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/**
 * useState mirrored in a query param. The fallback value is not written to the URL.
 * `toUrl`/`fromUrl` map between the state and the URL text (e.g. "custom" ↔ "custom-jersey").
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  opts?: { toUrl?: (v: T) => string; fromUrl?: (s: string) => T | null },
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  const { toUrl, fromUrl } = opts ?? {};

  useEffect(() => {
    const sync = () => {
      const raw = readUrlParam(key);
      const parsed = raw == null ? null : fromUrl ? fromUrl(raw) : (raw as T);
      setValue(parsed ?? fallback);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback((v: T) => {
    setValue(v);
    writeUrlParams({ [key]: v === fallback ? null : toUrl ? toUrl(v) : v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);

  return [value, set];
}
