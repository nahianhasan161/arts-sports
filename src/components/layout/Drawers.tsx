"use client";

import dynamic from "next/dynamic";
import { useCartStore } from "@/lib/store/cart-store";
import { useWishlistStore } from "@/lib/store/wishlist-store";

/** The bag and wishlist drawers, downloaded the first time one is opened. */

const Backdrop = () => <div className="fixed inset-0 z-50 bg-black/60" />;

const CartDrawer = dynamic(() => import("@/components/cart/CartDrawer").then((m) => m.CartDrawer), { ssr: false, loading: Backdrop });
const WishlistDrawer = dynamic(() => import("@/components/wishlist/WishlistDrawer").then((m) => m.WishlistDrawer), { ssr: false, loading: Backdrop });

export function Drawers() {
  const cartOpen = useCartStore((s) => s.isOpen);
  const wishlistOpen = useWishlistStore((s) => s.isOpen);
  return (
    <>
      {cartOpen && <CartDrawer />}
      {wishlistOpen && <WishlistDrawer />}
    </>
  );
}
