"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * The signed-in customer's avatar.
 *
 * The header and the account page each had their own copy of this, reading
 * user_metadata.picture directly. That is a snapshot baked into a signed JWT
 * at sign-in, so it goes stale in a way nobody can see from the UI: an account
 * that links Google afterwards, or whose metadata is changed by any other
 * route, keeps the old picture in every token it already issued, and the avatar
 * silently disappears until the token rotates or the customer signs out and
 * back in.
 *
 * The lookup now falls back, in order:
 *
 *   1. user_metadata.picture / avatar_url -- what the token carries, and the
 *      normal case for someone who has just signed in with Google;
 *   2. profiles.avatar_url -- read fresh on every request from the same row
 *      the role comes from, so it cannot go stale. This is the fix for the
 *      disappearing avatar: the real account's profile row still had the
 *      picture while its issued token did not;
 *   3. the customer's initials -- better than a generic person icon, because
 *      it distinguishes "signed in with no picture on file" from "not signed
 *      in", which the old icon could not.
 */

interface UserAvatarProps {
  /** Edge length in pixels. */
  size?: number;
  className?: string;
}

export function UserAvatar({ size = 32, className = "" }: UserAvatarProps) {
  const { user, avatarUrl } = useAuth();
  // A picture URL that 404s -- Google removes them when the customer changes
  // their photo, and an issued token can still name the old one.
  const [broken, setBroken] = useState(false);

  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const src =
    (typeof meta.picture === "string" && meta.picture) ||
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    avatarUrl ||
    "";

  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    user.email ||
    "";
  const initials =
    fullName
      .split("@")[0]
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const box = { width: size, height: size };

  if (src && !broken) {
    // The rule reports the JSX element line, so this has to sit immediately
    // above the <img>. A plain <img> is deliberate here: the source is an
    // arbitrary third-party avatar URL, which next/image would need a
    // remotePattern for, and a 32px avatar does not merit the optimisation.
    // eslint-disable-next-line @next/next/no-img-element
    return <img
      src={src}
      alt={fullName || "User"}
      onError={() => setBroken(true)}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={box}
    />;
  }

  return (
    <span
      className={`rounded-full bg-primary-container text-on-primary flex items-center justify-center font-display font-bold shrink-0 ${className}`}
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      title={fullName || undefined}
    >
      {initials}
    </span>
  );
}
