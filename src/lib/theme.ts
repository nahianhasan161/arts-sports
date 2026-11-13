"use client";

import { useSyncExternalStore } from "react";

/**
 * Light / dark mode.
 *
 * The choice is kept in localStorage under "theme" and applied as the `dark`
 * class on <html>. A small script in the root layout applies it before the
 * first paint, so a dark-mode visitor never sees a white flash.
 */
export type Theme = "light" | "dark";
export const THEME_KEY = "theme";

const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows can refuse storage; the theme still applies for this visit.
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, (): Theme => "light");
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

/** Runs in <head> before paint: applies the saved theme and language. */
export const PREFERENCES_SCRIPT = `(function(){try{var d=document.documentElement;if(localStorage.getItem("${THEME_KEY}")==="dark")d.classList.add("dark");var m=document.cookie.match(/(?:^|; )lang=(bn|en)/);d.lang=m?m[1]:"bn";}catch(e){}})();`;
