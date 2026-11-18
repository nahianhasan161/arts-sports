import {
  LayoutDashboard, Package, ShoppingCart, Tag, Users, Palette, Ruler, Percent, Ticket, Shield, Images,
  CreditCard, RotateCcw, AlertCircle, KeyRound, History, PhoneCall, Settings2, Truck, Trophy,
  MessageSquareText, Shirt, Store, Boxes, Contact, LifeBuoy, Building2, ScanBarcode, SlidersHorizontal,
  Receipt, Wallet, PackagePlus, Handshake, Layers, Sticker, Factory,
} from "lucide-react";
import type { AdminMessages } from "@/i18n/messages/admin.en";

/**
 * The admin menus.
 *
 * The panel is two separate apps so the website and the physical shop do not
 * get mixed up:
 *   /admin/online   website orders, products, offers, team   (sidebar, NAV)
 *   /admin/offline  the shop: register, bills, cash drawer   (top menu, OFFLINE_NAV)
 * Products, stock and customers are one set of data, opened from either app.
 * Names and one-line descriptions are in i18n/messages/admin.{en,bn}.ts.
 */
export type Workspace = "online" | "offline";
export type NavId = keyof AdminMessages["nav"];
export type GroupId = keyof AdminMessages["groups"];

export const ONLINE = "/admin/online";
export const OFFLINE = "/admin/offline";
/** The register: full screen, without the shop's top menu. */
export const REGISTER = `${OFFLINE}/pos`;
/** The full-screen supplier-purchase window (same look as the register). */
export const BUY = `${OFFLINE}/purchases`;

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
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { id: "overview", items: [{ id: "dashboard", href: ONLINE, icon: LayoutDashboard }] },
  {
    id: "sales",
    items: [
      { id: "orders", href: `${ONLINE}/orders`, icon: ShoppingCart },
      { id: "payments", href: `${ONLINE}/payments`, icon: CreditCard },
      { id: "courier", href: `${ONLINE}/courier`, icon: Truck, perm: "orders.view" },
      { id: "returns", href: `${ONLINE}/returns`, icon: RotateCcw },
      { id: "cancellations", href: `${ONLINE}/cancellations`, icon: AlertCircle },
      { id: "leads", href: `${ONLINE}/leads`, icon: PhoneCall, perm: "leads.manage" },
    ],
  },
  {
    id: "customJersey",
    items: [
      { id: "customOrders", href: `${ONLINE}/custom-orders`, icon: Shirt, perm: "custom_orders.manage" },
      { id: "customDesigns", href: `${ONLINE}/designs`, icon: Images, perm: "custom_orders.manage" },
      { id: "customSetup", href: `${ONLINE}/custom-jersey`, icon: SlidersHorizontal, perm: "custom_orders.manage" },
      { id: "fabricStock", href: `${ONLINE}/fabric-stock`, icon: Layers, perm: "inventory.manage" },
      { id: "accessoryStock", href: `${ONLINE}/accessory-stock`, icon: Sticker, perm: "inventory.manage" },
      { id: "production", href: `${ONLINE}/production`, icon: Factory, perm: "inventory.manage" },
    ],
  },
  {
    id: "catalogue",
    items: [
      { id: "products", href: `${ONLINE}/products`, icon: Package },
      { id: "categories", href: `${ONLINE}/categories`, icon: Tag },
      { id: "catalog", href: `${ONLINE}/catalog`, icon: Trophy, perm: "products.manage" },
      { id: "media", href: `${ONLINE}/media`, icon: Images },
      { id: "colors", href: `${ONLINE}/colors`, icon: Palette },
      { id: "sizes", href: `${ONLINE}/sizes`, icon: Ruler },
      { id: "reviews", href: `${ONLINE}/reviews`, icon: MessageSquareText, perm: "products.manage" },
    ],
  },
  {
    id: "marketing",
    items: [
      { id: "promotions", href: `${ONLINE}/promotions`, icon: Percent },
      { id: "coupons", href: `${ONLINE}/coupons`, icon: Ticket },
    ],
  },
  {
    id: "shared",
    items: [
      { id: "inventory", href: `${ONLINE}/inventory`, icon: Boxes, perm: "inventory.manage" },
      { id: "purchases", href: BUY, icon: PackagePlus, perm: "inventory.manage" },
      { id: "suppliers", href: `${ONLINE}/suppliers`, icon: Handshake, perm: "inventory.manage" },
      { id: "customers", href: `${ONLINE}/customers`, icon: Contact, perm: "customers.view" },
    ],
  },
  {
    id: "team",
    items: [
      { id: "roles", href: `${ONLINE}/roles`, icon: KeyRound, perm: "staff.manage" },
      { id: "users", href: `${ONLINE}/users`, icon: Users },
      { id: "userGroups", href: `${ONLINE}/user-groups`, icon: Shield },
      { id: "audit", href: `${ONLINE}/audit-log`, icon: History, perm: "audit.view" },
      { id: "settings", href: `${ONLINE}/settings`, icon: Settings2, perm: "settings.manage" },
      { id: "help", href: `${ONLINE}/help`, icon: LifeBuoy, open: true },
    ],
  },
];

/** The shop's top menu, in the order a day at the counter goes. */
export const OFFLINE_NAV: NavItem[] = [
  { id: "storeHome", href: OFFLINE, icon: Store, perm: "pos.use" },
  { id: "pos", href: REGISTER, icon: ScanBarcode, perm: "pos.use" },
  { id: "shopOrders", href: `${OFFLINE}/orders`, icon: Receipt, perm: "pos.use" },
  { id: "shopCustom", href: `${OFFLINE}/custom-jersey`, icon: Shirt, perm: "pos.use" },
  { id: "customDesigns", href: `${OFFLINE}/designs`, icon: Images, perm: "custom_orders.manage" },
  { id: "cash", href: `${OFFLINE}/cash`, icon: Wallet, perm: "pos.use" },
  { id: "products", href: `${OFFLINE}/products`, icon: Package },
  { id: "inventory", href: `${OFFLINE}/inventory`, icon: Boxes, perm: "inventory.manage" },
  { id: "suppliers", href: `${OFFLINE}/suppliers`, icon: Handshake, perm: "inventory.manage" },
  { id: "fabricStock", href: `${OFFLINE}/fabric-stock`, icon: Layers, perm: "inventory.manage" },
  { id: "accessoryStock", href: `${OFFLINE}/accessory-stock`, icon: Sticker, perm: "inventory.manage" },
  { id: "production", href: `${OFFLINE}/production`, icon: Factory, perm: "inventory.manage" },
  { id: "customers", href: `${OFFLINE}/customers`, icon: Contact, perm: "customers.view" },
  { id: "branches", href: `${OFFLINE}/branches`, icon: Building2, perm: "settings.manage" },
  { id: "receiptSettings", href: `${OFFLINE}/receipt-settings`, icon: Receipt, perm: "settings.manage" },
  { id: "shopHelp", href: `${OFFLINE}/help`, icon: LifeBuoy, open: true },
  { id: "purchases", href: BUY, icon: PackagePlus, perm: "inventory.manage" },
];

/** Shop top bar: these items sit inside a dropdown instead of the bar itself. */
export const OFFLINE_MENU_GROUP: Partial<Record<NavId, GroupId>> = {
  shopCustom: "customJersey",
  customDesigns: "customJersey",
  products: "stock",
  inventory: "stock",
  suppliers: "stock",
  customers: "more",
  branches: "more",
  receiptSettings: "more",
  shopHelp: "more",
};

/** The menu item a path belongs to: an exact match first, then the longest parent. */
export function findItem(items: NavItem[], pathname: string): NavItem | undefined {
  return (
    items.find((i) => i.href === pathname) ??
    items
      .filter((i) => i.href !== ONLINE && i.href !== OFFLINE && pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]
  );
}
