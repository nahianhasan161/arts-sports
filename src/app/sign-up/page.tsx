"use client";

import { useState, FormEvent, useEffect } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useRouter } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";

type SignUpForm = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function SignUpPage() {
  const router = useRouter();
  const { t } = useT();
  const [form, setForm] = useState<SignUpForm>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setReturnTo(getSafeRedirectPath(searchParams.get("next") || null));
    setOrigin(window.location.origin);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError(t("auth.signUp.errMismatch"));
      setLoading(false);
      return;
    }

    if (form.password.length < 8) {
      setError(t("auth.signUp.errShort"));
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setError(t("auth.signIn.errUnavailable"));
      setLoading(false);
      return;
    }

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.name,
          },
          emailRedirectTo: `${origin || ''}/api/auth/callback?next=${encodeURIComponent(returnTo || '')}`,
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setError(t("auth.signUp.errExists"));
        } else {
          setError(signUpError.message);
        }
        return;
      }

      router.push("/sign-in?check=email");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.signIn.errUnknown"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.signUp.title")}
      description={t("auth.signUp.description")}
      footerText={t("auth.signUp.haveAccount")}
      footerLinkLabel={t("auth.signUp.signIn")}
      footerLinkHref="/sign-in"
    >
      <div className="mb-space-xl">
        <h2 className="font-display text-2xl font-bold text-primary mb-1">{t("auth.signUp.heading")}</h2>
        <p className="text-xs text-text-muted">{t("auth.signUp.sub")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-space-base">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-up-name">{t("auth.signUp.name")}</Label>
          <div className="relative">
            {/* Was an emoji in a sized span, which renders at a different
                optical size on every platform and sat off the text baseline.
                The same Lucide icon the sign-in form uses, so the two forms
                match. */}
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input
              id="sign-up-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("auth.signUp.namePlaceholder")}
              autoComplete="name"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-up-email">{t("auth.signIn.email")}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
            <Input
              id="sign-up-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="your.email@example.com"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-up-password">{t("auth.signIn.password")}</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
            <Input
              id="sign-up-password"
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("auth.signUp.passwordPlaceholder")}
              autoComplete="new-password"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-up-confirm-password">{t("auth.signUp.confirm")}</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
            <Input
              id="sign-up-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              required
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder={t("auth.signUp.confirmPlaceholder")}
              autoComplete="new-password"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="sp-ico sp-tennis sp-sm absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              {showConfirmPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="sp-btn sp-locker w-full h-11">
          {loading ? t("auth.signUp.submitting") : t("auth.signUp.submit")}
        </Button>

        <Separator className="w-full" />

        <GoogleSignInButton returnTo={returnTo ?? undefined} />
      </form>
    </AuthLayout>
  );
}
