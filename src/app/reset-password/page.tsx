"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { consume } from "@/lib/rate-limit";
import { useT } from "@/i18n/client";

/**
 * Forgot password. Signed out: send the reset link by email. The link goes
 * through /api/auth/callback (which signs the person in) and back here, so a
 * signed-in visitor sees the "new password" form.
 */
export default function ResetPasswordPage() {
  const { t } = useT();
  const { user, loading } = useAuth();

  return (
    <AuthLayout
      title={user ? t("auth.reset.newTitle") : t("auth.reset.sendTitle")}
      description={user ? t("auth.reset.newText") : t("auth.reset.sendText")}
      footerText=""
      footerLinkLabel={t("auth.reset.back")}
      footerLinkHref="/sign-in"
    >
      {loading ? null : user ? <NewPassword /> : <SendLink />}
    </AuthLayout>
  );
}

function SendLink() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError(t("auth.signIn.errUnavailable"));
    if (!consume("signIn").allowed) return setError(t("auth.signIn.errRateLimit"));
    setBusy(true);
    const next = encodeURIComponent("/reset-password");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/api/auth/callback?next=${next}`,
    });
    setBusy(false);
    // The same answer whether or not the address has an account, so the form
    // cannot be used to find out who shops here.
    if (err && err.status === 429) setError(t("auth.signIn.errRateLimit"));
    else setSent(true);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-space-base">
      <h2 className="font-display text-2xl font-bold text-primary">{t("auth.reset.sendTitle")}</h2>
      <p className="text-xs text-text-muted -mt-2">{t("auth.reset.sendText")}</p>
      {sent ? (
        <Alert>
          <AlertDescription>{t("auth.reset.sent", { email: email.trim() })}</AlertDescription>
        </Alert>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-email">{t("auth.signIn.email")}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <Input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your.email@example.com" className="pl-9" />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="sp-btn sp-locker w-full h-11">
            {busy ? t("auth.reset.sending") : t("auth.reset.send")}
          </Button>
        </>
      )}
    </form>
  );
}

function NewPassword() {
  const { t } = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("auth.signUp.errShort"));
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError(t("auth.signIn.errUnavailable"));
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.status === 401 || err.status === 403 ? t("auth.reset.errLink") : err.message);
    setDone(true);
    setTimeout(() => router.push("/account"), 1500);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-space-base">
      <h2 className="font-display text-2xl font-bold text-primary">{t("auth.reset.newTitle")}</h2>
      {done ? (
        <Alert>
          <AlertDescription>
            {t("auth.reset.saved")} <Link href="/account" className="font-semibold underline">→</Link>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-new">{t("auth.reset.newPassword")}</Label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <Input id="reset-new" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.signUp.passwordPlaceholder")} className="pl-9" />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="sp-btn sp-locker w-full h-11">
            {busy ? t("auth.reset.saving") : t("auth.reset.save")}
          </Button>
        </>
      )}
    </form>
  );
}
