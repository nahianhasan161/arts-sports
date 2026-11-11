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

export default function SignInPage() {
  const router = useRouter();
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
      if (callbackError) setError(`Google sign-in failed: ${callbackError}`);
    }
  }, []);

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
      setError(
        supabaseConfigProblem() ??
          "Sign-in is unavailable in this session. If the credentials are set in .env.local, restart the dev server so it picks them up."
      );
      setLoading(false);
      return;
    }

    // Throttled before the request is made. The endpoint limit is the one that
    // holds, but a client-side gate stops the button being spammed while the
    // server is still deciding and gives the shopper an answer immediately.
    const gate = consume("signIn");
    if (!gate.allowed) {
      setError(`Too many sign-in attempts. Try again in ${gate.retryAfter}s.`);
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
          setError("Invalid email or password.");
        } else {
          setError(signInError.message);
        }
        return;
      }

      router.refresh();
      router.push(returnTo || "/account");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      description="Sign in to your account to continue shopping and manage your orders."
      footerText="Don't have an account yet?"
      footerLinkLabel="Create Account"
      footerLinkHref="/sign-up"
    >
      <div className="mb-space-xl">
        <h2 className="font-display text-2xl uppercase tracking-wider font-bold text-primary mb-1">
          Sign In
        </h2>
          <p className="text-xs text-text-muted">Access your Arts Sports account</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-space-base">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-in-email">Email Address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input
              id="sign-in-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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
          <Label htmlFor="sign-in-password">Password</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input
              id="sign-in-password"
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter your password"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-primary transition-colors"
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
          <a
            href="#"
            className="text-xs text-secondary hover:text-primary transition-colors"
          >
            Forgot password?
          </a>
        </div>

        <Button type="submit" disabled={loading} className="w-full h-11">
          {loading ? "Signing In..." : "Sign In"}
        </Button>

        <Separator className="w-full" />

        <GoogleSignInButton returnTo={returnTo ?? undefined} />
      </form>
    </AuthLayout>
  );
}
