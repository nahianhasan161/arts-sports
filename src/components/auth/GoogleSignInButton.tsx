"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";

type GoogleSignInButtonProps = {
  returnTo?: string;
  onPending?: (pending: boolean) => void;
};

export function GoogleSignInButton({
  returnTo = "/account",
  onPending,
}: GoogleSignInButtonProps) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleGoogleSignIn = async () => {
    const supabase = getSupabaseBrowserClient();
    setError(null);

    if (!supabase) {
      setError(t("buy.checkout.googleBad"));
      return;
    }

    setPending(true);
    onPending?.(true);

    try {
      const origin = window.location.origin;
      const callbackUrl = `${origin}/api/auth/callback?next=${encodeURIComponent(returnTo)}`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (oauthError) throw oauthError;
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError(t("buy.checkout.googleBad"));
    } finally {
      setPending(false);
      onPending?.(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={pending}
        variant="outline"
        className="sp-btn sp-football w-full h-11"
      >
        {pending ? t("buy.checkout.googleWait") : t("buy.checkout.google")}
      </Button>
      {error && (
        <p className="text-xs leading-5 text-badge-discount mt-2" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
