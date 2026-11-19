"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, FolderPlus, LayoutGrid, List, Menu, Monitor, Moon, PackagePlus, Plus, RotateCw, Search, Sun, Truck, UserRound, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAdminAccess } from "@/components/admin/access";
import { LanguageToggle } from "@/components/layout/Preferences";
import { useT } from "@/i18n/client";
import { thumbUrl } from "@/lib/media/thumb";
import { taka, type PosProduct, type PosVariant } from "@/lib/pos/types";
import { BUY, OFFLINE } from "@/components/admin/nav";
import PageSkeleton, { SkeletonRows, SkeletonTiles } from "@/components/ui/PageSkeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { Dialog, OrderPad, applyKey, type OrderMode, type PadKey } from "@/components/admin/pos/register/parts";
import type { Showroom, StockRow } from "@/components/admin/inventory/types";
import { methodKey, purchaseNo, SUPPLIER_PAY_METHODS, type PurchaseRow, type SupplierBalance, type SupplierFull, type SupplierPayMethod } from "@/lib/pos/purchase-types";
import { SupplierForm } from "./SupplierForm";
import { PurchaseList } from "./PurchaseList";
import { NewCategory, NewProduct } from "./QuickAdd";
import { searchLocal, useCatalogIndex } from "@/lib/pos/catalog-store";

interface Line {
  variant_id: string;
  title: string;
  label: string;
  in_shop: number;
  qty: number;
  cost: string; // "" = not known yet
}

interface Listing {
  products: PosProduct[];
  scanned: string | null;
  has_more?: boolean;
  categories?: { id: string; name: string; image?: string | null }[];
}

const n = (v: string) => Number(v) || 0;
const today = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // Dhaka date
const SUPPLIERS = `${OFFLINE}/suppliers`;
const PAGE = 60;

/**
 * Buying from a supplier, full screen and laid out like the register:
 * left the bill with the number pad (Qty / buying price), right the product
 * grid; a barcode scan goes straight into the bill. "Payment" opens the
 * second step (supplier invoice, discount, what was paid). Saving raises
 * the stock (supplier_purchase -> inventory_receive).
 */
export function PurchaseScreen() {
  const { t } = useT();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();
  const { offlineItems, userName } = useAdminAccess();
  const [menuOpen, setMenuOpen] = useState(false);

  const [ready, setReady] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierFull[]>([]);
  const [balances, setBalances] = useState<Map<string, SupplierBalance>>(new Map());
  const [supplierId, setSupplierId] = useState("");
  const [showrooms, setShowrooms] = useState<Showroom[]>([]);
  const [showroomId, setShowroomId] = useState("");

  const [serverCategories, setCategories] = useState<{ id: string; name: string; image?: string | null }[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [serverProducts, setProducts] = useState<PosProduct[] | null>(null);
  const [serverHasMore, setHasMore] = useState(false);
  // The catalogue kept on this device (same copy as the register). Once it and
  // this shop's stock are here, the grid, search and scans run locally.
  const { catalog, index, check: checkCatalog, loadStock } = useCatalogIndex(showroomId);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const haveIndex = index !== null;
  const [localView, setLocalView] = useState({ term: "", cat: "", count: PAGE });
  const localAll = useMemo(() => (index ? searchLocal(index, localView.term, localView.cat).products : null), [index, localView.term, localView.cat]);
  const products = localAll ? localAll.slice(0, localView.count) : serverProducts;
  const hasMore = localAll ? localAll.length > localView.count : serverHasMore;
  const categories = catalog ? catalog.categories : serverCategories;
  const [picking, setPicking] = useState<PosProduct | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const gotCategories = useRef(false);

  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<OrderMode>("qty");
  const [typed, setTyped] = useState<{ key: string; mode: OrderMode; text: string } | null>(null);

  const [reference, setReference] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [discount, setDiscount] = useState("");
  const [extra, setExtra] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<SupplierPayMethod>("cash");
  const [payRef, setPayRef] = useState("");
  const [fromDrawer, setFromDrawer] = useState(false);
  const [note, setNote] = useState("");

  const [screen, setScreen] = useState<"bill" | "pay">("bill");
  const [view, setView] = useState<"buy" | "list">("buy");
  const [pane, setPane] = useState<"products" | "bill">("products");
  const [newMenu, setNewMenu] = useState(false);
  const [popup, setPopup] = useState<"supplier" | "newSupplier" | "newProduct" | "newCategory" | "note" | null>(null);
  const [supplierQ, setSupplierQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; no: string; supplierId: string; total: number } | null>(null);
  const [list, setList] = useState<PurchaseRow[] | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const { toast } = useToast();
  const confirm = useConfirm();

  // ---- suppliers and shops --------------------------------------------------
  const loadSuppliers = useCallback(async (select?: string) => {
    const res = await api<{ suppliers: SupplierFull[]; balances: SupplierBalance[]; balances_error: string | null }>("/api/admin/inventory/suppliers");
    if (!res.ok) return setError(res.error);
    setSuppliers(res.data.suppliers);
    setBalances(new Map(res.data.balances.map((b) => [b.supplier_id, b])));
    if (res.data.balances_error) setError(res.data.balances_error);
    if (select) setSupplierId(select);
  }, []);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("supplier") ?? undefined;
    const timer = setTimeout(() => void loadSuppliers(wanted), 0);
    void api<{ showrooms: Showroom[]; showroom_id: string }>("/api/admin/inventory?ids=none").then((res) => {
      setReady(true);
      if (!res.ok) return setError(res.error);
      setShowrooms(res.data.showrooms);
      setShowroomId((c) => c || res.data.showroom_id);
    });
    return () => clearTimeout(timer);
  }, [loadSuppliers]);

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const balance = supplier ? balances.get(supplier.id) : undefined;

  // ---- the bill ---------------------------------------------------------------
  const addLine = useCallback(
    (p: PosProduct, v: PosVariant) => {
      const vid = v.variant_id;
      if (!vid) return;
      setDone(null);
      setPicking(null);
      setSelected(vid);
      setTyped(null);
      setMode("qty");
      setLines((current) => {
        const at = current.findIndex((l) => l.variant_id === vid);
        if (at >= 0) {
          const next = [...current];
          next[at] = { ...next[at], qty: next[at].qty + 1 };
          return next;
        }
        return [{ variant_id: vid, title: p.title, label: v.label, in_shop: v.available, qty: 1, cost: "" }, ...current];
      });
      // The last buying price comes from the stock list.
      void api<{ rows: StockRow[] }>(`/api/admin/inventory?ids=${encodeURIComponent(vid)}&showroom_id=${encodeURIComponent(showroomId)}`).then((res) => {
        if (!res.ok) return;
        const row = res.data.rows.find((r) => r.variant_id === vid);
        if (!row) return;
        setLines((c) => c.map((l) => (l.variant_id === vid ? { ...l, in_shop: row.quantity, cost: l.cost === "" && row.cost_price !== null ? String(row.cost_price) : l.cost } : l)));
      });
    },
    [showroomId]
  );

  const removeLine = (id: string) => {
    setLines((c) => {
      const next = c.filter((l) => l.variant_id !== id);
      setSelected(next[0]?.variant_id ?? null);
      return next;
    });
    setTyped(null);
  };

  const selectedLine = lines.find((l) => l.variant_id === selected) ?? null;

  function press(key: PadKey) {
    if (!selectedLine) return;
    const id = selectedLine.variant_id;
    // The first key after choosing a line starts fresh, like the register.
    const base = typed && typed.key === id && typed.mode === mode ? typed.text : "";
    if (mode === "qty") {
      if (key === ".") return;
      const text = applyKey(base, key);
      setTyped({ key: id, mode, text });
      if (key === "back" && text === "" && base === "") return removeLine(id);
      setLines((c) => c.map((l) => (l.variant_id === id ? { ...l, qty: Number(text) || 0 } : l)));
    } else {
      const text = applyKey(base, key);
      setTyped({ key: id, mode, text });
      setLines((c) => c.map((l) => (l.variant_id === id ? { ...l, cost: text } : l)));
    }
  }

  // Shown only; SQL works out the saved totals.
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * n(l.cost), 0), [lines]);
  const pieces = lines.reduce((s, l) => s + l.qty, 0);
  const payable = Math.max(0, subtotal - n(discount) + n(extra));
  const left = payable - n(paid);
  const missingCost = lines.filter((l) => l.cost.trim() === "").length;

  // ---- product grid -------------------------------------------------------------
  const listUrl = useCallback(
    (term: string, cat: string, offset: number) => {
      const params = new URLSearchParams({ showroom_id: showroomId });
      if (term) params.set("q", term);
      else {
        if (cat) params.set("category_id", cat);
        params.set("limit", String(PAGE));
        params.set("offset", String(offset));
      }
      if (!gotCategories.current) params.set("categories", "1");
      return `/api/admin/pos/products?${params}`;
    },
    [showroomId]
  );

  const load = useCallback(
    async (term: string, submitted: boolean) => {
      if (!showroomId) return;
      const mine = ++request.current;
      const local = indexRef.current;
      if (haveIndex && local) {
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
        // A scan the device copy doesn't know (just added): ask the server below.
        if (!(submitted && term && !found.products.length)) return setLocalView({ term, cat: category, count: PAGE });
        void checkCatalog();
      }
      const res = await api<Listing>(listUrl(term, category, 0));
      if (mine !== request.current) return;
      if (!res.ok) return setError(res.error);
      if (res.data.categories) {
        gotCategories.current = true;
        setCategories(res.data.categories);
      }
      // A scanner types the code and presses Enter: straight into the bill.
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
      setProducts(res.data.products);
      setHasMore(!term && Boolean(res.data.has_more));
    },
    // haveIndex: when the device copy first arrives, the search runs again on it.
    [showroomId, category, listUrl, addLine, checkCatalog, haveIndex]
  );

  useEffect(() => {
    const term = q.trim();
    const timer = setTimeout(() => void load(term, false), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, load]);

  async function loadMore() {
    if (localAll) return setLocalView((v) => ({ ...v, count: v.count + PAGE }));
    if (!products) return;
    const res = await api<Listing>(listUrl("", category, products.length));
    if (!res.ok) return setError(res.error);
    setProducts([...products, ...res.data.products]);
    setHasMore(Boolean(res.data.has_more));
  }

  // ---- the list of past purchases ---------------------------------------------
  useEffect(() => {
    if (view !== "list") return;
    let live = true;
    void api<{ purchases: PurchaseRow[] }>("/api/admin/purchases").then((res) => {
      if (!live) return;
      if (res.ok) setList(res.data.purchases);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [view, listVersion]);

  // ---- save -------------------------------------------------------------------------
  async function save() {
    if (!supplierId) {
      setError(t("shop.purchase.chooseSupplier"));
      return setPopup("supplier");
    }
    const items = lines.filter((l) => l.qty > 0);
    const ok = await confirm({
      title: t("shop.purchase.confirmSaveTitle"),
      description: t("shop.purchase.confirmSaveDesc", { items: items.length, total: taka(payable), paid: taka(n(paid)), due: taka(Math.max(0, left)) }),
      confirmText: t("shop.common.save"),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await api<{ id: string }>("/api/admin/purchases", {
      action: "create",
      supplier_id: supplierId,
      showroom_id: showroomId,
      reference,
      invoice_date: invoiceDate,
      note,
      items: items.map((l) => ({ variant_id: l.variant_id, quantity: l.qty, unit_cost: l.cost.trim() })),
      discount: n(discount),
      extra_cost: n(extra),
      paid: n(paid),
      method,
      pay_reference: payRef,
      from_drawer: fromDrawer && method === "cash",
    });
    setBusy(false);
    if (!res.ok) {
      toast(t("shop.purchase.saveFailed", { error: res.error }), "error");
      return setError(res.error);
    }
    const detail = await api<{ purchase: { receipt_no: number | null; id: string } }>(`/api/admin/purchases?id=${encodeURIComponent(res.data.id)}`);
    const no = detail.ok ? purchaseNo(detail.data.purchase) : "";
    setDone({ id: res.data.id, no, supplierId, total: payable });
    void loadStock(showroomId); // the shop's stock went up
    toast(t("shop.purchase.savedToast", { no }), "success");
    void loadSuppliers();
  }

  function newPurchase() {
    setDone(null);
    setScreen("bill");
    setLines([]);
    setSelected(null);
    setTyped(null);
    setReference("");
    setDiscount("");
    setExtra("");
    setPaid("");
    setPayRef("");
    setNote("");
    setFromDrawer(false);
    setError(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(OFFLINE);
  }

  if (!ready) return <PageSkeleton variant="register" className="h-screen" />;

  const supplierLabel = supplier ? supplier.name : t("shop.purchase.chooseSupplier");
  const chooseShop =
    showrooms.length > 1 ? (
      <select value={showroomId} onChange={(e) => setShowroomId(e.target.value)} className={field} aria-label={t("shop.purchase.branch")}>
        {showrooms.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    ) : null;
  // Product suppliers (and untagged ones) first; fabric/print/garments-only suppliers last.
  const sellsProducts = (x: SupplierFull) => !x.categories?.length || x.categories.includes("products");
  const shownSuppliers = suppliers
    .filter((s) => (s.is_active || s.id === supplierId) && (!supplierQ.trim() || `${s.name} ${s.phone ?? ""}`.toLowerCase().includes(supplierQ.trim().toLowerCase())))
    .sort((x, y) => Number(sellsProducts(y)) - Number(sellsProducts(x)));
  const money = (v: string, set: (v: string) => void, label: string) => (
    <label className="text-sm flex items-center justify-between gap-3">
      <span>{label}</span>
      <input value={v} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} !w-32 text-right`} inputMode="decimal" placeholder="0" />
    </label>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-surface text-on-surface overflow-hidden">
      <header className="h-14 flex items-center gap-2 px-2 border-b border-border-light bg-surface-card flex-shrink-0">
        <button type="button" onClick={goBack} className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-surface-subtle" aria-label={t("shop.register.backToShop")} title={t("shop.register.backToShop")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="hidden md:flex items-center gap-2 font-bold text-primary whitespace-nowrap">
          <PackagePlus className="w-5 h-5" /> {t("shop.purchase.title")}
        </span>
        <form
          className="relative flex-1 max-w-xl ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setView("buy");
            void load(q.trim(), true);
          }}
        >
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setPane("products")}
            placeholder={t("shop.purchase.searchPlaceholder")}
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
        <div className="relative flex-shrink-0">
          <button type="button" onClick={() => setNewMenu((o) => !o)} className="h-10 px-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 text-sm font-semibold" aria-haspopup="menu" aria-expanded={newMenu}>
            <Plus className="w-5 h-5" /> <span className="hidden sm:inline">{t("shop.purchase.newMenu")}</span> <ChevronDown className="w-4 h-4" />
          </button>
          {newMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNewMenu(false)} />
              <div role="menu" className="absolute right-0 top-full mt-1 z-50 w-52 rounded-md border border-border-light bg-surface-card shadow-lg py-1">
                {([
                  ["newSupplier", Truck],
                  ["newCategory", FolderPlus],
                  ["newProduct", PackagePlus],
                ] as const).map(([key, Icon]) => (
                  <button key={key} type="button" role="menuitem" onClick={() => { setNewMenu(false); setPopup(key); }} className="w-full px-3 py-2 flex items-center gap-2 text-sm text-on-surface hover:bg-surface-subtle text-left">
                    <Icon className="w-4 h-4 text-on-surface-variant" /> {t(`shop.purchase.${key}`)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={() => setView(view === "list" ? "buy" : "list")} className={`h-10 px-3 rounded-md border text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 ${view === "list" ? "border-primary bg-primary/10 text-primary" : "border-border-light text-on-surface-variant hover:bg-surface-subtle"}`}>
          {view === "list" ? <LayoutGrid className="w-5 h-5" /> : <List className="w-5 h-5" />}
          <span className="hidden sm:inline">{view === "list" ? t("shop.purchase.tabs.new") : t("shop.purchase.tabs.list")}</span>
        </button>
        {showrooms.length > 0 && (
          <span className="hidden md:flex h-9 px-3 items-center rounded-md bg-primary text-primary-foreground text-sm font-bold max-w-[10rem] truncate">{showrooms.find((s) => s.id === showroomId)?.name ?? "—"}</span>
        )}
        <button type="button" onClick={() => setMenuOpen(true)} className="h-10 w-10 flex items-center justify-center rounded-md text-on-surface hover:bg-surface-subtle flex-shrink-0" aria-label={t("shop.register.menu")} title={t("shop.register.menu")}>
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:pt-10" onClick={() => setMenuOpen(false)} role="dialog" aria-modal="true" aria-label={t("shop.register.menu")}>
          <div className="w-full max-w-4xl max-h-full overflow-y-auto rounded-lg bg-surface-card border border-border-light shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-primary/60 text-primary text-sm font-semibold max-w-[60%] truncate">
                <UserRound className="w-4 h-4 flex-shrink-0" /> {userName}
              </span>
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <button type="button" onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-text-muted hover:bg-surface-subtle" aria-label={t("shop.common.cancel")}>
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "full", icon: Monitor, label: t("shop.register.fullScreen") },
                { id: "theme", icon: theme === "dark" ? Sun : Moon, label: theme === "dark" ? t("shop.register.lightMode") : t("shop.register.darkMode") },
                { id: "reload", icon: RotateCw, label: t("shop.register.reloadData") },
                ...offlineItems.filter((i) => i.href !== BUY).map((i) => ({ id: i.href, icon: i.icon, label: t(`admin.nav.${i.id}.name`), open: i.open })),
              ].map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => {
                    if (tile.id === "theme") return toggleTheme();
                    setMenuOpen(false);
                    if (tile.id === "full") {
                      if (document.fullscreenElement) void document.exitFullscreen();
                      else void document.documentElement.requestFullscreen?.().catch(() => {});
                    } else if (tile.id === "reload") {
                      void loadSuppliers();
                      void checkCatalog(true);
                      void loadStock(showroomId);
                      void load(q.trim(), true);
                    } else if ("open" in tile && tile.open) window.open(tile.id, "_blank");
                    else router.push(tile.id);
                  }}
                  className="h-28 sm:h-36 flex flex-col items-center justify-center gap-3 rounded-md border border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container text-sm sm:text-base font-medium transition-colors"
                >
                  <tile.icon className="w-6 h-6 text-text-muted" />
                  <span className="px-2 text-center">{tile.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "list" ? (
        <div className="flex-1 overflow-y-auto p-3">
          {list === null ? <SkeletonRows count={8} label={t("shop.common.loading")} className="p-0" /> : <PurchaseList rows={list} onChanged={() => setListVersion((v) => v + 1)} />}
        </div>
      ) : done ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-6 text-center flex flex-col gap-3">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <h2 className="font-display text-xl font-bold text-primary">{t("shop.purchase.saved", { no: done.no })}</h2>
            <p className="text-4xl font-bold tabular-nums">{taka(done.total)}</p>
            <Link href={`${SUPPLIERS}/${done.supplierId}`} className={btnGhost}>
              <Truck className="w-4 h-4" /> {t("shop.purchase.openSupplier")}
            </Link>
            <button type="button" className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold hover:opacity-90" autoFocus onClick={newPurchase}>
              {t("shop.purchase.another")}
            </button>
          </div>
        </div>
      ) : screen === "pay" ? (
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
            <button type="button" onClick={() => setScreen("bill")} className={`${btnGhost} self-start`}>
              <ArrowLeft className="w-4 h-4" /> {t("shop.purchase.backToBill")}
            </button>
            <div className="rounded-2xl border border-border-light bg-surface-card p-4 flex flex-col gap-3">
              <button type="button" onClick={() => setPopup("supplier")} className={`h-12 px-3 rounded-md border text-left text-sm font-semibold flex items-center gap-2 ${supplier ? "border-primary bg-primary/10" : "border-badge-discount text-badge-discount"}`}>
                <Truck className="w-4 h-4" /> {supplierLabel}
              </button>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-text-muted flex flex-col gap-1">
                  {t("shop.purchase.reference")}
                  <input value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
                </label>
                <label className="text-xs text-text-muted flex flex-col gap-1">
                  {t("shop.purchase.invoiceDate")}
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={field} />
                </label>
                {chooseShop && (
                  <label className="text-xs text-text-muted flex flex-col gap-1 sm:col-span-2">
                    {t("shop.purchase.branch")}
                    {chooseShop}
                  </label>
                )}
              </div>
              <div className="border-t border-border-light pt-3 flex flex-col gap-2">
                <p className="text-sm flex justify-between">
                  <span>
                    {t("shop.purchase.subtotal")} <span className="text-xs text-text-muted">· {t("shop.purchase.pieces", { lines: lines.length, n: pieces })}</span>
                  </span>
                  <b className="tabular-nums">{taka(subtotal)}</b>
                </p>
                {money(discount, setDiscount, t("shop.purchase.discount"))}
                {money(extra, setExtra, t("shop.purchase.extraCost"))}
                <p className="flex justify-between items-baseline">
                  <span className="font-bold">{t("shop.purchase.payable")}</span>
                  <span className="text-3xl font-bold tabular-nums">{taka(payable)}</span>
                </p>
              </div>
              <div className="border-t border-border-light pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{t("shop.purchase.paidNow")}</span>
                  <div className="flex gap-1">
                    <button type="button" className={`${btnGhost} !px-2 !py-1 text-xs`} onClick={() => setPaid(String(payable))} disabled={!payable}>
                      {taka(payable)}
                    </button>
                    <input value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} !w-32 text-right`} inputMode="decimal" placeholder="0" />
                  </div>
                </div>
                {n(paid) > 0 && (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {SUPPLIER_PAY_METHODS.map((m) => (
                        <button key={m} type="button" onClick={() => setMethod(m)} className={`h-11 rounded-md text-sm font-semibold border ${method === m ? "bg-primary text-white border-primary" : "border-border-light bg-surface-subtle hover:bg-surface-container"}`}>
                          {t(methodKey(m))}
                        </button>
                      ))}
                    </div>
                    {method === "cash" ? (
                      <label className="text-sm flex items-center gap-2">
                        <input type="checkbox" checked={fromDrawer} onChange={(e) => setFromDrawer(e.target.checked)} />
                        {t("shop.purchase.fromDrawer")}
                      </label>
                    ) : (
                      <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={t("shop.purchase.payReference")} className={field} />
                    )}
                  </>
                )}
                <p className={`text-sm font-semibold ${left > 0 ? "text-badge-discount" : left < 0 ? "text-amber-700 dark:text-amber-400" : "text-green-700"}`}>
                  {left >= 0 ? t("shop.purchase.dueAfter", { amount: taka(left) }) : t("shop.purchase.overpaid", { amount: taka(-left) })}
                </p>
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.common.note")} className={field} />
              {missingCost > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("shop.purchase.noCost", { n: missingCost })}</p>}
              {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}
              <button type="button" className="h-16 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 disabled:opacity-50" disabled={busy || !lines.some((l) => l.qty > 0)} onClick={save}>
                {busy ? t("shop.common.saving") : t("shop.purchase.save")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* The bill */}
          <section className={`${pane === "bill" ? "flex" : "hidden"} lg:flex w-full lg:w-[420px] xl:w-[450px] flex-col bg-surface-card border-r border-border-light flex-shrink-0`}>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-text-muted p-6 text-center">
                  <PackagePlus className="w-10 h-10 opacity-40" />
                  <p className="text-sm">{t("shop.purchase.emptyBill")}</p>
                </div>
              ) : (
                <ul>
                  {lines.map((l) => {
                    const active = l.variant_id === selected;
                    const noCost = l.cost.trim() === "";
                    return (
                      <li key={l.variant_id}>
                        <button
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm ${active ? "bg-primary/10" : "hover:bg-surface-subtle"}`}
                          onClick={() => {
                            setSelected(l.variant_id);
                            setTyped(null);
                          }}
                        >
                          <span className="flex items-baseline gap-3">
                            <b className="tabular-nums text-on-surface">{l.qty}</b>
                            <span className="flex-1 min-w-0 truncate text-on-surface">{l.title}</span>
                            <b className="whitespace-nowrap tabular-nums text-on-surface">{noCost ? "—" : taka(l.qty * n(l.cost))}</b>
                          </span>
                          <span className="block text-xs text-text-muted mt-0.5 pl-6">
                            {l.label && `${l.label} · `}
                            <span className={noCost ? "text-amber-700 dark:text-amber-400 font-semibold" : ""}>
                              {t("shop.purchase.unitCost")} {noCost ? "?" : taka(n(l.cost))}
                            </span>
                            {" · "}
                            {t("shop.purchase.inShop", { n: l.in_shop })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="px-2 pb-2 flex flex-col gap-2 flex-shrink-0">
              <div className="px-1 pt-2 border-t border-border-light">
                <p className="flex justify-between items-baseline text-on-surface">
                  <span className="font-bold">
                    {t("shop.register.total")} <span className="text-xs font-normal text-text-muted">· {t("shop.register.pieces", { n: pieces })}</span>
                  </span>
                  <span className="text-lg font-bold tabular-nums">{taka(subtotal)}</span>
                </p>
                {missingCost > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("shop.purchase.noCost", { n: missingCost })}</p>}
              </div>
              {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}

              <div className="flex gap-2 border-t border-border-light pt-2">
                <button type="button" onClick={() => setPopup("supplier")} className={`h-10 px-3 rounded-md border text-sm flex-1 min-w-0 truncate text-left ${supplier ? "border-primary bg-primary/10 text-on-surface font-semibold" : "border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container"}`}>
                  {supplierLabel}
                  {balance && balance.due !== 0 && <span className="text-xs font-normal text-text-muted"> · {balance.due > 0 ? t("shop.purchase.owe", { amount: taka(balance.due) }) : t("shop.purchase.advance", { amount: taka(-balance.due) })}</span>}
                </button>
                <button type="button" onClick={() => setPopup("note")} className={`h-10 px-3 rounded-md border text-sm ${note ? "border-primary bg-primary/10 font-semibold" : "border-border-light bg-surface-subtle hover:bg-surface-container"} text-on-surface`}>
                  {t("shop.common.note")}
                </button>
              </div>

              <OrderPad
                onKey={press}
                onSign={() => selectedLine && removeLine(selectedLine.variant_id)}
                mode={mode}
                setMode={(m) => {
                  setMode(m);
                  setTyped(null);
                }}
                disabled={!selectedLine}
                noDisc
                labels={{ qty: t("shop.common.qty"), price: t("shop.purchase.costShort"), sign: t("shop.register.removeLine") }}
              />

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setScreen("pay");
                }}
                disabled={!lines.length}
                className="h-16 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {t("shop.register.payment")}
              </button>
            </div>
          </section>

          {/* Products */}
          <section className={`${pane === "products" ? "flex" : "hidden"} lg:flex flex-1 min-w-0 flex-col bg-surface`}>
            <div className="flex-1 overflow-y-auto p-2">
              {!q && categories.length > 0 && (
                <div className="flex flex-nowrap gap-2 mb-3 overflow-x-auto no-scrollbar snap-x pb-1">
                  {[{ id: "", name: t("shop.register.all"), image: null }, ...categories].map((c) => (
                    <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`relative shrink-0 snap-start min-w-[10rem] h-16 px-4 rounded-md text-sm font-medium text-on-surface transition overflow-hidden flex items-center gap-2 ${category === c.id ? "bg-accent-gold/70 ring-2 ring-accent-gold" : "bg-accent-gold/30 hover:bg-accent-gold/45"}`}>
                      {c.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl(c.image)} onError={(e) => { const img = e.currentTarget; if (img.dataset.fallback || !c.image) return; img.dataset.fallback = "1"; img.src = c.image; }} alt="" loading="lazy" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                      ) : null}
                      <span className="flex-1 text-center">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {products === null ? (
                <SkeletonTiles label={t("shop.common.loading")} />
              ) : products.length === 0 ? (
                <p className="text-sm text-text-muted p-4">{t("shop.purchase.noResults")}</p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {products.map((p) => {
                    const variants = p.variants.filter((v) => v.variant_id);
                    const stock = variants.reduce((s, v) => s + v.available, 0);
                    const inBill = lines.filter((l) => variants.some((v) => v.variant_id === l.variant_id)).reduce((s, l) => s + l.qty, 0);
                    return (
                      <li key={p.product_id}>
                        <button
                          type="button"
                          disabled={!variants.length}
                          onClick={() => (variants.length === 1 ? addLine(p, variants[0]) : setPicking(p))}
                          title={p.title}
                          className={`group relative w-full h-40 flex flex-col text-left rounded-md border bg-surface-card overflow-hidden border-b-4 transition active:scale-[0.98] disabled:opacity-40 ${inBill ? "border-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"}`}
                        >
                          {p.image ? (
                            <span className="relative flex-1 min-h-0 bg-surface-subtle">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbUrl(p.image)}
                                alt=""
                                loading="lazy"
                                decoding="async"
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
                          <span className={`absolute top-1 right-1 rounded text-[11px] font-semibold px-1.5 py-0.5 tabular-nums ${stock > 0 ? "bg-surface-card/90 text-on-surface" : "bg-badge-discount text-white"}`}>{t("shop.purchase.inShop", { n: stock })}</span>
                          {inBill > 0 && <span className="absolute bottom-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-md bg-neutral-900 text-white text-xs font-bold flex items-center justify-center tabular-nums">{inBill}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {hasMore && !q && (
                <div className="flex justify-center p-3">
                  <button type="button" className={btnGhost} onClick={() => void loadMore()}>
                    {t("shop.purchase.more")}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Phones: switch between the products and the bill. */}
      {view === "buy" && !done && screen === "bill" && (
        <div className="lg:hidden grid grid-cols-2 border-t border-border-light bg-surface-card flex-shrink-0">
          <button type="button" onClick={() => setPane("products")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "products" ? "text-accent-gold" : "text-on-surface-variant"}`}>
            <LayoutGrid className="w-4 h-4" /> {t("shop.register.products")}
          </button>
          <button type="button" onClick={() => setPane("bill")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "bill" ? "text-accent-gold" : "text-on-surface-variant"}`}>
            <PackagePlus className="w-4 h-4" /> {taka(subtotal)}
            {pieces > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-accent-gold text-white text-[11px] font-bold flex items-center justify-center">{pieces}</span>}
          </button>
        </div>
      )}

      {picking && (
        <Dialog title={picking.title} onClose={() => setPicking(null)}>
          <p className="text-sm text-text-muted mb-3">{t("shop.register.chooseVariant")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {picking.variants
              .filter((v) => v.variant_id)
              .map((v) => (
                <button key={v.variant_id} type="button" onClick={() => addLine(picking, v)} title={v.sku ?? v.barcode ?? undefined} className="rounded-xl border border-border-light hover:border-accent-gold p-3 text-left">
                  <span className="block text-sm font-bold text-on-surface">{v.label || t("shop.common.add")}</span>
                  <span className="block text-xs text-text-muted">{t("shop.purchase.inShop", { n: v.available })}</span>
                </button>
              ))}
          </div>
        </Dialog>
      )}

      {popup === "supplier" && (
        <Dialog title={t("shop.purchase.supplier")} onClose={() => setPopup(null)} wide>
          <div className="flex gap-2 mb-3">
            <input value={supplierQ} onChange={(e) => setSupplierQ(e.target.value)} placeholder={t("shop.supplier.search")} className={`${field} flex-1`} autoFocus />
            <button type="button" className={btnGhost} onClick={() => setPopup("newSupplier")}>
              <Plus className="w-4 h-4" /> {t("shop.purchase.newSupplier")}
            </button>
          </div>
          {shownSuppliers.length === 0 ? (
            <p className="text-sm text-text-muted">{t("shop.purchase.noSupplier")}</p>
          ) : (
            <ul className="divide-y divide-border-light max-h-[60vh] overflow-y-auto">
              {shownSuppliers.map((s) => {
                const b = balances.get(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setError(null);
                        setPopup(null);
                      }}
                      className={`w-full text-left py-2.5 px-2 rounded flex items-center gap-3 ${s.id === supplierId ? "bg-primary/10" : "hover:bg-surface-subtle"}`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate">{s.name}</span>
                        <span className="block text-xs text-text-muted truncate">{[s.contact_person, s.phone].filter(Boolean).join(" · ")}</span>
                      </span>
                      {b && b.due !== 0 && (
                        <span className={`text-xs font-semibold ${b.due > 0 ? "text-badge-discount" : "text-green-700"}`}>{b.due > 0 ? t("shop.purchase.owe", { amount: taka(b.due) }) : t("shop.purchase.advance", { amount: taka(-b.due) })}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {supplier && (
            <div className="mt-3 flex justify-between gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setSupplierId("");
                  setPopup(null);
                }}
              >
                {t("shop.common.remove")}
              </button>
              <Link href={`${SUPPLIERS}/${supplier.id}`} className={btnGhost}>
                {t("shop.purchase.openSupplier")}
              </Link>
            </div>
          )}
        </Dialog>
      )}

      {popup === "newSupplier" && (
        <Dialog title={t("shop.purchase.newSupplier")} onClose={() => setPopup(null)} wide>
          <SupplierForm
            onCancel={() => setPopup(null)}
            onSaved={(id) => {
              setPopup(null);
              void loadSuppliers(id);
            }}
          />
        </Dialog>
      )}

      {popup === "newProduct" && (
        <NewProduct
          onClose={() => setPopup(null)}
          onSaved={() => {
            setPopup(null);
            gotCategories.current = false;
            setView("buy");
            void checkCatalog();
            void load(q.trim(), false);
          }}
        />
      )}

      {popup === "newCategory" && (
        <Dialog title={t("shop.purchase.newCategory")} onClose={() => setPopup(null)}>
          <NewCategory
            onCancel={() => setPopup(null)}
            onSaved={() => {
              setPopup(null);
              gotCategories.current = false;
              void checkCatalog();
              void load(q.trim(), false);
            }}
          />
        </Dialog>
      )}

      {popup === "note" && (
        <Dialog title={t("shop.common.note")} onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${field} min-h-24`} maxLength={500} autoFocus />
            <button type="button" className={btnPrimary} onClick={() => setPopup(null)}>
              {t("shop.register.done")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
