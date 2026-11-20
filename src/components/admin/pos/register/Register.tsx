"use client";

import { thumbUrl } from "@/lib/media/thumb";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme";
import { useAdminAccess } from "@/components/admin/access";
import { ArrowLeft, Coins, EllipsisVertical, MapPin, Minus, Phone, History, Menu, PauseCircle, Plus, Printer, ScanLine, Search, Shirt, Ticket, Trash2, Upload, X, ShoppingCart, LayoutGrid, LifeBuoy, Monitor, Moon, Sun, Download, Banknote, RotateCw, ChevronLeft, KeyRound, UserRound } from "lucide-react";
import { useT } from "@/i18n/client";
import { useConfirm } from "@/components/ui/confirm";
import PageSkeleton, { SkeletonRows, SkeletonTiles } from "@/components/ui/PageSkeleton";
import { lineDiscount, taka, type CartLine, type PosProduct, type PosVariant, type SaleDetail } from "@/lib/pos/types";
import { OFFLINE, REGISTER } from "@/components/admin/nav";
import { LanguageToggle } from "@/components/layout/Preferences";
import { api, btnGhost, btnPrimary, dateTime, field } from "../api";
import { DayTab, type SessionInfo } from "../DayTab";
import { CustomRegister } from "./CustomRegister";
import { useUrlState } from "@/lib/url-state";
import { Dialog, OrderPad, applyKey, type OrderMode, type PadKey } from "./parts";
import { PaymentScreen, type Pay } from "./PaymentScreen";
import { OrdersView } from "./OrdersView";
import { QuickAdd, type QuickAddTab } from "./QuickAdd";
import { searchLocal, useCatalogIndex } from "@/lib/pos/catalog-store";

interface Held {
  id: string;
  label: string;
  payload: { lines: CartLine[]; phone: string; name: string; address?: string; billDiscount: string; coupon: string };
}

interface KnownCustomer {
  id: string;
  name: string | null;
  marketing_consent: boolean;
  address?: string | null;
  is_blacklisted: boolean;
  stats: { total_spent: number; last_purchase_at: string | null } | null;
}

interface CustomerSuggestion {
  id: string;
  phone: string;
  name: string | null;
  is_blacklisted: boolean;
  last_purchase_at: string | null;
}

interface Done {
  sale_id: string;
  receipt_no: string;
  total: number;
  change_due: number;
}

interface Listing {
  products: PosProduct[];
  scanned: string | null;
  has_more?: boolean;
  categories?: { id: string; name: string; image?: string | null }[];
  categoriesHasMore?: boolean;
}

type Page = { products: PosProduct[]; hasMore: boolean };

interface PastSale {
  id: string;
  receipt_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  status: string;
  created_at: string;
}

/** Chrome's install prompt, kept so the menu can show "Install app". */
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.map((p) => p[0]).join("").slice(0, 3).toUpperCase() : name;
}

type Popup = "customer" | "discount" | "held" | "past" | "custom" | "drawer" | "note" | "menu" | "more" | "add" | null;
type Mode = OrderMode;

/** A bill parked in another order tab (kept in this browser tab only). */
interface Draft {
  no: number;
  lines: CartLine[];
  selected: string | null;
  phone: string;
  name: string;
  address: string;
  coupon: string;
  couponOff: { code: string; amount: number } | null;
  billDiscount: string;
  note: string;
  heldId: string | null;
}

/**
 * The register (roadmap 4.1–4.3), full screen. Left: the bill with its
 * number pad and the Payment button. Right: categories and the product
 * grid; a barcode scan goes straight into the bill.
 */
export function Register() {
  const { t } = useT();
  const confirm = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  // The shop chosen on the dashboard card (?shop=), used until a drawer is open.
  const [wantedShop, setWantedShop] = useState("");

  const [serverCategories, setCategories] = useState<{ id: string; name: string; image?: string | null }[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [serverProducts, setProducts] = useState<PosProduct[] | null>(null);
  // Lazy loading: the grid and the category row fetch one screenful at a time.
  const [serverHasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverCatsHasMore, setCatsHasMore] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);
  const gridScroll = useRef<HTMLDivElement>(null);
  const gridEnd = useRef<HTMLDivElement>(null);
  const catScroll = useRef<HTMLDivElement>(null);
  const catEnd = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState<PosProduct | null>(null);

  const [lines, setLines] = useState<CartLine[]>([]);
  // The bill line swiped open (shows + / − / delete).
  const [swiped, setSwiped] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("qty");
  // What has been typed on the pad for the selected line, so "1" then "2" gives 12.
  const [typed, setTyped] = useState<{ key: string; mode: Mode; text: string } | null>(null);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  // The customer found for a number, kept with that number so a changed number never shows the old match.
  const [lookup, setLookup] = useState<{ phone: string; customer: KnownCustomer | null } | null>(null);
  const known = lookup?.phone === phone ? lookup.customer : null;
  // Customer picker: recent buyers when the box is empty, matches as you type.
  // The list filters by what is typed in the phone box (or the name box when phone is empty).
  const custQuery = phone.trim() || name.trim();
  const [suggestions, setSuggestions] = useState<{ q: string; list: CustomerSuggestion[] } | null>(null);
  // For home delivery: kept with the sale and on the customer.
  const [address, setAddress] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponOff, setCouponOff] = useState<{ code: string; amount: number } | null>(null);
  const [billDiscount, setBillDiscount] = useState("");
  const [note, setNote] = useState("");

  const [held, setHeld] = useState<Held[]>([]);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"bill" | "pay">("bill");
  const [view, setView] = useUrlState<"register" | "orders" | "custom">("type", "register", {
    toUrl: (v) => (v === "custom" ? "custom-jersey" : v),
    fromUrl: (s) => (s === "custom-jersey" ? "custom" : s === "orders" ? "orders" : null),
  });
  const [pays, setPays] = useState<Pay[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [popupRaw, setPopupRaw] = useUrlState<NonNullable<Popup> | "">("popup", "", {
    fromUrl: (s) => (["customer", "discount", "held", "past", "drawer", "note", "menu", "more", "add"].includes(s) ? (s as NonNullable<Popup>) : null),
  });
  const popup: Popup = popupRaw || null;
  const setPopup = useCallback((p: Popup) => setPopupRaw(p ?? ""), [setPopupRaw]);
  const [pane, setPane] = useState<"products" | "bill">("products"); // phones show one at a time
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openShop, setOpenShop] = useState("");
  const [past, setPast] = useState<PastSale[] | null>(null);
  const [pastQ, setPastQ] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [float, setFloat] = useState("");
  // Order tabs: the open bill is `orderNo`; the others wait in `drafts`.
  const [orderNo, setOrderNo] = useState(1001);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const nextNo = useRef(1002);

  const loadInfo = useCallback(async () => {
    const res = await api<SessionInfo>("/api/admin/pos/session");
    if (!res.ok) return setFatal(res.error);
    setFatal(null);
    setInfo(res.data);
  }, []);
  const loadHeld = useCallback(async () => {
    const res = await api<{ held: Held[] }>("/api/admin/pos/held");
    if (res.ok) setHeld(res.data.held);
  }, []);

  const { theme, toggle: toggleTheme } = useTheme();
  const { userName, isStaff } = useAdminAccess();
  // Creating products/categories needs an admin account (the APIs use requireAdmin).
  const canAdd = !isStaff;
  const [addTab, setAddTab] = useState<QuickAddTab>("product");
  const openAdd = (tab: QuickAddTab) => {
    setAddTab(tab);
    setPopup("add");
  };
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWantedShop(new URLSearchParams(window.location.search).get("shop") ?? "");
      void loadInfo();
      void loadHeld();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadInfo, loadHeld]);

  const sessionOpen = Boolean(info?.session);
  const showroomId = info?.session?.showroom_id ?? info?.showrooms.find((s) => s.id === wantedShop)?.id ?? info?.showrooms[0]?.id ?? "";
  const shopName = info?.showrooms.find((s) => s.id === showroomId)?.name ?? "";
  const maxDiscount = info?.max_discount_percent ?? 0;
  const canManage = info?.can_manage ?? false;

  // The catalogue kept on this device (lib/pos/catalog-store.ts). Once it and
  // this shop's stock are here, the grid, categories and scans run locally;
  // until then (first open on a new device) the server answers as before.
  // Opens from the device copy, then checks in the background (see the hook).
  const { catalog, index, check: checkCatalog, loadStock } = useCatalogIndex(showroomId);
  // list() reads the newest index through a ref, so a stock refresh updates
  // the cards without re-running the search (which would scroll to the top).
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const localReady = index !== null;
  const [localView, setLocalView] = useState({ term: "", cat: "", count: 0 });
  const localAll = useMemo(() => (index ? searchLocal(index, localView.term, localView.cat).products : null), [index, localView.term, localView.cat]);
  const products = localAll ? localAll.slice(0, localView.count || 60) : serverProducts;
  const hasMore = localAll ? localAll.length > (localView.count || 60) : serverHasMore;
  const categories = catalog ? catalog.categories : serverCategories;
  const catsHasMore = catalog ? false : serverCatsHasMore;

  const addLine = useCallback((p: PosProduct, v: PosVariant) => {
    const key = `${p.product_id}:${v.variant_id ?? ""}`;
    setError(null);
    setCouponOff(null);
    setPicking(null);
    setSelected(key);
    setMode("qty");
    setTyped(null);
    setLines((current) => {
      if (current.some((l) => l.key === key)) return current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { key, product_id: p.product_id, variant_id: v.variant_id, title: p.title, label: v.label, price: p.price, available: v.available, quantity: 1, discount: 0 }];
    });
  }, []);

  // The grid: the chosen category, or what the search box says. The newest answer wins.
  //
  // Stale-while-revalidate: a list seen before (same shop, category or search)
  // shows at once from `cache`, then the fresh answer replaces it, because
  // stock changes with every sale. The cache lives as long as the register.
  const request = useRef(0);
  const gotCategories = useRef(false);
  const cache = useRef(new Map<string, Page>());
  /** How many tiles fit the grid's visible area (plus one row), so the first load is just a screenful. */
  const screenful = useCallback(() => {
    const el = gridScroll.current;
    const w = (el?.clientWidth ?? window.innerWidth) - 16;
    const h = el?.clientHeight ?? window.innerHeight;
    const cols = Math.max(2, Math.floor((w + 8) / 158)); // 150px tiles + 8px gap
    const rows = Math.ceil(h / 168) + 1; // 160px tiles + 8px gap
    return Math.min(100, cols * rows);
  }, []);
  const catScreenful = useCallback(() => Math.min(60, Math.ceil((catScroll.current?.clientWidth ?? window.innerWidth) / 168) + 2), []);
  const listUrl = useCallback(
    (term: string, cat: string, withCategories: boolean, offset = 0) => {
      const params = new URLSearchParams({ showroom_id: showroomId });
      if (term) params.set("q", term);
      else {
        if (cat) params.set("category_id", cat);
        params.set("limit", String(screenful()));
        params.set("offset", String(offset));
      }
      if (withCategories) {
        params.set("categories", "1");
        params.set("cat_limit", String(catScreenful()));
      }
      return `/api/admin/pos/products?${params}`;
    },
    [showroomId, screenful, catScreenful]
  );
  const list = useCallback(
    async (term: string, submitted: boolean) => {
      if (!showroomId) return;
      const mine = ++request.current;
      const local = indexRef.current;
      if (localReady && local) {
        const found = searchLocal(local, term, category);
        if (submitted && found.scanned) {
          const product = found.products.find((p) => p.variants.some((v) => v.variant_id === found.scanned));
          const variant = product?.variants.find((v) => v.variant_id === found.scanned);
          if (product && variant) {
            addLine(product, variant);
            setQ("");
            searchRef.current?.focus();
            return;
          }
        }
        // A scan the device copy doesn't know (a product added a moment ago):
        // ask the server below, and refresh the copy.
        if (!(submitted && term && !found.products.length)) {
          setLocalView({ term, cat: category, count: screenful() });
          gridScroll.current?.scrollTo({ top: 0 });
          return;
        }
        void checkCatalog();
      }
      const key = `${showroomId}|${term ? `q:${term.toLowerCase()}` : `c:${category}`}`;
      const cached = cache.current.get(key);
      // A scan must add the item, so it never answers from the cache.
      if (cached && !submitted) {
        setProducts(cached.products);
        setHasMore(cached.hasMore);
      }
      const res = await api<Listing>(listUrl(term, category, !gotCategories.current));
      const page: Page | null = res.ok ? { products: res.data.products, hasMore: !term && Boolean(res.data.has_more) } : null;
      if (mine !== request.current) {
        if (page) cache.current.set(key, page);
        return;
      }
      if (!res.ok || !page) return setError(res.ok ? null : res.error);
      if (res.data.categories) {
        gotCategories.current = true;
        setCategories(res.data.categories);
        setCatsHasMore(Boolean(res.data.categoriesHasMore));
      }
      cache.current.set(key, page);
      // A barcode scan (the scanner presses Enter): straight into the bill, ready for the next scan.
      if (submitted && res.data.scanned) {
        const product = res.data.products.find((p) => p.variants.some((v) => v.variant_id === res.data.scanned));
        const variant = product?.variants.find((v) => v.variant_id === res.data.scanned);
        if (product && variant) {
          addLine(product, variant);
          setQ("");
          searchRef.current?.focus();
          return;
        }
      }
      setProducts(page.products);
      setHasMore(page.hasMore);
      gridScroll.current?.scrollTo({ top: 0 });
    },
    [showroomId, category, addLine, listUrl, localReady, screenful, checkCatalog]
  );

  // Next page of the grid, when the shopper scrolls near its bottom.
  const moreBusy = useRef(false);
  const loadMore = useCallback(async () => {
    if (localAll) return setLocalView((v) => ({ ...v, count: (v.count || 60) + screenful() }));
    if (moreBusy.current || !hasMore || q.trim() || !products) return;
    moreBusy.current = true;
    setLoadingMore(true);
    const mine = request.current;
    const key = `${showroomId}|c:${category}`;
    const res = await api<Listing>(listUrl("", category, false, products.length));
    moreBusy.current = false;
    setLoadingMore(false);
    if (mine !== request.current) return; // the category or search changed meanwhile
    if (!res.ok) {
      setHasMore(false);
      return setError(res.error);
    }
    const seen = new Set(products.map((p) => p.product_id));
    const next = [...products, ...res.data.products.filter((p) => !seen.has(p.product_id))];
    const more = Boolean(res.data.has_more);
    setProducts(next);
    setHasMore(more);
    cache.current.set(key, { products: next, hasMore: more });
  }, [hasMore, q, products, showroomId, category, listUrl, localAll, screenful]);

  useEffect(() => {
    const el = gridEnd.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), {
      root: gridScroll.current,
      rootMargin: "0px 0px 400px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  // Next page of categories, when the row is scrolled to its right end.
  const catsBusy = useRef(false);
  const loadMoreCats = useCallback(async () => {
    if (catsBusy.current || !catsHasMore || !showroomId) return;
    catsBusy.current = true;
    setLoadingCats(true);
    const params = new URLSearchParams({ showroom_id: showroomId, categories_only: "1", cat_offset: String(categories.length), cat_limit: String(catScreenful()) });
    const res = await api<Listing>(`/api/admin/pos/products?${params}`);
    catsBusy.current = false;
    setLoadingCats(false);
    if (!res.ok) {
      setCatsHasMore(false);
      return setError(res.error);
    }
    const seen = new Set(categories.map((c) => c.id));
    setCategories([...categories, ...(res.data.categories ?? []).filter((c) => !seen.has(c.id))]);
    setCatsHasMore(Boolean(res.data.categoriesHasMore));
  }, [catsHasMore, showroomId, categories, catScreenful]);

  useEffect(() => {
    const el = catEnd.current;
    if (!el || !catsHasMore) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMoreCats(), {
      root: catScroll.current,
      rootMargin: "0px 300px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [catsHasMore, loadMoreCats]);

  // Prefetch: once the categories are known, fill the cache for the first few
  // in the background, one at a time, so the first tap on each is instant.
  useEffect(() => {
    if (!showroomId || !categories.length || catalog) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      for (const c of categories.slice(0, 8)) {
        const key = `${showroomId}|c:${c.id}`;
        if (stopped) return;
        if (cache.current.has(key)) continue;
        const res = await api<Listing>(listUrl("", c.id, false));
        if (res.ok && !cache.current.has(key)) cache.current.set(key, { products: res.data.products, hasMore: Boolean(res.data.has_more) });
      }
    }, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [showroomId, categories, listUrl, catalog]);

  // A barcode scanner "types" the whole code in a few milliseconds. When the
  // text came in that fast, treat it as a scan and add the item without Enter.
  const typing = useRef({ first: 0, last: 0 });
  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    const { first, last } = typing.current;
    const scanned = term.length >= 4 && last - first < term.length * 35;
    const timer = setTimeout(() => void list(term, scanned), !term ? 0 : scanned ? 120 : 300);
    return () => clearTimeout(timer);
  }, [q, list]);

  // A scan while nothing is focused (after a tap on the grid or bill) still
  // goes into the search box, so the scanner works from anywhere on the register.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (popup !== "customer") return;
    const q = custQuery.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<{ customers: CustomerSuggestion[] }>(`/api/admin/pos/customer?q=${encodeURIComponent(q)}`).then((res) => {
        if (!cancelled && res.ok) setSuggestions({ q, list: res.data.customers ?? [] });
      });
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [popup, custQuery]);

  // Phone number -> the customer we already know (website and shop share one list).
  useEffect(() => {
    if (phone.replace(/\D/g, "").length < 11) return;
    let cancelled = false;
    void api<{ customer: KnownCustomer | null }>(`/api/admin/pos/customer?phone=${encodeURIComponent(phone)}`).then((res) => {
      if (cancelled || !res.ok) return;
      setLookup({ phone, customer: res.data.customer });
      if (res.data.customer?.name) setName((n) => n || res.data.customer?.name || "");
      if (res.data.customer?.address) setAddress((a) => a || res.data.customer?.address || "");
    });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const lineDiscounts = lines.reduce((s, l) => s + lineDiscount(l), 0);
    const couponAmount = couponOff?.amount ?? 0;
    const afterLines = Math.max(0, subtotal - lineDiscounts - couponAmount);
    const bill = Math.min(Math.max(0, Number(billDiscount) || 0), afterLines);
    return { subtotal, manual: lineDiscounts + bill, total: Math.round((afterLines - bill) * 100) / 100, pieces: lines.reduce((s, l) => s + l.quantity, 0) };
  }, [lines, couponOff, billDiscount]);
  const overLimit = !canManage && totals.manual > (totals.subtotal * maxDiscount) / 100 + 0.001;

  // Stock: the newest count on this device (refreshed after each sale), else what it was when added.
  const liveStock = useMemo(() => (index ? new Map<string, number>(index.all.flatMap((p) => p.variants.map((v): [string, number] => [`${p.product_id}:${v.variant_id ?? ""}`, v.available]))) : null), [index]);
  const stockOf = (l: CartLine) => liveStock?.get(l.key) ?? l.available;
  const overStock = lines.filter((l) => l.quantity > stockOf(l));
  const stockBlock = overStock.length ? t("shop.register.overStock", { items: overStock.map((l) => `${l.title}${l.label ? ` (${l.label})` : ""}: ${stockOf(l)}`).join(", ") }) : null;
  // Paisa: the bill discount that makes the total a whole taka.
  const paisa = Math.round((totals.total - Math.floor(totals.total)) * 100) / 100;
  const roundOff = () => setBillDiscount(String(Math.round(((Number(billDiscount) || 0) + paisa) * 100) / 100));

  function reset() {
    setLines([]);
    setSelected(null);
    setTyped(null);
    setMode("qty");
    setPhone("");
    setName("");
    setLookup(null);
    setAddress("");
    setCoupon("");
    setCouponOff(null);
    setBillDiscount("");
    setNote("");
    setPays([]);
    setHeldId(null);
    setError(null);
    setScreen("bill");
    setPane("products");
    setQ("");
    searchRef.current?.focus();
  }

  const setLine = (key: string, patch: Partial<CartLine>) => {
    setCouponOff(null);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const removeLine = (key: string) => {
    setCouponOff(null);
    setLines((current) => current.filter((l) => l.key !== key));
    setSelected((s) => (s === key ? null : s));
    setTyped(null);
  };

  function press(key: PadKey) {
    const line = lines.find((l) => l.key === selected);
    if (!line) return;
    const same = typed && typed.key === line.key && typed.mode === mode;
    const current = mode === "qty" ? line.quantity : mode === "disc" ? (line.pct ?? "") : (line.unit ?? line.price);
    // A digit starts a new number; backspace works on the number already there.
    const before = same ? typed.text : key === "back" ? String(current) : "";
    const text = applyKey(before, key);
    if (mode === "qty") {
      const quantity = Math.floor(Number(text) || 0);
      if (text === "" || quantity < 1) {
        if (key === "back" || key === "clear") return removeLine(line.key);
        return;
      }
      setLine(line.key, { quantity });
    } else if (mode === "disc") {
      setLine(line.key, { pct: text === "" ? undefined : Math.min(100, Number(text) || 0), unit: undefined, discount: 0 });
    } else {
      // Only a lower price can be given: the shop price is checked on the server.
      setLine(line.key, { unit: text === "" ? undefined : Math.min(line.price, Number(text) || 0), pct: undefined, discount: 0 });
    }
    setTyped({ key: line.key, mode, text });
  }

  const snapshot = (): Draft => ({ no: orderNo, lines, selected, phone, name, address, coupon, couponOff, billDiscount, note, heldId });
  const isEmpty = () => !lines.length && !phone && !name && !address && !note;

  function load(d: Draft) {
    reset();
    setLines(d.lines);
    setSelected(d.selected);
    setPhone(d.phone);
    setName(d.name);
    setAddress(d.address ?? "");
    setCoupon(d.coupon);
    setCouponOff(d.couponOff);
    setBillDiscount(d.billDiscount);
    setNote(d.note);
    setHeldId(d.heldId);
    setOrderNo(d.no);
  }

  function switchOrder(no: number) {
    if (no === orderNo) return;
    const target = drafts.find((d) => d.no === no);
    if (!target) return;
    setDrafts((list) => [...list.filter((d) => d.no !== no), ...(isEmpty() ? [] : [snapshot()])]);
    load(target);
  }

  function newOrder() {
    if (isEmpty()) return;
    setDrafts((list) => [...list, snapshot()]);
    reset();
    setOrderNo(nextNo.current++);
  }

  function menuPick(id: string) {
    if (id === "past") { setPopup(null); return setView("orders"); }
    if (id === "custom") { setPopup(null); return setView("custom"); }
    if (id === "clear") {
      reset();
      return setPopup(null);
    }
    if (id === "help") {
      window.open(`${OFFLINE}/help`, "_blank");
      return setPopup(null);
    }
    setPopup(id as Popup);
  }

  const menuTiles: { id: string; icon: typeof Plus; label: string; danger?: boolean }[] = [
    { id: "full", icon: Monitor, label: t("shop.register.fullScreen") },
    { id: "theme", icon: theme === "dark" ? Sun : Moon, label: theme === "dark" ? t("shop.register.lightMode") : t("shop.register.darkMode") },
    installPrompt ? { id: "install", icon: Download, label: t("shop.register.installApp") } : { id: "help", icon: LifeBuoy, label: t("admin.nav.shopHelp.name") },
    { id: "drawer", icon: Banknote, label: t("shop.register.cashInOut") },
    { id: "reload", icon: RotateCw, label: t("shop.register.reloadData") },
    { id: "product", icon: Plus, label: t("shop.register.createProduct") },
    { id: "backend", icon: ChevronLeft, label: t("shop.register.backend") },
    { id: "held", icon: PauseCircle, label: `${t("shop.pos.heldBills")}${held.length ? ` (${held.length})` : ""}` },
    { id: "past", icon: History, label: t("shop.register.pastSales") },
    { id: "custom", icon: Shirt, label: t("shop.pos.tabs.custom") },
    { id: "closeRegister", icon: KeyRound, label: t("shop.register.closeRegister"), danger: true },
  ];

  async function menuTile(id: string) {
    if (id === "theme") return toggleTheme();
    if (id === "drawer" || id === "closeRegister") return setPopup("drawer");
    if (id === "help" || id === "held" || id === "past" || id === "custom") return menuPick(id);
    if (id === "backend") return router.push(OFFLINE);
    setPopup(null);
    if (id === "full") {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (id === "install" && installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
    } else if (id === "reload") {
      void loadInfo();
      void loadHeld();
      void checkCatalog(true);
      void loadStock(showroomId);
      void list(q, false);
    } else if (id === "product") {
      window.open(`${OFFLINE}/products`, "_blank");
    }
  }


  /** After a sale: the next waiting order, or a fresh number. */
  function finishOrder() {
    const [first, ...rest] = [...drafts].sort((x, y) => x.no - y.no);
    if (first) {
      setDrafts(rest);
      load(first);
    } else {
      reset();
      setOrderNo(nextNo.current++);
    }
  }

  async function applyCoupon() {
    if (!coupon.trim() || !lines.length) return;
    const res = await api<{ code: string; discount_amount: number }>("/api/admin/pos/sales", { preview: true, coupon_code: coupon, items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })) });
    if (!res.ok) {
      setCouponOff(null);
      return setError(res.error);
    }
    setError(null);
    setCouponOff({ code: res.data.code, amount: res.data.discount_amount });
  }

  async function hold() {
    if (!lines.length) return;
    const res = await api("/api/admin/pos/held", { label: name || phone || "", payload: { lines, phone, name, address, billDiscount, coupon } });
    if (!res.ok) return setError(res.error);
    if (heldId) await api(`/api/admin/pos/held?id=${heldId}`, undefined, "DELETE");
    reset();
    void loadHeld();
  }

  function resume(h: Held) {
    reset();
    setLines(h.payload.lines ?? []);
    setPhone(h.payload.phone ?? "");
    setName(h.payload.name ?? "");
    setAddress(h.payload.address ?? "");
    setBillDiscount(h.payload.billDiscount ?? "");
    setCoupon(h.payload.coupon ?? "");
    setHeldId(h.id);
    setPopup(null);
    setPane("bill");
  }

  async function loadPast(term: string) {
    setPast(null);
    const res = await api<{ sales: PastSale[] }>(`/api/admin/pos/sales?q=${encodeURIComponent(term.trim())}`);
    setPast(res.ok ? res.data.sales : []);
    if (!res.ok) setError(res.error);
  }


  /** Put a past sale's items (at today's price and stock) and customer into a fresh bill. */
  async function copySale(id: string) {
    if (lines.length && !(await confirm({ title: t("shop.register.copyReplace") }))) return;
    setBusy(true);
    setError(null);
    const detail = await api<SaleDetail>(`/api/admin/pos/sales/${id}`);
    if (!detail.ok) {
      setBusy(false);
      return setError(detail.error);
    }
    const ids = [...new Set(detail.data.items.map((i) => i.product_id).filter(Boolean))] as string[];
    // From the device copy when it has every product; else ask the server.
    const local = indexRef.current;
    const fromDevice = local ? ids.map((id) => local.all.find((p) => p.product_id === id)).filter((p): p is PosProduct => Boolean(p)) : [];
    const found =
      ids.length && fromDevice.length < ids.length
        ? await api<Listing>(`/api/admin/pos/products?ids=${encodeURIComponent(ids.join(","))}&showroom_id=${encodeURIComponent(showroomId)}`)
        : null;
    setBusy(false);
    if (found && !found.ok) return setError(found.error);
    const products = found?.ok ? found.data.products : fromDevice;
    const next: CartLine[] = [];
    let missing = 0;
    for (const item of detail.data.items) {
      const p = products.find((x) => x.product_id === item.product_id);
      const v = p?.variants.find((x) => x.variant_id === (item.variant_id ?? null));
      if (!p || !v) {
        missing++;
        continue;
      }
      const key = `${p.product_id}:${v.variant_id ?? ""}`;
      const same = next.find((l) => l.key === key);
      if (same) same.quantity += Number(item.quantity);
      else next.push({ key, product_id: p.product_id, variant_id: v.variant_id, title: p.title, label: v.label, price: p.price, available: v.available, quantity: Number(item.quantity), discount: 0 });
    }
    const sale = detail.data.sale;
    reset();
    setLines(next);
    setPhone(sale.customer_phone ?? "");
    setName(sale.customer_name ?? "");
    setPopup(null);
    setPane("bill");
    setNotice(missing ? t("shop.register.copyMissing", { n: missing }) : null);
  }

  async function dropHeld(id: string) {
    await api(`/api/admin/pos/held?id=${id}`, undefined, "DELETE");
    if (heldId === id) setHeldId(null);
    void loadHeld();
  }

  async function askRemove(l: CartLine) {
    setSwiped(null);
    const ok = await confirm({ title: t("shop.register.removeAsk"), description: `${l.title}${l.label ? ` · ${l.label}` : ""} × ${l.quantity}`, confirmText: t("shop.register.removeLine"), danger: true });
    if (ok) removeLine(l.key);
  }

  function goToPay() {
    setError(null);
    if (stockBlock) {
      setSelected(overStock[0].key);
      setMode("qty");
      setTyped(null);
      setPane("bill");
      return setError(stockBlock);
    }
    // The usual case is cash for the exact amount: one tap on Validate finishes it.
    setPays([{ method: "cash", amount: String(totals.total), reference: "" }]);
    setScreen("pay");
  }

  async function complete() {
    setBusy(true);
    setError(null);
    const res = await api<Done>("/api/admin/pos/sales", {
      items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity, discount: lineDiscount(l) })),
      payments: pays.map((p) => ({ method: p.method, amount: Number(p.amount) || 0, reference: p.reference })),
      customer_phone: phone,
      customer_name: name,
      customer_address: address,
      coupon_code: couponOff ? couponOff.code : "",
      bill_discount: Number(billDiscount) || 0,
      note,
      held_id: heldId,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone(res.data);
    void loadHeld();
    // Stock on the cards has changed.
    void loadStock(showroomId);
    if (!localReady) void list(q.trim(), false);
  }

  async function openRegister() {
    setBusy(true);
    const res = await api("/api/admin/pos/session", { action: "open", showroom_id: openShop || showroomId, opening_float: Number(float) || 0 });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setFloat("");
    await loadInfo();
  }

  if (fatal) {
    return (
      <div className="h-screen bg-surface flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-badge-discount bg-badge-discount/10 rounded-lg p-3 max-w-xl">{fatal}</p>
        <Link href={OFFLINE} className={btnGhost}>
          <ArrowLeft className="w-4 h-4" /> {t("shop.register.backToShop")}
        </Link>
      </div>
    );
  }
  if (!info) return <PageSkeleton variant="register" label={t("shop.common.loading")} className="h-screen" />;

  const customerLabel = name || phone || t("shop.register.customer");
  const selectedLine = lines.find((l) => l.key === selected);

  const phoneOk = /^01\d{9}$/.test(phone.replace(/\D/g, ""));
  const customerDialog = popup === "customer" && (
    <Dialog title={t("shop.register.customer")} wide onClose={() => setPopup(null)}>
      <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.register.custPhone")}</span>
            <span className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className={`${field} h-12 pl-9 text-base tabular-nums w-full`} inputMode="tel" autoFocus />
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.register.custName")}</span>
            <span className="relative">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("shop.pos.customerName")} className={`${field} h-12 pl-9 text-base w-full`} />
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.register.custAddress")}</span>
            <span className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-text-muted" />
              <textarea value={address} onChange={(e) => setAddress(e.target.value.slice(0, 500))} rows={2} placeholder={t("shop.register.custAddressHint")} className={`${field} pl-9 py-2.5 text-base w-full resize-none`} />
            </span>
          </label>
          {phoneOk && (
            <p
              className={`text-sm rounded-md px-3 py-2 ${
                known?.is_blacklisted ? "bg-badge-discount/10 text-badge-discount font-semibold" : known ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : "bg-surface-subtle text-text-muted"
              }`}
            >
              {known ? (known.is_blacklisted ? t("shop.pos.blacklisted") : t("shop.pos.returning", { amount: taka(known.stats?.total_spent ?? 0) })) : t("shop.pos.newCustomer")}
            </p>
          )}
          <p className="text-xs text-text-muted">{t("shop.register.customerShared")}</p>
        </div>
        <div className="flex flex-col min-h-0">
          <div className="px-1 pb-1.5 text-xs font-semibold text-text-muted">{custQuery.trim() ? t("shop.register.matches") : t("shop.register.recentCustomers")}</div>
          <div className="flex flex-col max-h-72 overflow-y-auto rounded-md border border-border-light divide-y divide-border-light">
            {suggestions?.q === custQuery.trim() ? (
              suggestions.list.length ? (
                suggestions.list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPhone(c.phone);
                      setName(c.name ?? "");
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-container ${c.phone === phone ? "bg-primary/10" : ""}`}
                  >
                    <span className="w-8 h-8 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{(c.name || "#").trim().slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-on-surface truncate">{c.name || c.phone}</span>
                      <span className="block text-xs text-text-muted tabular-nums">{c.phone}</span>
                    </span>
                    {c.is_blacklisted && <span className="text-xs text-badge-discount font-semibold shrink-0">{t("shop.pos.blacklisted")}</span>}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-text-muted">{t("shop.register.noCustomerFound")}</div>
              )
            ) : (
              <div className="px-3 py-3 text-sm text-text-muted">{t("shop.common.loading")}</div>
            )}
          </div>
        </div>
        <div className="md:col-span-2 flex gap-2">
          <button
            type="button"
            className={`${btnGhost} flex-1 h-11`}
            onClick={() => {
              setPhone("");
              setName("");
              setAddress("");
              setLookup(null);
            }}
          >
            {t("shop.sales.walkIn")}
          </button>
          <button type="button" className={`${btnPrimary} flex-1 h-11`} onClick={() => setPopup(null)}>
            {t("shop.register.done")}
          </button>
        </div>
      </div>
    </Dialog>
  );

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Top bar */}
      <header className="h-14 bg-surface-card border-b border-border-light flex items-center gap-2 px-2 flex-shrink-0">
        <div className="hidden sm:flex rounded-md border border-border-light overflow-hidden text-sm font-semibold">
          <button type="button" onClick={() => setView("register")} className={`h-10 px-3 border-r border-border-light ${view === "register" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
            {t("shop.register.registerTab")}
          </button>
          <button type="button" onClick={() => setView("orders")} className={`h-10 px-3 border-r border-border-light ${view === "orders" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
            {t("shop.register.ordersTab")}
          </button>
          <button type="button" onClick={() => setView("custom")} className={`h-10 px-3 flex items-center gap-1.5 ${view === "custom" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
            <Shirt className="w-4 h-4" /> {t("shop.pos.tabs.custom")}
          </button>
        </div>
        <button type="button" onClick={() => { setView("register"); newOrder(); }} className="h-10 w-11 rounded-md border border-border-light text-on-surface-variant hover:bg-surface-subtle flex items-center justify-center flex-shrink-0" title={t("shop.register.newOrder")} aria-label={t("shop.register.newOrder")}>
          <Plus className="w-5 h-5" />
        </button>
        <div className="flex gap-1 overflow-x-auto no-scrollbar min-w-0 pl-1 border-l border-border-light">
          {[orderNo, ...drafts.map((d) => d.no)]
            .sort((a, b) => a - b)
            .map((no) => (
              <button key={no} type="button" onClick={() => { setView("register"); switchOrder(no); }} className={`h-10 px-3.5 rounded-md border text-sm tabular-nums flex-shrink-0 ${no === orderNo ? "border-primary bg-primary/10 text-on-surface font-semibold" : "border-border-light text-on-surface-variant hover:bg-surface-subtle"}`}>
                {no}
              </button>
            ))}
        </div>

        <form
          className="relative ml-auto w-full max-w-[16rem] min-w-[8rem]"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) void list(q.trim(), true);
          }}
        >
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              const now = performance.now();
              if (!q || !e.target.value) typing.current.first = now;
              typing.current.last = now;
              setQ(e.target.value);
            }}
            onFocus={() => setPane("products")}
            placeholder={t("shop.pos.searchPlaceholder")}
            className="w-full h-10 rounded-md bg-surface-card border border-border-light pl-9 pr-8 text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-primary"
            autoComplete="off"
            autoFocus
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-on-surface" aria-label={t("shop.common.cancel")}>
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
        <button type="button" onClick={() => setPopup("held")} className="relative h-10 w-11 rounded-md border border-border-light text-on-surface-variant hover:bg-surface-subtle flex items-center justify-center flex-shrink-0" title={t("shop.register.draftBills")} aria-label={t("shop.register.draftBills")}>
          <PauseCircle className="w-5 h-5" />
          {held.length > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-accent-gold text-white text-[11px] font-bold flex items-center justify-center tabular-nums">{held.length}</span>}
        </button>
        {canAdd && <button type="button" onClick={() => openAdd("product")} className="h-10 px-3 rounded-md border border-border-light text-on-surface-variant hover:bg-surface-subtle flex items-center justify-center gap-1.5 text-sm font-semibold flex-shrink-0" title={t("shop.register.quickAddTitle")}>
          <Plus className="w-5 h-5" /> <span className="hidden sm:inline">{t("shop.register.quickAdd")}</span>
        </button>}
        <span className="hidden md:flex h-9 px-3 items-center rounded-md bg-primary text-primary-foreground text-sm font-bold max-w-[10rem] truncate" title={sessionOpen ? t("shop.register.open") : t("shop.register.closed")}>
          {shopName || "—"}
        </span>
        <button type="button" onClick={() => setPopup("menu")} className="relative h-10 w-10 flex items-center justify-center rounded-md text-on-surface hover:bg-surface-subtle" aria-label={t("shop.register.menu")}>
          <Menu className="w-5 h-5" />
          {held.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent-gold" />}
        </button>
      </header>

      {view === "custom" ? (
        <CustomRegister />
      ) : view === "orders" ? (
        <OrdersView canManage={canManage} onCopy={(id) => { setView("register"); void copySale(id); }} />
      ) : done ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-6 text-center flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold text-primary">{t("shop.pos.saleDone", { no: done.receipt_no })}</h2>
            <p className="text-4xl font-bold tabular-nums">{taka(done.total)}</p>
            {done.change_due > 0 && <p className="text-lg font-semibold text-badge-discount">{t("shop.pos.changeToGive", { amount: taka(done.change_due) })}</p>}
            <div className="grid grid-cols-2 gap-2">
              <a className={btnGhost} href={`${REGISTER}/receipt/${done.sale_id}?size=thermal`} target="_blank" rel="noreferrer">
                <Printer className="w-4 h-4" /> {t("shop.pos.printThermal")}
              </a>
              <a className={btnGhost} href={`${REGISTER}/receipt/${done.sale_id}`} target="_blank" rel="noreferrer">
                <Printer className="w-4 h-4" /> {t("shop.pos.printA4")}
              </a>
            </div>
            <button
              type="button"
              className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold hover:opacity-90"
              autoFocus
              onClick={() => {
                setDone(null);
                finishOrder();
              }}
            >
              {t("shop.pos.newSale")}
            </button>
          </div>
        </div>
      ) : screen === "pay" ? (
        <PaymentScreen total={totals.total} pays={pays} setPays={setPays} customerLabel={customerLabel} onCustomer={() => setPopup("customer")} onBack={() => setScreen("bill")} onValidate={complete} busy={busy} error={error} blocked={stockBlock ?? (overLimit ? t("shop.pos.discountLimit", { percent: maxDiscount }) : null)} />
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* The bill */}
          <section className={`${pane === "bill" ? "flex" : "hidden"} lg:flex w-full lg:w-[420px] xl:w-[450px] flex-col bg-surface-card border-r border-border-light flex-shrink-0`}>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-text-muted p-6 text-center">
                  <ShoppingCart className="w-10 h-10 opacity-40" />
                  <p className="text-sm">{t("shop.pos.emptyCart")}</p>
                </div>
              ) : (
                <ul>
                  {lines.map((l) => (
                    <BillLine
                      key={l.key}
                      line={l}
                      stock={stockOf(l)}
                      active={l.key === selected}
                      open={swiped === l.key}
                      setOpen={(on) => setSwiped(on ? l.key : null)}
                      onSelect={() => {
                        setSelected(l.key);
                        setTyped(null);
                      }}
                      onQty={(n) => {
                        setTyped(null);
                        setSelected(l.key);
                        if (n < 1) return void askRemove(l);
                        setLine(l.key, { quantity: n });
                      }}
                      onRemove={() => void askRemove(l)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="px-2 pb-2 flex flex-col gap-2 flex-shrink-0">
              <div className="px-1 pt-2 border-t border-border-light">
                {couponOff && <p className="flex justify-between text-xs text-emerald-600"><span>{t("shop.pos.couponOff", { code: couponOff.code })}</span><span>−{taka(couponOff.amount)}</span></p>}
                {totals.manual > 0 && <p className={`flex justify-between text-xs ${overLimit ? "text-badge-discount font-semibold" : "text-text-muted"}`}><span>{t("shop.pos.discount")}</span><span className="tabular-nums">−{taka(totals.manual)}</span></p>}
                <p className="flex justify-between items-baseline text-on-surface">
                  <span className="font-bold">{t("shop.register.total")} <span className="text-xs font-normal text-text-muted">· {t("shop.register.pieces", { n: totals.pieces })}</span></span>
                  <span className="text-lg font-bold tabular-nums">{taka(totals.total)}</span>
                </p>
                {paisa > 0 && (
                  <button type="button" onClick={roundOff} className="mt-1 ml-auto flex items-center gap-1 rounded-md border border-dashed border-accent-gold/70 px-2 py-1 text-xs font-semibold text-on-surface hover:bg-accent-gold/10" title={t("shop.register.roundOffHint")}>
                    <Coins className="w-3.5 h-3.5 text-accent-gold" /> {t("shop.register.roundOff", { amount: taka(paisa) })}
                  </button>
                )}
              </div>
              {stockBlock && <p className="text-xs text-badge-discount font-semibold">{stockBlock}</p>}
              {overLimit && <p className="text-xs text-badge-discount">{t("shop.pos.discountLimit", { percent: maxDiscount })}</p>}
              {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}
              {notice && (
                <p className="text-sm text-on-surface-variant bg-surface-subtle rounded p-2 flex items-start gap-2">
                  <span className="flex-1">{notice}</span>
                  <button type="button" onClick={() => setNotice(null)} aria-label={t("shop.common.cancel")}>
                    <X className="w-4 h-4" />
                  </button>
                </p>
              )}

              <div className="flex gap-2 border-t border-border-light pt-2">
                <button type="button" onClick={() => setPopup("customer")} className={`h-10 px-3 rounded-md border text-sm max-w-[45%] truncate ${phone || name ? "border-primary bg-primary/10 text-on-surface font-semibold" : "border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container"}`}>
                  {customerLabel}
                </button>
                <button type="button" onClick={() => setPopup("note")} className={`h-10 px-3 rounded-md border text-sm ${note ? "border-primary bg-primary/10 font-semibold" : "border-border-light bg-surface-subtle hover:bg-surface-container"} text-on-surface`}>
                  {t("shop.common.note")}
                </button>
                <button type="button" onClick={() => void hold()} disabled={!lines.length} className="ml-auto h-10 w-11 rounded-md border border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container disabled:opacity-40 flex items-center justify-center" title={t("shop.pos.hold")} aria-label={t("shop.pos.hold")}>
                  <Upload className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setPopup("more")} className={`h-10 w-11 rounded-md border flex items-center justify-center ${couponOff || Number(billDiscount) > 0 ? "border-primary bg-primary/10" : "border-border-light bg-surface-subtle hover:bg-surface-container"} text-on-surface`} title={t("shop.register.more")} aria-label={t("shop.register.more")}>
                  <EllipsisVertical className="w-4 h-4" />
                </button>
              </div>

              <OrderPad
                onKey={press}
                onSign={() => selectedLine && removeLine(selectedLine.key)}
                mode={mode}
                setMode={(m) => {
                  setMode(m);
                  setTyped(null);
                }}
                disabled={!selectedLine}
                labels={{ qty: t("shop.common.qty"), price: t("shop.register.price"), sign: t("shop.register.removeLine") }}
              />

              <button type="button" onClick={goToPay} disabled={!lines.length || !sessionOpen} className="h-16 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 disabled:opacity-50">
                {t("shop.register.payment")}
              </button>
            </div>
          </section>

          {/* Products */}
          <section className={`${pane === "products" ? "flex" : "hidden"} lg:flex flex-1 min-w-0 flex-col bg-surface`}>
            <div ref={gridScroll} className="flex-1 overflow-y-auto p-2">
              {!q && categories.length > 0 && (
                <div ref={catScroll} className="flex flex-nowrap gap-2 mb-3 overflow-x-auto no-scrollbar snap-x pb-1">
                  {[{ id: "", name: t("shop.register.all") }, ...categories].map((c) => (
                    <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`relative shrink-0 snap-start min-w-[10rem] h-16 px-4 rounded-md text-sm font-medium text-on-surface transition overflow-hidden flex items-center gap-2 ${category === c.id ? "bg-accent-gold/70 ring-2 ring-accent-gold" : "bg-accent-gold/30 hover:bg-accent-gold/45"}`}>
                      {"image" in c && c.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl(c.image)} onError={(e) => { const img = e.currentTarget; if (img.dataset.fallback || !c.image) return; img.dataset.fallback = "1"; img.src = c.image; }} alt="" loading="lazy" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                      ) : null}
                      <span className="flex-1 text-center">{c.name}</span>
                    </button>
                  ))}
                  {canAdd && !catsHasMore && !loadingCats && (
                    <button type="button" onClick={() => openAdd("category")} className="shrink-0 snap-start min-w-[6rem] h-16 rounded-md border-2 border-dashed border-accent-gold/60 text-accent-gold hover:bg-accent-gold/10 flex items-center justify-center" title={t("shop.register.saveCategory")} aria-label={t("shop.register.saveCategory")}>
                      <Plus className="w-6 h-6" />
                    </button>
                  )}
                  {loadingCats && Array.from({ length: 3 }).map((_, i) => <span key={`cs${i}`} aria-hidden className="shrink-0 min-w-[10rem] h-16 rounded-md bg-surface-subtle animate-pulse" />)}
                  {catsHasMore && <span ref={catEnd} className="shrink-0 w-px h-16" />}
                </div>
              )}
              {products === null ? (
                <SkeletonTiles label={t("shop.common.loading")} />
              ) : products.length === 0 ? (
                <div className="p-4 flex flex-col items-start gap-3">
                  <p className="text-sm text-text-muted">{q ? t("shop.pos.noResults") : t("shop.register.noProducts")}</p>
                  {canAdd && !q && (
                    <button type="button" onClick={() => openAdd("product")} className="w-[150px] h-40 rounded-md border-2 border-dashed border-accent-gold/60 text-accent-gold hover:bg-accent-gold/10 flex flex-col items-center justify-center gap-1 text-sm font-semibold">
                      <Plus className="w-8 h-8" /> {t("shop.register.saveProduct")}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {products.map((p) => {
                    const stock = p.variants.reduce((s, v) => s + v.available, 0);
                    const inBill = lines.filter((l) => l.product_id === p.product_id).reduce((s, l) => s + l.quantity, 0);
                    return (
                      <li key={p.product_id}>
                        <button
                          type="button"
                          onClick={() => (p.variants.length === 1 ? addLine(p, p.variants[0]) : setPicking(p))}
                          title={`${p.title} · ${taka(p.price)}`}
                          className={`group relative w-full h-40 flex flex-col text-left rounded-md border bg-surface-card overflow-hidden border-b-4 transition active:scale-[0.98] ${inBill ? "border-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"} ${stock > 0 ? "" : "opacity-60"}`}
                        >
                          {p.image ? (
                            <span className="relative flex-1 min-h-0 bg-surface-subtle">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbUrl(p.image)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                // No thumbnail yet (older upload): show the original.
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  if (!p.image || img.dataset.fallback) return;
                                  img.dataset.fallback = "1";
                                  img.src = p.image;
                                }}
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            </span>
                          ) : null}
                          <span className={`px-2 py-1.5 text-sm text-on-surface leading-snug line-clamp-2 ${p.image ? "pr-8" : "flex-1 flex items-center justify-center text-center"}`}>{p.title}</span>
                          <span className="absolute top-1 right-1 rounded bg-surface-card/90 text-on-surface text-[11px] font-semibold px-1.5 py-0.5 tabular-nums">{taka(p.price)}</span>
                          {stock <= 0 && <span className="absolute top-1 left-1 rounded bg-badge-discount text-white text-[11px] font-semibold px-1.5 py-0.5">{t("shop.register.soldOut")}</span>}
                          {inBill > 0 && <span className="absolute bottom-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-md bg-neutral-900 text-white text-xs font-bold flex items-center justify-center tabular-nums">{inBill}</span>}
                        </button>
                      </li>
                    );
                  })}
                  {canAdd && !hasMore && !loadingMore && !q && (
                    <li>
                      <button type="button" onClick={() => openAdd("product")} className="w-full h-40 rounded-md border-2 border-dashed border-accent-gold/60 text-accent-gold hover:bg-accent-gold/10 flex flex-col items-center justify-center gap-1 text-sm font-semibold">
                        <Plus className="w-8 h-8" /> {t("shop.register.saveProduct")}
                      </button>
                    </li>
                  )}
                  {loadingMore && Array.from({ length: 6 }).map((_, k) => <li key={`sk${k}`} aria-hidden className="h-40 rounded-md border border-border-light bg-surface-subtle animate-pulse" />)}
                </ul>
              )}
              {hasMore && !q && <div ref={gridEnd} className="h-px" />}
            </div>
          </section>
        </div>
      )}


      {/* Phones: switch between the products and the bill. */}
      {!done && screen === "bill" && (
        <div className="lg:hidden grid grid-cols-2 border-t border-border-light bg-surface-card flex-shrink-0">
          <button type="button" onClick={() => setPane("products")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "products" ? "text-accent-gold" : "text-on-surface-variant"}`}>
            <LayoutGrid className="w-4 h-4" /> {t("shop.register.products")}
          </button>
          <button type="button" onClick={() => setPane("bill")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "bill" ? "text-accent-gold" : "text-on-surface-variant"}`}>
            <ShoppingCart className="w-4 h-4" /> {t("shop.pos.cart")} · {taka(totals.total)}
            {totals.pieces > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-accent-gold text-white text-[11px] font-bold flex items-center justify-center">{totals.pieces}</span>}
          </button>
        </div>
      )}

      {/* Size / colour of the tapped product */}
      {picking && (
        <Dialog title={picking.title} onClose={() => setPicking(null)}>
          <p className="text-sm text-text-muted mb-3">
            {t("shop.register.chooseVariant")} · <b className="text-on-surface">{taka(picking.price)}</b>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {picking.variants.map((v) => (
              <button key={v.variant_id ?? "one"} type="button" onClick={() => addLine(picking, v)} title={v.sku ?? v.barcode ?? undefined} className={`rounded-xl border p-3 text-left ${v.available > 0 ? "border-border-light hover:border-accent-gold" : "border-border-light opacity-50"}`}>
                <span className="block text-sm font-bold text-on-surface">{v.label || t("shop.common.add")}</span>
                <span className={`block text-xs ${v.available > 0 ? "text-text-muted" : "text-badge-discount"}`}>{v.available > 0 ? t("shop.pos.left", { n: v.available }) : t("shop.register.soldOut")}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {popup === "add" && (
        <QuickAdd
          categories={categories}
          initialTab={addTab}
          defaultCategory={category}
          onClose={() => setPopup(null)}
          onSaved={(kind) => {
            cache.current.clear();
            if (kind === "category") gotCategories.current = false;
            void checkCatalog();
            void loadStock(showroomId);
            void list(q, false);
          }}
        />
      )}

      {popup === "note" && (
        <Dialog title={t("shop.common.note")} onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${field} min-h-24`} maxLength={500} placeholder={t("shop.register.noteHint")} autoFocus />
            <button type="button" className={btnPrimary} onClick={() => setPopup(null)}>
              {t("shop.register.done")}
            </button>
          </div>
        </Dialog>
      )}

      {popup === "more" && (
        <Dialog title={t("shop.register.more")} onClose={() => setPopup(null)}>
          <div className="flex flex-col divide-y divide-border-light -my-2">
            {[
              { id: "discount", icon: Ticket, label: t("shop.register.offers") },
              { id: "custom", icon: Shirt, label: t("shop.pos.tabs.custom") },
              { id: "clear", icon: Trash2, label: t("shop.register.clearBill") },
            ].map((item) => (
              <button key={item.id} type="button" disabled={item.id === "clear" && !lines.length} onClick={() => menuPick(item.id)} className="flex items-center gap-3 py-3 text-left text-sm font-semibold text-on-surface hover:text-primary disabled:opacity-40">
                <item.icon className="w-4 h-4 text-text-muted" /> {item.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {popup === "menu" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:pt-10" onClick={() => setPopup(null)} role="dialog" aria-modal="true" aria-label={t("shop.register.menu")}>
          <div className="w-full max-w-4xl rounded-lg bg-surface-card border border-border-light shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-primary/60 text-primary text-sm font-semibold max-w-[60%] truncate">
                <UserRound className="w-4 h-4 flex-shrink-0" /> {initials(userName)}
              </span>
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <button type="button" onClick={() => setPopup(null)} className="p-2 rounded-md text-text-muted hover:bg-surface-subtle" aria-label="Close">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {menuTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => void menuTile(tile.id)}
                  className={`h-28 sm:h-40 flex flex-col items-center justify-center gap-3 rounded-md border text-sm sm:text-base font-medium transition-colors ${
                    tile.danger
                      ? "border-transparent bg-gradient-to-br from-red-400 to-red-600 text-white hover:from-red-500 hover:to-red-700"
                      : "border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container"
                  }`}
                >
                  <tile.icon className={`w-6 h-6 ${tile.danger ? "text-white/80" : "text-text-muted"}`} />
                  <span className="px-2 text-center">{tile.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {customerDialog}

      {popup === "discount" && (
        <Dialog title={t("shop.register.offers")} onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.pos.coupon")}
              <span className="flex gap-2">
                <input
                  value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value.toUpperCase());
                    setCouponOff(null);
                  }}
                  className={`${field} font-normal`}
                />
                <button type="button" className={btnGhost} onClick={applyCoupon} disabled={!coupon.trim() || !lines.length}>
                  {t("shop.pos.apply")}
                </button>
              </span>
            </label>
            {couponOff && <p className="text-sm text-emerald-600">{t("shop.pos.couponOff", { code: couponOff.code })}: −{taka(couponOff.amount)}</p>}
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.pos.billDiscount")}
              <span className="flex gap-2">
                <input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} className={`${field} font-normal flex-1`} inputMode="decimal" />
                {paisa > 0 && (
                  <button type="button" className={btnGhost} onClick={roundOff} title={t("shop.register.roundOffHint")}>
                    <Coins className="w-4 h-4" /> {t("shop.register.roundOff", { amount: taka(paisa) })}
                  </button>
                )}
              </span>
            </label>
            {!canManage && <p className="text-xs text-text-muted">{t("shop.pos.discountLimit", { percent: maxDiscount })}</p>}
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.common.note")}
              <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} font-normal`} maxLength={500} />
            </label>
            {error && <p className="text-sm text-badge-discount">{error}</p>}
            <button type="button" className={btnPrimary} onClick={() => setPopup(null)}>
              {t("shop.register.done")}
            </button>
          </div>
        </Dialog>
      )}

      {popup === "held" && (
        <Dialog title={t("shop.pos.heldBills")} onClose={() => setPopup(null)}>
          {held.length === 0 ? (
            <p className="text-sm text-text-muted">{t("shop.register.noHeld")}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {held.map((h) => {
                const sum = (h.payload.lines ?? []).reduce((s, l) => s + l.price * l.quantity - lineDiscount(l), 0);
                return (
                  <li key={h.id} className="flex items-center gap-2 py-2">
                    <button type="button" className="flex-1 text-left min-w-0" onClick={() => resume(h)}>
                      <span className="block text-sm font-semibold truncate">{h.label || t("shop.sales.walkIn")}</span>
                      <span className="block text-xs text-text-muted">
                        {t("shop.register.pieces", { n: (h.payload.lines ?? []).reduce((s, l) => s + l.quantity, 0) })} · {taka(sum)}
                      </span>
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => resume(h)}>
                      {t("shop.register.resume")}
                    </button>
                    <button type="button" className="p-2 text-text-muted hover:text-badge-discount" onClick={() => void dropHeld(h.id)} aria-label={t("shop.common.remove")}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Dialog>
      )}

      {popup === "past" && (
        <Dialog title={t("shop.register.pastSales")} onClose={() => setPopup(null)} wide>
          <form
            className="flex gap-2 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              void loadPast(pastQ);
            }}
          >
            <input className={`${field} flex-1`} value={pastQ} onChange={(e) => setPastQ(e.target.value)} placeholder={t("shop.register.pastSearch")} autoFocus />
            <button type="submit" className={btnGhost}>
              <ScanLine className="w-4 h-4" />
            </button>
          </form>
          {error && <p className="text-sm text-badge-discount mb-2">{error}</p>}
          {past === null ? (
            <SkeletonRows count={5} className="py-2" label={t("shop.common.loading")} />
          ) : past.length === 0 ? (
            <p className="text-sm text-text-muted">{t("shop.register.noPastSales")}</p>
          ) : (
            <ul className="divide-y divide-border-light max-h-[60vh] overflow-y-auto">
              {past.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {s.receipt_no} · {s.customer_name || s.customer_phone || t("shop.sales.walkIn")}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {dateTime(s.created_at)} · {taka(s.total)}
                    </span>
                  </div>
                  <a className={`${btnGhost} !px-2`} href={`${REGISTER}/receipt/${s.id}?size=thermal`} target="_blank" rel="noreferrer" aria-label={t("shop.sales.reprint")}>
                    <Printer className="w-4 h-4" />
                  </a>
                  <button type="button" className={btnPrimary} disabled={busy} onClick={() => void copySale(s.id)}>
                    {t("shop.register.copyToBill")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}

      {popup === "drawer" && sessionOpen && (
        <Dialog title={t("shop.register.cashDrawer")} onClose={() => setPopup(null)} wide>
          <DayTab info={info} reload={loadInfo} />
        </Dialog>
      )}

      {/* Nothing can be sold until the drawer is counted and opened. */}
      {!sessionOpen && (
        <Dialog title={t("shop.day.openTitle")}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">{t("shop.register.openHint")}</p>
            {info.showrooms.length === 0 && <p className="text-sm text-badge-discount">{t("admin.store.noShops")}</p>}
            {info.showrooms.length > 1 && (
              <select value={openShop || showroomId} onChange={(e) => setOpenShop(e.target.value)} className={`${field} py-3 text-base`}>
                {info.showrooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.day.openingFloat")}
              <input value={float} onChange={(e) => setFloat(e.target.value)} className={`${field} py-3 text-lg font-normal`} inputMode="decimal" placeholder="0" autoFocus />
            </label>
            {error && <p className="text-sm text-badge-discount">{error}</p>}
            <button type="button" className="h-12 rounded-xl bg-accent-gold text-white font-bold hover:opacity-90 disabled:opacity-40" disabled={busy || info.showrooms.length === 0} onClick={openRegister}>
              {t("shop.register.openRegister")}
            </button>
            <Link href={OFFLINE} className={btnGhost}>
              <ArrowLeft className="w-4 h-4" /> {t("shop.register.backToShop")}
            </Link>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/**
 * One bill line. Swipe it to the right (finger or mouse) to show delete (leftmost,
 * asks first) and + / − (one piece more / less). A line with more pieces
 * than the shop has is red, and Payment stays closed until it is fixed.
 */
function BillLine({ line: l, stock, active, open, setOpen, onSelect, onQty, onRemove }: {
  line: CartLine;
  stock: number;
  active: boolean;
  open: boolean;
  setOpen: (on: boolean) => void;
  onSelect: () => void;
  onQty: (n: number) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const WIDTH = 112;
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const off = lineDiscount(l);
  const over = l.quantity > stock;
  const shift = drag ?? (open ? WIDTH : 0);

  return (
    <li className={`relative overflow-hidden border-l-4 ${over ? "border-badge-discount bg-badge-discount/10" : "border-transparent"}`}>
      <div className={`absolute inset-y-0 left-0 flex ${shift > 0 ? "" : "invisible"}`} style={{ width: WIDTH }} aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} onClick={onRemove} className="w-14 flex items-center justify-center bg-badge-discount text-white active:opacity-80" aria-label={t("shop.register.removeLine")}>
          <Trash2 className="w-5 h-5" />
        </button>
        <div className="flex flex-col w-14">
          <button type="button" tabIndex={open ? 0 : -1} onClick={() => onQty(l.quantity + 1)} className="flex-1 flex items-center justify-center bg-emerald-600 text-white active:opacity-80" aria-label="+1">
            <Plus className="w-5 h-5" />
          </button>
          <button type="button" tabIndex={open ? 0 : -1} onClick={() => onQty(l.quantity - 1)} className="flex-1 flex items-center justify-center bg-amber-500 text-white active:opacity-80" aria-label="-1">
            <Minus className="w-5 h-5" />
          </button>
        </div>
      </div>
      <button
        type="button"
        style={{ transform: `translateX(${shift}px)`, transition: drag === null ? "transform 150ms ease-out" : "none", touchAction: "pan-y" }}
        className={`relative block w-full text-left text-sm bg-surface-card ${over || active ? "" : "hover:bg-surface-subtle"}`}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, base: open ? WIDTH : 0 };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!moved.current && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - s.y))) return;
          if (!moved.current) e.currentTarget.setPointerCapture(e.pointerId);
          moved.current = true;
          setDrag(Math.max(0, Math.min(WIDTH, s.base + dx)));
        }}
        onPointerUp={() => {
          if (moved.current && drag !== null) setOpen(drag > WIDTH / 2);
          start.current = null;
          setDrag(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onClick={() => {
          if (moved.current) return void (moved.current = false);
          if (open) return setOpen(false);
          onSelect();
        }}
      >
        {/* Tint sits on an inner layer so the row stays opaque and the swipe buttons don't show through. */}
        <span className={`block px-3 py-2 ${over ? "bg-badge-discount/10" : active ? "bg-primary/10" : ""}`}>
        <span className="flex items-baseline gap-3">
          <b className={`tabular-nums ${over ? "text-badge-discount" : "text-on-surface"}`}>{l.quantity}</b>
          <span className="flex-1 min-w-0 truncate text-on-surface">{l.title}</span>
          <b className="whitespace-nowrap tabular-nums text-on-surface">{taka(Math.max(0, l.price * l.quantity - off))}</b>
        </span>
        {(l.label || off > 0 || over) && (
          <span className="block text-xs text-text-muted mt-0.5 pl-6">
            {l.label}
            {off > 0 && (
              <span className="text-emerald-600">
                {l.label && " · "}
                {l.pct != null ? `${l.pct}% ` : ""}−{taka(off)} ({t("shop.register.price")} {taka(l.price)})
              </span>
            )}
            {over && <span className="text-badge-discount font-semibold"> · {stock > 0 ? t("shop.register.onlyLeft", { n: stock }) : t("shop.register.soldOut")}</span>}
          </span>
        )}
        </span>
      </button>
    </li>
  );
}
