import {
  LayoutDashboard, Package, ShoppingCart, Tag, Users, Palette, Ruler, Percent, Ticket, Shield, Images,
  CreditCard, RotateCcw, AlertCircle, KeyRound, History, PhoneCall, Settings2, Truck, Trophy,
  MessageSquareText, Shirt, Store, Boxes, Contact, LifeBuoy, Building2, ScanBarcode, SlidersHorizontal,
} from "lucide-react";
import type { AdminMessages } from "@/i18n/messages/admin.en";

/**
 * The admin menu.
 *
 * The panel has two workspaces so the website and the physical shop do not
 * get mixed up:
 *   online — website orders, products, offers
 *   store  — the shop counter (POS) and its branches
 * Stock and customers belong to both and are listed in each one.
 * Names and one-line descriptions are in i18n/messages/admin.{en,bn}.ts.
 */
export type Workspace = "online" | "store";
export type NavId = keyof AdminMessages["nav"];
export type GroupId = keyof AdminMessages["groups"];

export interface NavItem {
  id: NavId;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission a staff account needs. Without one, only admins see the page. */
  perm?: string;
  /** Every staff account may open it. */
  open?: boolean;
}

export interface NavGroup {
  id: GroupId;
  /** Which workspace shows the group; "both" appears in each. */
  workspace: Workspace | "both";
  items: NavItem[];
}

const inventory: NavItem = { id: "inventory", href: "/admin/inventory", icon: Boxes, perm: "inventory.manage" };
const customers: NavItem = { id: "customers", href: "/admin/customers", icon: Contact, perm: "customers.view" };
const products: NavItem = { id: "products", href: "/admin/products", icon: Package };

export const NAV: NavGroup[] = [
  { id: "overview", workspace: "online", items: [{ id: "dashboard", href: "/admin", icon: LayoutDashboard }] },
  {
    id: "sales",
    workspace: "online",
    items: [
      { id: "orders", href: "/admin/orders", icon: ShoppingCart },
      { id: "payments", href: "/admin/payments", icon: CreditCard },
      { id: "courier", href: "/admin/courier", icon: Truck, perm: "orders.view" },
      { id: "returns", href: "/admin/returns", icon: RotateCcw },
      { id: "cancellations", href: "/admin/cancellations", icon: AlertCircle },
      { id: "leads", href: "/admin/leads", icon: PhoneCall, perm: "leads.manage" },
    ],
  },
  {
    id: "customJersey",
    workspace: "online",
    items: [
      { id: "customOrders", href: "/admin/custom-orders", icon: Shirt, perm: "custom_orders.manage" },
      { id: "customSetup", href: "/admin/custom-jersey", icon: SlidersHorizontal, perm: "custom_orders.manage" },
    ],
  },
  {
    id: "catalogue",
    workspace: "online",
    items: [
      products,
      { id: "categories", href: "/admin/categories", icon: Tag },
      { id: "catalog", href: "/admin/catalog", icon: Trophy, perm: "products.manage" },
      { id: "media", href: "/admin/media", icon: Images },
      { id: "colors", href: "/admin/colors", icon: Palette },
      { id: "sizes", href: "/admin/sizes", icon: Ruler },
      { id: "reviews", href: "/admin/reviews", icon: MessageSquareText, perm: "products.manage" },
    ],
  },
  {
    id: "marketing",
    workspace: "online",
    items: [
      { id: "promotions", href: "/admin/promotions", icon: Percent },
      { id: "coupons", href: "/admin/coupons", icon: Ticket },
    ],
  },
  {
    id: "counter",
    workspace: "store",
    items: [
      { id: "storeHome", href: "/admin/store", icon: Store, perm: "pos.use" },
      { id: "pos", href: "/admin/pos", icon: ScanBarcode, perm: "pos.use" },
      { id: "branches", href: "/admin/store/branches", icon: Building2, perm: "settings.manage" },
    ],
  },
  { id: "shared", workspace: "online", items: [inventory, customers] },
  { id: "shared", workspace: "store", items: [products, inventory, customers] },
  {
    id: "team",
    workspace: "both",
    items: [
      { id: "roles", href: "/admin/roles", icon: KeyRound, perm: "staff.manage" },
      { id: "users", href: "/admin/users", icon: Users },
      { id: "userGroups", href: "/admin/user-groups", icon: Shield },
      { id: "audit", href: "/admin/audit-log", icon: History, perm: "audit.view" },
      { id: "settings", href: "/admin/settings", icon: Settings2, perm: "settings.manage" },
      { id: "help", href: "/admin/help", icon: LifeBuoy, open: true },
    ],
  },
];

/** The menu item a path belongs to: an exact match first, then the longest parent. */
export function findItem(items: NavItem[], pathname: string): NavItem | undefined {
  return (
    items.find((i) => i.href === pathname) ??
    items
      .filter((i) => i.href !== "/admin" && pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}

/** The workspace a page can only belong to, or null when it is shared. */
export function workspaceOf(href: string | undefined): Workspace | null {
  if (!href) return null;
  const homes = NAV.filter((g) => g.items.some((i) => i.href === href)).map((g) => g.workspace);
  if (homes.includes("both") || (homes.includes("online") && homes.includes("store"))) return null;
  return homes[0] === "store" ? "store" : homes[0] === "online" ? "online" : null;
}
