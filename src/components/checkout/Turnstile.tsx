"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

/** Cloudflare Turnstile (free bot check). Renders nothing without a site key. */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const w = window as Window & { turnstile?: TurnstileApi };
    const mount = () => {
      if (!ref.current || !w.turnstile || widgetId.current) return;
      widgetId.current = w.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    if (w.turnstile) mount();
    else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
    }
    return () => {
      if (widgetId.current && w.turnstile) w.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [onToken]);

  useEffect(() => {
    const w = window as Window & { turnstile?: TurnstileApi };
    if (resetKey && widgetId.current && w.turnstile) {
      w.turnstile.reset(widgetId.current);
      onToken(null);
    }
  }, [resetKey, onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="min-h-0" />;
}

export const TURNSTILE_ENABLED = Boolean(SITE_KEY);
