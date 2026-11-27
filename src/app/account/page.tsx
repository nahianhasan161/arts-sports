"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ArrowRight, User, Mail, Edit, Save, Shield } from "lucide-react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { MyOrders } from "@/components/account/MyOrders";
import { MyCustomOrders } from "@/components/account/MyCustomOrders";
import { DeliveryDetails } from "@/components/account/DeliveryDetails";

const AccountPage = () => {
  const { user, isAdmin, signOut } = useAuth();

  const [profile, setProfile] = useState({
    full_name: user?.user_metadata?.full_name || "",
    phone: "",
    address: "",
    city: "",
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(true);

  useEffect(() => {
    const checkEmailVerification = async () => {
      if (!user?.email) return;
      setCheckingEmail(true);
      try {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.email_confirmed_at) {
            setEmailVerified(true);
          } else {
            setEmailVerified(false);
          }
        }
      } catch (err) {
        console.error('Error checking email verification:', err);
        setEmailVerified(false);
      } finally {
        setCheckingEmail(false);
      }
    };

    checkEmailVerification();
  }, [user?.email]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to update profile");
        return;
      }

      setEditing(false);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-container-max mx-auto px-space-base py-space-xl">
      <div className="flex flex-col lg:flex-row gap-space-xl">
        <div className="lg:w-1/3">
          <div className="bg-surface-card border border-border-light rounded-xl p-space-lg shadow-sm">
             <div className="flex flex-col items-center text-center">
                {/* Same component the header uses, so the two avatars can never
                    disagree again -- they were two copies of the same
                    token-only lookup, and both went blank at once. */}
                <UserAvatar size={80} className="mb-space-base" />

              <h1 className="font-display text-xl uppercase tracking-wider font-bold text-primary mb-1">
                {user?.user_metadata?.full_name ||
                  user?.user_metadata?.name ||
                  user?.email || "Guest"}
              </h1>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-accent-gold/10 text-gold-ink rounded-full text-xs font-medium">
                  <Shield className="w-3 h-3" />
                  Admin
                </span>
              )}

              {emailVerified && user?.email && !checkingEmail && (
                <div className="w-full bg-green-50 border border-green-200 rounded-lg p-2 mb-space-lg">
                  <p className="text-green-700 text-xs font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    Email Verified
                  </p>
                </div>
              )}

              {checkingEmail && user?.email && (
                <div className="w-full bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-space-lg">
                  <p className="text-yellow-700 text-xs font-medium">Checking verification status...</p>
                </div>
              )}

              {!user?.email && (
                <div className="w-full bg-blue-50 border border-blue-200 rounded-lg p-2 mb-space-lg">
                  <p className="text-blue-700 text-xs font-medium mb-2">Email not yet verified</p>
                  <Link
                    href="/sign-in"
                    className="sp-btn sp-whistle inline-flex items-center gap-1 py-1.5 text-xs font-semibold"
                  >
                    Verify Email
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              <button
                onClick={signOut}
                className="sp-btn sp-red w-full h-10 text-xs font-semibold uppercase tracking-wider"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="lg:w-2/3 flex flex-col gap-space-lg">
          <div className="bg-surface-card border border-border-light rounded-xl p-space-lg shadow-sm">
            <div className="flex items-center justify-between mb-space-lg pb-space-base border-b border-border-light">
              <h2 className="font-display text-lg uppercase tracking-wider font-bold text-primary">
                Profile Information
              </h2>

              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="sp-btn sp-racket inline-flex items-center gap-1.5 py-1.5 text-xs font-semibold"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="sp-btn sp-red py-1.5 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="sp-btn sp-goal inline-flex items-center gap-1.5 py-1.5 text-xs font-semibold uppercase tracking-wider"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-badge-discount/10 border border-badge-discount/30 rounded-lg p-space-base mb-space-lg">
                <p className="text-xs font-medium text-badge-discount">{error}</p>
              </div>
            )}

            <div className="space-y-space-base">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-base">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Full Name</label>
                  {editing ? (
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="text"
                        value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        className="w-full h-10 pl-9 pr-3 border border-border-light rounded-lg text-xs font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface py-2.5 px-3 bg-surface-subtle rounded-lg">
                      {profile.full_name || "Not set"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Email</label>
                  <p className="text-sm text-on-surface py-2.5 px-3 bg-surface-subtle rounded-lg flex items-center gap-2">
                    <Mail className="w-4 h-4 text-text-muted" />
                    {user?.email}
                  </p>
                </div>
              </div>

            </div>
          </div>

          <DeliveryDetails />

          <div className="bg-surface-card border border-border-light rounded-xl p-space-lg shadow-sm">
            <h2 className="font-display text-lg uppercase tracking-wider font-bold text-primary mb-space-lg">
              Account Preferences
            </h2>

            <div className="space-y-space-base">
              <div className="flex items-center justify-between py-3 border-b border-border-light last:border-b-0">
                <div>
                  <p className="text-sm font-semibold text-on-surface">Email Notifications</p>
                  <p className="text-xs text-text-muted">Receive order updates via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="sp-switch sp-knob-after w-11 h-6 bg-surface-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-border-light last:border-b-0">
                <div>
                  <p className="text-sm font-semibold text-on-surface">SMS Notifications</p>
                  <p className="text-xs text-text-muted">Receive delivery updates via SMS</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="sp-switch sp-knob-after w-11 h-6 bg-surface-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
            </div>
          </div>
        </div>
        <MyOrders />
        <MyCustomOrders />
      </div>
    </div>
  );
};

export default AccountPage;