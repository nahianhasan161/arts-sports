"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { UserRole } from "@/types";

type AuthContextValue = {
  user: User | null;
  role: UserRole | null;
  /**
   * The signed-in customer's picture, read from their profile row rather than
   * from the session token.
   *
   * The header used to read user_metadata.picture only, and that is a snapshot
   * baked into a signed JWT at sign-in. It goes stale in a way the user cannot
   * see: an account that links Google later, or whose metadata is updated by
   * any other route, keeps the old picture in every token it already issued,
   * so the avatar silently disappears until the token rotates or the customer
   * signs out and back in. profiles.avatar_url is read fresh on every request
   * and cannot go stale, so it is used as the fallback.
   */
  avatarUrl: string | null;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured;

  /**
   * The profile row, which carries the role and the picture.
   *
   * One query rather than two: the role and the avatar are on the same row,
   * and a second round trip would only make them disagree with each other.
   */
  const loadProfile = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, avatar_url")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setRole(data.role as UserRole);
        setAvatarUrl(typeof data.avatar_url === "string" ? data.avatar_url : null);
      } else {
        setRole("user");
        setAvatarUrl(null);
      }
    } catch {
      setRole("user");
      setAvatarUrl(null);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        const sessionUser = data.session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          loadProfile(sessionUser.id);
        }
      }
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      if (newUser) {
        loadProfile(newUser.id);
      } else {
        setRole(null);
        setAvatarUrl(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setRole(null);
    setAvatarUrl(null);
    router.refresh();
    router.push("/");
  }, [router]);

  const isAdmin = role === "admin" || role === "super_admin";

  const value = useMemo(
    () => ({ user, role, avatarUrl, isAdmin, loading, configured, signOut }),
    [user, role, avatarUrl, isAdmin, loading, configured, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
