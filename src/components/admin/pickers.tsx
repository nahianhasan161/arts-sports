"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { api } from "@/components/admin/pos/api";

/**
 * Search-as-you-type boxes for things we already have on file, so staff pick
 * an existing customer or supplier instead of typing them in again.
 *
 *   <CustomerInput value={phone} onChange={setPhone} onPick={(c) => { setPhone(c.phone); setName(c.name ?? ""); }} />
 *   <SupplierPicker suppliers={list} value={supplierId} onChange={setSupplierId} />
 */

export interface CustomerHit {
  id: string;
  phone: string;
  name: string | null;
  email?: string | null;
  is_blacklisted: boolean;
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

/** Arrow keys / Enter / Escape over a list of options. */
function useListKeys<T>(items: T[], open: boolean, onPick: (item: T) => void, onClose: () => void) {
  const [active, setActive] = useState(-1);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setActive(-1);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      onPick(items[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }
  return { active, onKeyDown };
}

const menu = "absolute left-0 right-0 top-full mt-1 z-[60] max-h-64 overflow-y-auto rounded-md border border-border-light bg-surface-card shadow-lg divide-y divide-border-light";
const row = (on: boolean) => `w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm ${on ? "bg-primary/10" : "hover:bg-surface-subtle"}`;

/**
 * A text box (phone or name) that suggests customers from the shared list
 * (website + shop) while typing. Typing a new person is still allowed.
 */
export function CustomerInput({ value, onChange, onPick, className, minChars = 2, ...rest }: InputProps & { value: string; onChange: (v: string) => void; onPick: (c: CustomerHit) => void; minChars?: number }) {
  const { t } = useT();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<{ q: string; list: CustomerHit[] } | null>(null);
  const q = value.trim();
  const searching = open && q.length >= minChars;

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<{ customers: CustomerHit[] }>(`/api/admin/pos/customer?q=${encodeURIComponent(q)}`).then((res) => {
        if (!cancelled) setHits({ q, list: res.ok ? res.data.customers ?? [] : [] });
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searching, q]);

  const ready = hits?.q === q;
  const list = useMemo(() => (ready ? hits.list : []), [ready, hits]);
  // A number that is already exactly one customer's needs no menu.
  const exact = list.length === 1 && list[0].phone === q;
  const show = searching && !exact;
  const pick = (c: CustomerHit) => {
    onPick(c);
    setOpen(false);
  };
  const { active, onKeyDown } = useListKeys(list, show, pick, () => setOpen(false));

  return (
    <div className="relative">
      <input
        {...rest}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setTimeout(() => setOpen(false), 150);
          rest.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown(e);
          rest.onKeyDown?.(e);
        }}
        className={`${className ?? ""} w-full`}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
      />
      {show && (
        <div id={listId} role="listbox" className={menu}>
          {!ready ? (
            <div className="px-3 py-2 text-sm text-text-muted">{t("shop.common.loading")}</div>
          ) : list.length ? (
            list.map((c, i) => (
              <button key={c.id} type="button" role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)} className={row(i === active)}>
                <span className="min-w-0">
                  <span className="block font-semibold text-on-surface truncate">{c.name || c.phone}</span>
                  <span className="block text-xs text-text-muted tabular-nums">{c.phone}{c.email ? ` · ${c.email}` : ""}</span>
                </span>
                {c.is_blacklisted && <span className="text-xs text-badge-discount font-semibold shrink-0">{t("shop.pos.blacklisted")}</span>}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-text-muted">{t("shop.register.noCustomerFound")}</div>
          )}
        </div>
      )}
    </div>
  );
}

export interface SupplierOption {
  id: string;
  name: string;
  phone?: string | null;
}

/**
 * Pick a supplier by typing part of the name or phone. Replaces a plain
 * <select>, which gets hard to use once the list is long.
 */
export function SupplierPicker({ suppliers, value, onChange, placeholder, className, id }: { suppliers: SupplierOption[]; value: string; onChange: (id: string) => void; placeholder?: string; className?: string; id?: string }) {
  const { t } = useT();
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chosen = suppliers.find((s) => s.id === value) ?? null;

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    const all = term ? suppliers.filter((s) => s.name.toLowerCase().includes(term) || (digits.length >= 3 && (s.phone ?? "").replace(/\D/g, "").includes(digits))) : suppliers;
    return all.slice(0, 50);
  }, [suppliers, q]);

  const pick = (s: SupplierOption) => {
    onChange(s.id);
    setQ("");
    setOpen(false);
    box.current?.blur();
  };
  const { active, onKeyDown } = useListKeys(list, open, pick, () => setOpen(false));

  return (
    <div className="relative">
      <input
        ref={box}
        id={id}
        value={open ? q : chosen?.name ?? ""}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={open && chosen ? chosen.name : placeholder ?? t("shop.picker.searchSupplier")}
        className={`${className ?? ""} w-full pr-14`}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {chosen && !open && (
          <button type="button" onClick={() => onChange("")} className="p-1 text-text-muted hover:text-on-surface" aria-label={t("shop.picker.clear")} title={t("shop.picker.clear")}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className="w-4 h-4 text-text-muted pointer-events-none" />
      </span>
      {open && (
        <div id={listId} role="listbox" className={menu}>
          {list.length ? (
            list.map((s, i) => (
              <button key={s.id} type="button" role="option" aria-selected={s.id === value} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className={row(i === active || s.id === value)}>
                <span className="font-semibold text-on-surface truncate">{s.name}</span>
                {s.phone && <span className="text-xs text-text-muted tabular-nums shrink-0">{s.phone}</span>}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-text-muted">{t("shop.purchase.noSupplier")}</div>
          )}
        </div>
      )}
    </div>
  );
}
