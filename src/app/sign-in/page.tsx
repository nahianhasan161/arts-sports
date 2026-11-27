"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { getSupabaseBrowserClient, supabaseConfigProblem } from "@/lib/supabase/client";
import { consume } from "@/lib/rate-limit";
import { useT } from "@/i18n/client";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const { t } = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      // Read once on mount (not during render) so SSR and hydration match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReturnTo(getSafeRedirectPath(searchParams.get("next") || null));
      // /api/auth/callback sends failed Google sign-ins back here with ?error=.
      const callbackError = searchParams.get("error");
      if (callbackError) setError(t("auth.signIn.errGoogle", { reason: callbackError }));
      if (searchParams.get("check") === "email") setNotice(t("auth.signIn.checkEmail"));
    }
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      // "Supabase authentication is not configured" was all the customer ever
      // got, which is wrong in the common case: the single most frequent
      // trigger is a dev server that was started before the credentials were
      // pasted into .env.local, since NEXT_PUBLIC_* is inlined at build time.
      // The config detail helps a developer; a shopper gets the plain sentence.
      if (process.env.NODE_ENV !== "production") console.warn(supabaseConfigProblem());
      setError(t("auth.signIn.errUnavailable"));
      setLoading(false);
      return;
    }

    // Throttled before the request is made. The endpoint limit is the one that
    // holds, but a client-side gate stops the button being spammed while the
    // server is still deciding and gives the shopper an answer immediately.
    const gate = consume("signIn");
    if (!gate.allowed) {
      setError(t("auth.signIn.errRateLimit"));
      setLoading(false);
      return;
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
          setError(t("auth.signIn.errInvalid"));
        } else {
          setError(signInError.message);
        }
        return;
      }

      router.refresh();
      router.push(returnTo || "/account");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.signIn.errUnknown"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.signIn.title")}
      description={t("auth.signIn.description")}
      footerText={t("auth.signIn.noAccount")}
      footerLinkLabel={t("auth.signIn.create")}
      footerLinkHref="/sign-up"
    >
      <div className="mb-space-xl">
        <h2 className="font-display text-2xl font-bold text-primary mb-1">{t("auth.signIn.heading")}</h2>
        <p className="text-xs text-text-muted">{t("auth.signIn.sub")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-space-base">
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-in-email">{t("auth.signIn.email")}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input
              id="sign-in-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
              placeholder="your.email@example.com"
              /* The icon is absolutely positioned at left-3 and is 16px wide,
                 so it ends at 28px. Input's own px-2.5 starts the text at
                 10px, which drew the icon on top of the text. pl-9 clears it,
                 and cn merges it over the hardcoded px-2.5. */
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-in-password">{t("auth.signIn.password")}</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input
              id="sign-in-password"
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("auth.signIn.passwordPlaceholder")}
              autoComplete="current-password"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={t("auth.signIn.password")}
              aria-pressed={showPassword}
              className="sp-ico sp-tennis sp-sm absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="text-right -mt-1">
          <Link href="/reset-password" className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
            {t("auth.signIn.forgot")}
          </Link>
        </div>

        <Button type="submit" disabled={loading} className="sp-btn sp-locker w-full h-11">
          {loading ? t("auth.signIn.submitting") : t("auth.signIn.submit")}
        </Button>

        <Separator className="w-full" />

        <GoogleSignInButton returnTo={returnTo ?? undefined} />
      </form>
    </AuthLayout>
  );
}
