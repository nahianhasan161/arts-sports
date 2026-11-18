"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { CatalogProduct, PosCatalog, PosProduct, PosStock } from "./types";

/**
 * The register's catalogue, kept on this device (IndexedDB) so the register
 * opens and searches without waiting on the network.
 *
 * - `check()` asks the server "still version X?" and swaps in the whole new
 *   catalogue only when it changed (no partial updates, so no drift).
 * - `loadStock(shop)` fetches that shop's free stock: on open, after a sale,
 *   and on a timer. Stock is never trusted for the sale itself:
 *   pos_create_sale checks prices and stock again on the server.
 */

const DB = "artssports-pos";
const STORE = "kv";

/** A tiny key-value store on IndexedDB. Every failure reads as "nothing saved". */
function idbStorage(): StateStorage {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
    db().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    );
  return {
    getItem: (name) => run<string | undefined>("readonly", (s) => s.get(name) as IDBRequest<string | undefined>).then((v) => v ?? null).catch(() => null),
    setItem: (name, value) => run("readwrite", (s) => s.put(value, name)).then(() => undefined).catch(() => undefined),
    removeItem: (name) => run("readwrite", (s) => s.delete(name)).then(() => undefined).catch(() => undefined),
  };
}

interface CatalogState {
  catalog: PosCatalog | null;
  /** By showroom id. */
  stock: Record<string, PosStock>;
  hydrated: boolean;
  /** When the last check reached the server (ms), so focus/online checks don't pile up. */
  checkedAt: number;
  check: (force?: boolean) => Promise<void>;
  loadStock: (showroomId: string) => Promise<void>;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // offline: keep what we have
  }
}

let checking: Promise<void> | null = null;
const stockCalls = new Map<string, Promise<void>>();

export const usePosCatalog = create<CatalogState>()(
  persist(
    (set, get) => ({
      catalog: null,
      stock: {},
      hydrated: false,
      checkedAt: 0,
      check: (force = false) =>
        (checking ??= (async () => {
          const have = force ? "" : (get().catalog?.version ?? "");
          const res = await getJson<PosCatalog | { version: string; same: true }>(`/api/admin/pos/catalog${have ? `?have=${encodeURIComponent(have)}` : ""}`);
          if (res && "products" in res) set({ catalog: res });
          if (res) set({ checkedAt: Date.now() });
        })().finally(() => {
          checking = null;
        })),
      loadStock: (showroomId) => {
        if (!showroomId) return Promise.resolve();
        const running = stockCalls.get(showroomId);
        if (running) return running;
        const call = (async () => {
          const res = await getJson<PosStock>(`/api/admin/pos/stock?showroom_id=${encodeURIComponent(showroomId)}`);
          if (res) set({ stock: { ...get().stock, [res.showroom_id]: res, ...(res.showroom_id !== showroomId ? { [showroomId]: res } : {}) } });
        })().finally(() => stockCalls.delete(showroomId));
        stockCalls.set(showroomId, call);
        return call;
      },
    }),
    {
      name: "pos-catalog",
      version: 1,
      storage: createJSONStorage(() => idbStorage()),
      partialize: (s) => ({ catalog: s.catalog, stock: s.stock }),
      // Hydrated by the register (rehydrate()), never during server rendering.
      skipHydration: true,
      onRehydrateStorage: () => () => usePosCatalog.setState({ hydrated: true }),
    }
  )
);

/* ---------------------------------------------------------------------------
 * Search on the device copy. Same rules as pos_register_grid: an exact
 * barcode/SKU is a scan; otherwise title or SKU contains the text.
 * ------------------------------------------------------------------------- */

export interface LocalIndex {
  all: PosProduct[];
  meta: Map<string, CatalogProduct>;
  /** lowercase barcode/SKU -> [product, variant index] */
  codes: Map<string, { product: PosProduct; variant: number }[]>;
  text: Map<string, string>;
}

export function buildIndex(catalog: PosCatalog, stock: PosStock): LocalIndex {
  const all: PosProduct[] = [];
  const meta = new Map<string, CatalogProduct>();
  const codes = new Map<string, { product: PosProduct; variant: number }[]>();
  const text = new Map<string, string>();
  const addCode = (code: string | null, product: PosProduct, variant: number) => {
    if (!code) return;
    const k = code.trim().toLowerCase();
    if (!k) return;
    const list = codes.get(k) ?? [];
    if (!list.some((x) => x.product === product && x.variant === variant)) list.push({ product, variant });
    codes.set(k, list);
  };
  for (const c of catalog.products) {
    const p: PosProduct = {
      product_id: c.product_id,
      title: c.title,
      image: c.image,
      price: c.price,
      base_price: c.base_price,
      variants: c.variants.length
        ? c.variants.map((v) => ({ variant_id: v.variant_id, label: v.label, sku: v.sku, barcode: v.barcode, available: stock.variants[v.variant_id] ?? 0 }))
        : [{ variant_id: null, label: "", sku: null, barcode: null, available: stock.plain[c.product_id] ?? 0 }],
    };
    all.push(p);
    meta.set(p.product_id, c);
    c.variants.forEach((v, i) => {
      addCode(v.barcode, p, i);
      addCode(v.sku, p, i);
    });
    text.set(p.product_id, [c.title, c.sku ?? "", ...c.variants.map((v) => v.sku ?? "")].join("\n").toLowerCase());
  }
  return { all, meta, codes, text };
}

export function searchLocal(index: LocalIndex, term: string, category: string): { products: PosProduct[]; scanned: string | null } {
  const q = term.trim().toLowerCase();
  if (q) {
    const exact = index.codes.get(q);
    if (exact?.length) {
      const products = [...new Set(exact.map((e) => e.product))];
      const scanned = exact.length === 1 ? exact[0].product.variants[exact[0].variant].variant_id : null;
      return { products, scanned };
    }
    return { products: index.all.filter((p) => index.text.get(p.product_id)?.includes(q)), scanned: null };
  }
  if (!category) return { products: index.all, scanned: null };
  return {
    products: index.all.filter((p) => {
      const m = index.meta.get(p.product_id);
      return m?.category_id === category || m?.sub_category_id === category;
    }),
    scanned: null,
  };
}

/**
 * The device copy without stock (pickers that only need names and pictures):
 * reads the saved copy and checks it in the background, at most every 30 s.
 */
export function useCatalog() {
  const catalog = usePosCatalog((s) => s.catalog);
  useEffect(() => {
    const s = usePosCatalog.getState();
    const read = s.hydrated ? Promise.resolve() : Promise.resolve(usePosCatalog.persist.rehydrate());
    void read.then(() => {
      if (Date.now() - usePosCatalog.getState().checkedAt > 30_000) void usePosCatalog.getState().check();
    });
  }, []);
  return catalog;
}

/**
 * The device copy for one shop, ready to search: reads the saved copy, checks
 * the catalogue in the background, and keeps the shop's stock fresh (on open,
 * every 45 s, and when the tab comes back or the network returns; the
 * catalogue at most every 2 minutes). `index` is null until both the
 * catalogue and the shop's stock are here (first open on a new device):
 * screens then ask the server as before.
 */
export function useCatalogIndex(showroomId: string) {
  const catalog = usePosCatalog((s) => s.catalog);
  const shelf = usePosCatalog((s) => (showroomId ? s.stock[showroomId] : undefined));
  const check = usePosCatalog((s) => s.check);
  const loadStock = usePosCatalog((s) => s.loadStock);
  const hydrated = usePosCatalog((s) => s.hydrated);
  const index = useMemo(() => (catalog && shelf ? buildIndex(catalog, shelf) : null), [catalog, shelf]);

  useEffect(() => {
    void Promise.resolve(usePosCatalog.persist.rehydrate()).then(() => check());
  }, [check]);
  useEffect(() => {
    // After the saved copy is read, so it can't overwrite fresher stock.
    if (!showroomId || !hydrated) return;
    void loadStock(showroomId);
    const stale = (ms: number) => Date.now() - usePosCatalog.getState().checkedAt > ms;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadStock(showroomId);
      if (stale(120_000)) void check();
    }, 45_000);
    const back = () => {
      if (document.visibilityState !== "visible") return;
      void loadStock(showroomId);
      if (stale(30_000)) void check();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", back);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("online", back);
    };
  }, [showroomId, hydrated, loadStock, check]);

  return { catalog, index, check, loadStock };
}
