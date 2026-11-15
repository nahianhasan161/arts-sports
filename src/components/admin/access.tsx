"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NAV, OFFLINE, OFFLINE_NAV, ONLINE, findItem, type NavGroup, type NavItem } from "./nav";

/** What the signed-in person may open. Filled by app/admin/layout.tsx. */
export interface AdminAccess {
  /** Online menu groups, already cut down to what this person may open. */
  onlineGroups: NavGroup[];
  onlineItems: NavItem[];
  offlineItems: NavItem[];
  /** True when the person has real work in that app (Help alone does not count). */
  hasOnline: boolean;
  hasOffline: boolean;
  isStaff: boolean;
  userName: string;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AdminAccess | null>(null);
export const AdminAccessProvider = Ctx.Provider;

export function useAdminAccess(): AdminAccess {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAdminAccess must be used under app/admin/layout.tsx");
  return value;
}

export function buildAccess(canSee: (i: NavItem) => boolean): Pick<AdminAccess, "onlineGroups" | "onlineItems" | "offlineItems" | "hasOnline" | "hasOffline"> {
  const onlineGroups = NAV.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);
  const onlineItems = onlineGroups.flatMap((g) => g.items);
  const offlineItems = OFFLINE_NAV.filter(canSee);
  return { onlineGroups, onlineItems, offlineItems, hasOnline: onlineItems.some((i) => !i.open), hasOffline: offlineItems.some((i) => !i.open) };
}

/**
 * The menu item for the page being shown. A staff account on a page it may
 * not use is sent to its first page in this app, or to the other app.
 * `redirecting` is true while that happens, so the page is not drawn.
 */
export function useCurrentItem(app: "online" | "offline", pathname: string): { item: NavItem | undefined; redirecting: boolean } {
  const router = useRouter();
  const access = useAdminAccess();
  const items = app === "online" ? access.onlineItems : access.offlineItems;
  const item = findItem(items, pathname);
  let target: string | undefined;
  if (!item && access.isStaff) {
    const usable = items.find((i) => !i.open);
    target = usable?.href ?? (app === "online" ? (access.hasOffline ? OFFLINE : undefined) : access.hasOnline ? ONLINE : undefined);
  }
  useEffect(() => {
    if (!target) return;
    const timer = setTimeout(() => router.replace(target), 0);
    return () => clearTimeout(timer);
  }, [target, router]);
  return { item, redirecting: Boolean(target) };
}
