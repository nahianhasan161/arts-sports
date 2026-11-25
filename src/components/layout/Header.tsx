"use client";

import React, { useState, useEffect } from "react";
import { HoverLink as Link } from "@/components/ui/HoverLink";
import { useRouter } from "next/navigation";
import {
  Smartphone,
  Phone,
  Heart,
  ShoppingBag,
  User,
  Menu,
  X,
  Home,
  LayoutGrid,
  MessageCircle,
  Shield,
} from "lucide-react";
import { useCartStore } from "@/lib/store/cart-store";
import { useWishlistStore } from "@/lib/store/wishlist-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { LanguageToggle, ThemeToggle } from "@/components/layout/Preferences";
import { AnimatedLogo } from "@/components/layout/AnimatedLogo";
import { CategoryBar, NavIcon, useNavLabel, type NavItem } from "@/components/layout/CategoryBar";
import { RacketSearchIcon } from "@/components/ui/RacketSearchIcon";

const DEFAULT_NAV: NavItem[] = [
  { kind: "all", name: "Shop All", key: "site.nav.shopAll", href: "/shop" },
  { kind: "custom", name: "Custom Jersey", key: "site.nav.customJersey", href: "/custom-jersey" },
  { kind: "category", name: "Men", key: "site.nav.men", href: "/shop?category=men" },
  { kind: "category", name: "Women", key: "site.nav.women", href: "/shop?category=women" },
  { kind: "category", name: "Kids", key: "site.nav.kids", href: "/shop?category=kids" },
  { kind: "category", name: "Sports", key: "site.nav.sports", href: "/shop?category=sports" },
  { kind: "collection", name: "New Arrivals", key: "site.nav.newArrivals", href: "/shop?sort=newest" },
  { kind: "collection", name: "Top Selling", key: "site.nav.topSelling", href: "/shop?sort=popular" },
  { kind: "deal", name: "Mega Deals", key: "site.nav.megaDeals", href: "/shop?deals=true" },
];

/** A row of /api/catalog/nav. */
type NavRow = Pick<NavItem, "name" | "name_bn" | "slug" | "href">;
const navItem = (kind: NavItem["kind"], { name, name_bn, slug, href }: NavRow): NavItem => ({ kind, name, name_bn, slug, href });

export function Header() {
  const router = useRouter();
  const { t, locale } = useT();
  const navLabel = useNavLabel();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** Desktop account dropdown. The mobile bar uses its own route links. */
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // `openCart` for the mobile bottom bar, which must always open; `toggleCart`
  // for the desktop header button, where a second click closing the drawer is
  // what a shopper expects.
  const { toggleCart, openCart, getTotalCount, getSubtotal } = useCartStore();
  const { getCount: getWishlistCount, toggleWishlistDrawer } = useWishlistStore();
  const { user, isAdmin, signOut } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (userMenuOpen && !target.closest('[data-user-menu]')) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [userMenuOpen]);

  const totalCartCount = mounted ? getTotalCount() : 0;
  const subtotal = mounted ? getSubtotal() : 0;
  const wishlistCount = mounted ? getWishlistCount() : 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Menu: Shop All, then the sports the admin created, then collections
  // marked "show in menu", then deals. Starts as the static list so the bar
  // is never empty while /api/catalog/nav loads or if it fails.
  const [navCategories, setNavCategories] = useState<NavItem[]>(DEFAULT_NAV);
  useEffect(() => {
    let alive = true;
    fetch("/api/catalog/nav")
      .then((r) => (r.ok ? r.json() : null))
      .then((nav: { sports: NavRow[]; collections: NavRow[] } | null) => {
        if (!alive || !nav || (nav.sports.length === 0 && nav.collections.length === 0)) return;
        setNavCategories([
          { kind: "all", name: "Shop All", key: "site.nav.shopAll", href: "/shop" },
          { kind: "custom", name: "Custom Jersey", key: "site.nav.customJersey", href: "/custom-jersey" },
          ...nav.sports.map((row) => navItem("category", row)),
          ...nav.collections.map((row) => navItem("collection", row)),
          { kind: "deal", name: "Mega Deals", key: "site.nav.megaDeals", href: "/shop?deals=true" },
        ]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <header className="fixed top-0 w-full z-40 bg-surface-card shadow-sm">
      {/* 1. Utility Top Bar */}
      <div className="site-top bg-primary-container text-on-primary">
        <div className="max-w-container-max mx-auto px-space-base h-10 flex items-center justify-between text-[13px] font-body">
          <div className="flex items-center gap-space-md">
            {/* The utility bar was a row of links that went nowhere: "GET 5%
                OFF ON APP" pointed at # with no app to download, "Corporate
                Sales" and "About Us" pointed at # with no such page, and
                "Track Order" pointed at /track-order, which does not exist —
                every one of them 404ed or did nothing when clicked.
                Only links that resolve are advertised now; the rest is
                support contact, which does. */}
            <a
              href="tel:+8801911904618"
              className="inline-flex items-center gap-1.5 font-bold text-secondary-container hover:text-white transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{t("site.header.callNow")}</span>
            </a>
            <span className="hidden sm:inline-block h-3 w-px bg-on-primary-container/40"></span>
            <div className="hidden md:flex items-center gap-space-md text-on-primary-container">
              <Link href="/shop" className="hover:text-white transition-colors">
                {t("site.header.allProducts")}
              </Link>
              <Link href="/account" className="hover:text-white transition-colors">
                {t("site.header.trackOrder")}
              </Link>
              <Link href="/returns" className="hover:text-white transition-colors">
                {t("site.header.returns")}
              </Link>
              <a href="mailto:corporate@artssports.com" className="hover:text-white transition-colors">
                {t("site.header.corporate")}
              </a>
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            <a
              href="tel:+8801911904618"
              className="hidden sm:inline-flex items-center gap-1 text-on-primary hover:text-secondary-container transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>+8801911904618</span>
            </a>
            <span className="hidden sm:inline-block h-3 w-px bg-on-primary-container/40"></span>
            <LanguageToggle tone="dark" />
            <ThemeToggle tone="dark" />
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="site-bar max-w-container-max mx-auto px-3 min-[360px]:px-space-base h-20 flex items-center justify-between gap-2 sm:gap-space-lg">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 min-[360px]:gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sp-ico sp-tactics lg:hidden"
            aria-label={t("site.header.menu")}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <Link href="/" className="flex items-center flex-shrink-0">
            <AnimatedLogo className="h-6 min-[360px]:h-7 sm:h-8 md:h-9 w-auto text-[#0a0a0a] dark:text-white" />
          </Link>
        </div>

        {/* Global Search Bar */}
        <div className="hidden md:flex flex-1 max-w-xl">
          <form onSubmit={handleSearch} className="sp-search relative flex items-center w-full">
            <RacketSearchIcon className="sp-search-racket w-8 h-8" />
            <span className="sp-knob sp-search-ball w-5 h-5" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("site.header.searchPlaceholder")}
              aria-label={t("site.header.search")}
              className="w-full h-11 pl-12 pr-32 bg-transparent text-sm font-body focus:outline-none"
            />
            <button
              type="submit"
              className="sp-btn sp-goal absolute right-2 h-8 text-xs font-bold"
            >
              {t("site.header.search")}
            </button>
          </form>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 min-[360px]:gap-space-sm sm:gap-space-base flex-shrink-0">
          {/* User Account Avatar - First (profile icon) */}
          {!user ? (
            <Link
              href="/sign-in"
              className="sp-ico sp-tennis sp-lg"
              aria-label={t("site.header.signIn")}
            >
              <User className="w-6 h-6" />
            </Link>
           ) : (
            <div className="relative" data-user-menu="true">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="sp-btn sp-locker max-xl:!px-1 h-11 flex items-center gap-2"
                aria-label="Account menu"
              >
                {/* Resolved by UserAvatar, which falls back past a stale token
                    to profiles.avatar_url and then to the customer's
                    initials. This was an inline img reading
                    user_metadata.picture only, so the avatar vanished whenever
                    the issued JWT did not carry it. */}
                <UserAvatar size={32} />
                <span className="hidden xl:block text-sm font-medium truncate max-w-[140px]">
                  {user?.user_metadata?.full_name ||
                    user?.user_metadata?.name ||
                    user?.email?.split("@")[0] ||
                    "Account"}
                </span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-card rounded-md shadow-lg py-1 z-50 border border-border-light">
                  <Link
                    href="/account"
                    className="sp-nav block px-4 py-2 text-sm text-on-surface hover:bg-surface-subtle transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t("site.header.myAccount")}
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="sp-nav block px-4 py-2 text-sm text-on-surface hover:bg-surface-subtle transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-accent-gold" />
                        {t("site.header.adminPanel")}
                      </span>
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      signOut();
                      setUserMenuOpen(false);
                    }}
                    className="sp-nav block w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-subtle transition-colors"
                  >
                    {t("site.header.signOut")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Wishlist - Second */}
          <button
            onClick={toggleWishlistDrawer}
            aria-label={t("site.header.wishlist")}
            className="sp-ico sp-medal sp-lg relative"
          >
            <Heart className="w-6 h-6" />
            {wishlistCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-badge-discount text-white font-bold text-[10px] rounded-full flex items-center justify-center">
                {wishlistCount}
              </span>
            )}
          </button>

          {/* Cart Trigger - Third */}
          <button
            onClick={toggleCart}
            aria-label={t("site.header.total")}
            className="sp-btn sp-board text-sm flex items-center gap-2 h-11 cursor-pointer"
          >
            <div className="relative flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-gold text-white font-bold text-[10px] rounded-full flex items-center justify-center">
                {totalCartCount}
              </span>
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-[10px] opacity-85 uppercase font-bold tracking-wider">
                {t("site.header.total")}
              </span>
              <span className="text-sm font-bold tabular-nums">{formatMoney(subtotal, locale)}</span>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Category Navigation Bar */}
      <CategoryBar items={navCategories} />

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border-light bg-surface-card px-space-base py-space-sm shadow-lg max-h-[calc(100dvh-190px-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain">
          <form onSubmit={handleSearch} className="sp-search relative flex items-center w-full mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("site.header.searchShort")}
              className="w-full h-11 pl-4 pr-14 bg-transparent text-sm focus:outline-none"
            />
            <button type="submit" className="sp-search-btn absolute right-2 w-10 h-10 flex items-center justify-center" aria-label={t("site.header.search")}>
              <RacketSearchIcon className="w-8 h-8" />
            </button>
          </form>
          <div className="grid grid-cols-2 gap-2">
            {navCategories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                onClick={() => setMobileMenuOpen(false)}
                className={
                  cat.kind === "custom"
                    ? "sp-btn sp-jersey col-span-2 order-first h-11 text-sm font-bold inline-flex items-center justify-center gap-1.5"
                    : "min-w-0 h-11 px-3 flex items-center gap-2 text-sm text-on-surface bg-surface-subtle hover:bg-surface-container rounded-md font-semibold"
                }
              >
                <NavIcon
                  item={cat}
                  className={`w-4 h-4 shrink-0 ${cat.kind === "custom" ? "" : cat.kind === "deal" ? "text-badge-discount" : "text-primary"}`}
                />
                <span className="truncate">{navLabel(cat)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar.
          Two defects made the previous version useless:
          1. the whole bar was wrapped in `{mobileMenuOpen && ...}`, so it only
             appeared while the hamburger drawer was open — the opposite of an
             always-available bottom bar;
          2. every Home / Categories / Chat / Cart button ran only
             setMobileMenuOpen(false), so they closed the drawer and navigated
             nowhere. They were decoration.
          Now it is always present, closes the drawer first if it is open, and
          actually navigates. */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)] bg-surface-card border-t border-border-light z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      >
        <div className="flex items-center justify-around h-16 px-space-sm">
          {/* Home */}
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="sp-tab flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label={t("site.header.home")}
          >
            <Home className="w-5 h-5 mb-0.5" />
            {t("site.header.home")}
          </Link>

          {/* Categories — opens the drawer, which is where the tree lives */}
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="sp-tab flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label={t("site.header.categories")}
            aria-expanded={mobileMenuOpen}
          >
            <LayoutGrid className="w-5 h-5 mb-0.5" />
            {t("site.header.categories")}
          </button>

          {/* Chat — the only support channel that actually answers */}
          <a
            href="tel:+8801911904618"
            onClick={() => setMobileMenuOpen(false)}
            className="sp-tab flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label={t("site.header.support")}
          >
            <MessageCircle className="w-5 h-5 mb-0.5" />
            {t("site.header.support")}
          </a>

          {/* Cart — a real count, and it opens the drawer */}
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              openCart();
            }}
            className="relative sp-tab flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label={`${t("site.header.cart")} (${totalCartCount})`}
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            {t("site.header.cart")}
            {totalCartCount > 0 && (
              <span className="absolute top-0 right-1/4 min-w-[16px] h-4 px-1 rounded-full bg-badge-discount text-white text-[10px] font-bold flex items-center justify-center">
                {totalCartCount}
              </span>
            )}
          </button>

          {/* Account */}
          {!user ? (
            <Link
              href="/sign-in"
              onClick={() => setMobileMenuOpen(false)}
              className="sp-tab flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
              aria-label={t("site.header.signIn")}
            >
              <User className="w-5 h-5 mb-0.5" />
              {t("site.header.signIn")}
            </Link>
          ) : (
            <Link
              href={isAdmin ? "/admin" : "/account"}
              onClick={() => setMobileMenuOpen(false)}
              className="sp-tab flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
              aria-label={isAdmin ? t("site.header.adminPanel") : t("site.header.myAccount")}
            >
              <User className="w-5 h-5 mb-0.5" />
              {isAdmin ? t("site.header.admin") : t("site.header.account")}
            </Link>
          )}
        </div>
      </nav>
      <div className="as-touchline" aria-hidden />
    </header>
  );
}
