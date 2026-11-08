"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type Gis = {
  accounts: {
    id: {
      initialize: (opts: Record<string, unknown>) => void;
      prompt: () => void;
      cancel: () => void;
    };
  };
};

async function sha256Hex(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Google One Tap at checkout: one click signs the customer in (Supabase
 * signInWithIdToken) without leaving the page, and the form fills itself.
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (the same Web client id as the Google
 * provider in Supabase Auth). Without it, the normal Google button is used.
 */
export function GoogleOneTap({ enabled, onSignedIn }: { enabled: boolean; onSignedIn?: () => void }) {
  useEffect(() => {
    if (!CLIENT_ID || !enabled) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    const w = window as Window & { google?: Gis };

    const start = async () => {
      if (cancelled || !w.google) return;
      const nonce = crypto.randomUUID();
      w.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: await sha256Hex(nonce),
        use_fedcm_for_prompt: true,
        cancel_on_tap_outside: false,
        context: "signin",
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: response.credential,
            nonce,
          });
          if (!error) onSignedIn?.();
          else console.error("Google One Tap sign-in failed:", error.message);
        },
      });
      w.google.accounts.id.prompt();
    };

    if (w.google) void start();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => void start();
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      w.google?.accounts.id.cancel();
    };
  }, [enabled, onSignedIn]);

  return null;
}

export const ONE_TAP_ENABLED = Boolean(CLIENT_ID);
