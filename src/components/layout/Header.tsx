"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Smartphone,
  Phone,
  Search,
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

export function Header() {
  const router = useRouter();
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

  const navCategories = [
    { name: "Shop All", href: "/shop" },
    { name: "Men", href: "/shop?category=men" },
    { name: "Women", href: "/shop?category=women" },
    { name: "Kids", href: "/shop?category=kids" },
    { name: "Sports", href: "/shop?category=sports" },
    { name: "New Arrivals", href: "/shop?sort=newest" },
    { name: "Top Selling", href: "/shop?sort=popular" },
    { name: "Mega Deals", href: "/shop?deals=true" },
  ];
  return (
    <header className="fixed top-0 w-full z-40 bg-surface-card shadow-sm">
      {/* 1. Utility Top Bar */}
      <div className="bg-primary-container text-on-primary">
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
              href="tel:+8809677666888"
              className="inline-flex items-center gap-1.5 font-bold text-secondary-container hover:text-white transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>CALL NOW</span>
            </a>
            <span className="hidden sm:inline-block h-3 w-px bg-on-primary-container/40"></span>
            <div className="hidden md:flex items-center gap-space-md text-on-primary-container">
              <Link href="/shop" className="hover:text-white transition-colors">
                All Products
              </Link>
              <Link href="/account" className="hover:text-white transition-colors">
                Track Order
              </Link>
              <Link href="/returns" className="hover:text-white transition-colors">
                Returns
              </Link>
              <a href="mailto:corporate@artssports.com" className="hover:text-white transition-colors">
                Corporate Sales
              </a>
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            <a
              href="tel:+8809677666888"
              className="hidden sm:inline-flex items-center gap-1 text-on-primary hover:text-secondary-container transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>+8809677666888</span>
            </a>
            <span className="hidden sm:inline-block h-3 w-px bg-on-primary-container/40"></span>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="max-w-container-max mx-auto px-space-base h-20 flex items-center justify-between gap-space-lg">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 text-primary hover:bg-surface-subtle rounded-md"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <Link href="/" className="flex items-center flex-shrink-0">
            <Image
              src="/main-logo-arts-sports.webp"
              alt="arts sports"
              width={220}
              height={36}
              className="h-7 sm:h-8 md:h-9 w-auto object-contain"
              priority
            />
          </Link>
        </div>

        {/* Global Search Bar */}
        <div className="hidden md:flex flex-1 max-w-xl flex-col gap-1">
          <form onSubmit={handleSearch} className="relative flex items-center w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for products, categories or fabrics..."
              className="w-full h-10 pl-space-base pr-10 bg-surface-subtle text-on-surface placeholder:text-text-muted rounded-lg text-sm font-body focus:outline-none focus:bg-white focus:ring-1 focus:ring-accent-gold transition-all border border-border-light"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 w-8 h-8 flex items-center justify-center text-text-muted hover:text-primary transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Keywords */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted text-[10px] uppercase font-bold tracking-wider">
              Popular:
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {["T-Shirt", "Polo", "Hoodie", "Joggers", "Kurti"].map((tag) => (
                <Link
                  key={tag}
                  href={`/shop?q=${tag}`}
                  className="px-2 py-0.5 bg-surface-subtle hover:bg-surface-container text-on-surface-variant text-[11px] rounded transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-space-sm sm:gap-space-base flex-shrink-0">
          {/* User Account Avatar - First (profile icon) */}
          {!user ? (
            <Link
              href="/sign-in"
              className="p-2 rounded-lg hover:bg-surface-subtle text-on-surface-variant hover:text-primary transition-colors"
              aria-label="Sign in"
            >
              <User className="w-6 h-6" />
            </Link>
           ) : (
            <div className="relative" data-user-menu="true">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-subtle text-on-surface-variant hover:text-primary transition-colors"
                aria-label="Account menu"
              >
                {/* Resolved by UserAvatar, which falls back past a stale token
                    to profiles.avatar_url and then to the customer's
                    initials. This was an inline img reading
                    user_metadata.picture only, so the avatar vanished whenever
                    the issued JWT did not carry it. */}
                <UserAvatar size={32} />
                <span className="hidden sm:block text-sm font-medium text-on-surface truncate max-w-[140px]">
                  {user?.user_metadata?.full_name ||
                    user?.user_metadata?.name ||
                    user?.email?.split("@")[0] ||
                    "Account"}
                </span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-border-light">
                  <Link
                    href="/account"
                    className="block px-4 py-2 text-sm text-on-surface hover:bg-surface-subtle transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    My Account
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="block px-4 py-2 text-sm text-on-surface hover:bg-surface-subtle transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-accent-gold" />
                        Admin Panel
                      </span>
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      signOut();
                      setUserMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-subtle transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Wishlist - Second */}
          <button
            onClick={toggleWishlistDrawer}
            aria-label="Wishlist"
            className="relative p-2 rounded-lg hover:bg-surface-subtle text-on-surface-variant hover:text-primary transition-colors"
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
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-surface-subtle hover:bg-surface-container border border-border-light rounded-lg transition-colors cursor-pointer"
          >
            <div className="relative flex items-center justify-center text-primary">
              <ShoppingBag className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-gold text-white font-bold text-[10px] rounded-full flex items-center justify-center">
                {totalCartCount}
              </span>
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">
                Total
              </span>
              <span className="text-sm text-primary font-bold">
                ৳ {subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Category Navigation Bar */}
      <div className="hidden lg:block bg-surface-card border-t border-border-light">
        <div className="max-w-container-max mx-auto px-space-base h-11 flex items-center">
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {navCategories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="px-3.5 py-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-subtle rounded-md font-display uppercase tracking-wider text-xs font-semibold transition-colors whitespace-nowrap"
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border-light bg-surface-card px-space-base py-space-sm shadow-lg">
          <form onSubmit={handleSearch} className="relative flex items-center w-full mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-9 pl-3 pr-9 bg-surface-subtle text-sm rounded-lg border border-border-light"
            />
            <button type="submit" className="absolute right-2 text-text-muted">
              <Search className="w-4 h-4" />
            </button>
          </form>
          <div className="grid grid-cols-2 gap-2">
            {navCategories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm text-on-surface hover:bg-surface-subtle rounded font-semibold"
              >
                {cat.name}
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
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-card border-t border-border-light z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      >
        <div className="flex items-center justify-around h-16 px-space-sm">
          {/* Home */}
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label="Home"
          >
            <Home className="w-5 h-5 mb-0.5" />
            Home
          </Link>

          {/* Categories — opens the drawer, which is where the tree lives */}
          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label="Categories"
            aria-expanded={mobileMenuOpen}
          >
            <LayoutGrid className="w-5 h-5 mb-0.5" />
            Categories
          </button>

          {/* Chat — the only support channel that actually answers */}
          <a
            href="tel:+8809677666888"
            onClick={() => setMobileMenuOpen(false)}
            className="flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label="Call support"
          >
            <MessageCircle className="w-5 h-5 mb-0.5" />
            Support
          </a>

          {/* Cart — a real count, and it opens the drawer */}
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              openCart();
            }}
            className="relative flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
            aria-label={`Cart, ${totalCartCount} item${totalCartCount === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            Cart
            {totalCartCount > 0 && (
              <span className="absolute top-0 right-1/4 min-w-[16px] h-4 px-1 rounded-full bg-secondary text-white text-[9px] font-bold flex items-center justify-center">
                {totalCartCount}
              </span>
            )}
          </button>

          {/* Account */}
          {!user ? (
            <Link
              href="/sign-in"
              onClick={() => setMobileMenuOpen(false)}
              className="flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
              aria-label="Sign in"
            >
              <User className="w-5 h-5 mb-0.5" />
              Sign in
            </Link>
          ) : (
            <Link
              href={isAdmin ? "/admin" : "/account"}
              onClick={() => setMobileMenuOpen(false)}
              className="flex flex-1 flex-col items-center justify-center text-[11px] font-bold text-text-muted hover:text-primary transition-colors"
              aria-label={isAdmin ? "Admin panel" : "My account"}
            >
              <User className="w-5 h-5 mb-0.5" />
              {isAdmin ? "Admin" : "Account"}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
