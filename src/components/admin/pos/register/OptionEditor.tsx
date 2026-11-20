"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { newOptionId } from "@/lib/custom-jersey/pricing";
import type { CollarOption, ExtraOption, Fabric, JerseyOption, JerseyOptions, OptionGroup, SizeOption, SleeveOption } from "@/lib/custom-jersey/types";
import { api, btnGhost, btnPrimary, field } from "../api";
import { Dialog } from "./parts";

type AnyOption = SleeveOption | CollarOption | ExtraOption | JerseyOption | SizeOption;

const label = "flex flex-col gap-1";
const caption = "text-xs font-semibold text-on-surface-variant";
const num = (v: string) => (v.trim() === "" ? null : Number(v));

/**
 * Add / edit / delete one choice in a POS custom jersey list (sleeve, collar,
 * extra, logo, size). Saves the whole list through /api/admin/pos/custom-options
 * and hands the saved lists back.
 */
export function OptionDialog({
  group,
  item,
  options,
  jerseyType,
  onSaved,
  onClose,
}: {
  group: OptionGroup;
  /** null = a new one. */
  item: AnyOption | null;
  options: JerseyOptions;
  /** A new collar starts on the jersey type being worked on. */
  jerseyType: "round" | "polo";
  onSaved: (options: JerseyOptions) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const o = (item ?? {}) as Partial<SleeveOption & CollarOption & ExtraOption & SizeOption>;
  const [nameEn, setNameEn] = useState(o.name_en ?? "");
  const [nameBn, setNameBn] = useState(o.name_bn ?? "");
  const [price, setPrice] = useState(o.price === undefined ? "" : String(o.price));
  const [full, setFull] = useState(o.full === true);
  const [type, setType] = useState<"round" | "polo">(o.type ?? jerseyType);
  const [means, setMeans] = useState<ExtraOption["means"]>(o.means ?? null);
  const [sizeLabel, setSizeLabel] = useState(o.label ?? "");
  const [chest, setChest] = useState(o.chest == null ? "" : String(o.chest));
  const [length, setLength] = useState(o.length == null ? "" : String(o.length));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);

  const isSize = group === "sizes";
  const list = options[group] as AnyOption[];

  async function put(items: AnyOption[]) {
    setBusy(true);
    setError(null);
    const res = await api<{ options: JerseyOptions }>("/api/admin/pos/custom-options", { group, items }, "PUT");
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved(res.data.options);
    onClose();
  }

  function save() {
    const id = item?.id ?? newOptionId();
    let next: AnyOption;
    if (isSize) {
      const l = sizeLabel.trim().toUpperCase();
      if (!l) return setError(t("shop.customOpt.needLabel"));
      if (list.some((x) => x.id !== id && (x as SizeOption).label === l)) return setError(t("shop.customOpt.sameLabel"));
      const c = num(chest);
      const h = num(length);
      if ((c !== null && !(c >= 4 && c <= 80)) || (h !== null && !(h >= 4 && h <= 80))) return setError(t("shop.customOpt.badInches"));
      next = { id, label: l, chest: c, length: h };
    } else {
      if (!nameEn.trim() && !nameBn.trim()) return setError(t("shop.customOpt.needName"));
      const p = price.trim() === "" ? 0 : Number(price);
      if (!Number.isFinite(p) || p < 0) return setError(t("shop.customOpt.badPrice"));
      const base: JerseyOption = { id, name_en: nameEn.trim() || nameBn.trim(), name_bn: nameBn.trim() || null, price: p };
      next = group === "sleeves" ? { ...base, full } : group === "collars" ? { ...base, type } : group === "extras" ? { ...base, means } : base;
    }
    void put(item ? list.map((x) => (x.id === item.id ? next : x)) : [...list, next]);
  }

  const title = `${item ? t("shop.customOpt.edit") : t("shop.customOpt.add")} · ${t(`shop.customOpt.groups.${group}`)}`;
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {isSize ? (
          <>
            <label className={label}>
              <span className={caption}>{t("shop.customOpt.sizeLabel")}</span>
              <input autoFocus value={sizeLabel} maxLength={12} onChange={(e) => setSizeLabel(e.target.value)} placeholder="XL" className={`${field} h-11 text-base uppercase`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>
                <span className={caption}>{t("shop.customOpt.chest")}</span>
                <input value={chest} onChange={(e) => setChest(e.target.value)} inputMode="decimal" placeholder="42" className={`${field} h-11 text-base`} />
              </label>
              <label className={label}>
                <span className={caption}>{t("shop.customOpt.length")}</span>
                <input value={length} onChange={(e) => setLength(e.target.value)} inputMode="decimal" placeholder="29" className={`${field} h-11 text-base`} />
              </label>
            </div>
          </>
        ) : (
          <>
            <label className={label}>
              <span className={caption}>{t("shop.customOpt.nameBn")}</span>
              <input autoFocus value={nameBn} maxLength={60} onChange={(e) => setNameBn(e.target.value)} className={`${field} h-11 text-base`} />
            </label>
            <label className={label}>
              <span className={caption}>{t("shop.customOpt.nameEn")}</span>
              <input value={nameEn} maxLength={60} onChange={(e) => setNameEn(e.target.value)} className={`${field} h-11 text-base`} />
            </label>
            <label className={label}>
              <span className={caption}>{t("shop.customOpt.price")}</span>
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0" className={`${field} h-11 text-base`} />
              <span className="text-[11px] text-text-muted">{t("shop.customOpt.priceHint")}</span>
            </label>
            {group === "sleeves" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} className="w-4 h-4" />
                {t("shop.customOpt.longSleeve")}
              </label>
            )}
            {group === "collars" && (
              <label className={label}>
                <span className={caption}>{t("shop.customOpt.forType")}</span>
                <select value={type} onChange={(e) => setType(e.target.value === "polo" ? "polo" : "round")} className={`${field} h-11`}>
                  <option value="round">{t("customJersey.options.round")}</option>
                  <option value="polo">{t("customJersey.options.polo")}</option>
                </select>
              </label>
            )}
            {group === "extras" && (
              <label className={label}>
                <span className={caption}>{t("shop.customOpt.means")}</span>
                <select value={means ?? ""} onChange={(e) => setMeans(e.target.value === "names" || e.target.value === "numbers" || e.target.value === "shorts" ? e.target.value : null)} className={`${field} h-11`}>
                  <option value="">{t("shop.customOpt.meansNone")}</option>
                  <option value="names">{t("customJersey.options.names")}</option>
                  <option value="numbers">{t("customJersey.options.numbers")}</option>
                  <option value="shorts">{t("customJersey.options.shorts")}</option>
                </select>
                <span className="text-[11px] text-text-muted">{t("shop.customOpt.meansHint")}</span>
              </label>
            )}
          </>
        )}

        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <div className="flex gap-2">
          {item && (
            <button
              type="button"
              disabled={busy}
              onClick={() => (sure ? void put(list.filter((x) => x.id !== item.id)) : setSure(true))}
              className={`${btnGhost} h-11 text-badge-discount`}
            >
              <Trash2 className="w-4 h-4" /> {sure ? t("shop.customOpt.sureDelete") : t("shop.customOpt.delete")}
            </button>
          )}
          <button type="submit" disabled={busy} className={`${btnPrimary} h-11 flex-1`}>
            {busy ? t("shop.common.loading") : t("shop.customOpt.save")}
          </button>
        </div>
        {item && <p className="text-[11px] text-text-muted">{t("shop.customOpt.oldOrders")}</p>}
      </form>
    </Dialog>
  );
}

/** Add or edit a fabric from the POS panel (name and customer price per piece). Stock settings stay on the Fabric stock page. */
export function FabricDialog({ item, onSaved, onClose }: { item: Fabric | null; onSaved: () => void; onClose: () => void }) {
  const { t } = useT();
  const [nameEn, setNameEn] = useState(item?.name_en ?? "");
  const [nameBn, setNameBn] = useState(item?.name_bn ?? "");
  const [price, setPrice] = useState(item ? String(item.price_per_piece) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);

  async function save() {
    const p = Number(price);
    if (!nameEn.trim() && !nameBn.trim()) return setError(t("shop.customOpt.needName"));
    if (price.trim() === "" || !Number.isFinite(p) || p < 0) return setError(t("shop.customOpt.badPrice"));
    setBusy(true);
    setError(null);
    const res = await api("/api/admin/custom-jersey", {
      entity: "fabric",
      ...(item
        ? { id: item.id, description_en: item.description_en, description_bn: item.description_bn, display_order: item.display_order, is_active: item.is_active }
        : { is_active: true, display_order: 100 }),
      name_en: nameEn.trim() || nameBn.trim(),
      name_bn: nameBn.trim() || null,
      price_per_piece: p,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
    onClose();
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    setError(null);
    const res = await api(`/api/admin/custom-jersey?entity=fabric&id=${encodeURIComponent(item.id)}`, undefined, "DELETE");
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
    onClose();
  }

  return (
    <Dialog title={`${item ? t("shop.customOpt.edit") : t("shop.customOpt.add")} · ${t("shop.customNew.fabric")}`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className={label}>
          <span className={caption}>{t("shop.customOpt.nameBn")}</span>
          <input autoFocus value={nameBn} maxLength={80} onChange={(e) => setNameBn(e.target.value)} className={`${field} h-11 text-base`} />
        </label>
        <label className={label}>
          <span className={caption}>{t("shop.customOpt.nameEn")}</span>
          <input value={nameEn} maxLength={80} onChange={(e) => setNameEn(e.target.value)} className={`${field} h-11 text-base`} />
        </label>
        <label className={label}>
          <span className={caption}>{t("shop.customOpt.fabricPrice")}</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={`${field} h-11 text-base`} />
        </label>
        <p className="text-[11px] text-text-muted">{t("shop.customOpt.fabricHint")}</p>
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <div className="flex gap-2">
          {item && (
            <button type="button" disabled={busy} onClick={() => (sure ? void remove() : setSure(true))} className={`${btnGhost} h-11 text-badge-discount`}>
              <Trash2 className="w-4 h-4" /> {sure ? t("shop.customOpt.sureDelete") : t("shop.customOpt.delete")}
            </button>
          )}
          <button type="submit" disabled={busy} className={`${btnPrimary} h-11 flex-1`}>
            {busy ? t("shop.common.loading") : t("shop.customOpt.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export type QtyPricing = { tiers: { min: number; discount_percent: number }[]; min_per_piece: number };

/**
 * Price by quantity, counted on the whole order (all designs): "from 5 pieces 5% off,
 * from 10 pieces 10% off", and the lowest average price per piece the discount may reach.
 */
export function QtyDialog({ value, onSaved, onClose }: { value: QtyPricing; onSaved: (v: QtyPricing) => void; onClose: () => void }) {
  const { t } = useT();
  const [rows, setRows] = useState(value.tiers.filter((x) => x.min > 1).map((x) => ({ min: String(x.min), pct: String(x.discount_percent) })));
  const [min, setMin] = useState(value.min_per_piece ? String(value.min_per_piece) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const tiers = rows.map((r) => ({ min: Math.floor(Number(r.min)), discount_percent: Number(r.pct) }));
    if (tiers.some((x) => !(x.min >= 2) || !(x.discount_percent >= 0 && x.discount_percent <= 90))) return setError(t("shop.customOpt.badPrice"));
    const floor = min.trim() === "" ? 0 : Number(min);
    if (!Number.isFinite(floor) || floor < 0) return setError(t("shop.customOpt.badPrice"));
    setBusy(true);
    setError(null);
    const res = await api<QtyPricing>("/api/admin/pos/custom-options", { group: "quantity", tiers, min_per_piece: floor }, "PUT");
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved({ tiers: res.data.tiers, min_per_piece: res.data.min_per_piece });
    onClose();
  }

  return (
    <Dialog title={t("shop.customReg.qtyTitle")} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className="text-xs text-text-muted">{t("shop.customReg.qtyHint")}</p>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <input value={r.min} inputMode="numeric" onChange={(e) => setRows((l) => l.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} className={`${field} h-11 w-20 text-base`} aria-label={t("shop.customReg.fromPieces")} />
            <span className="text-on-surface-variant">{t("shop.customReg.piecesOff")}</span>
            <input value={r.pct} inputMode="decimal" onChange={(e) => setRows((l) => l.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} className={`${field} h-11 w-20 text-base`} aria-label="%" />
            <button type="button" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} className="p-2 text-text-muted hover:text-badge-discount" aria-label={t("shop.customOpt.delete")}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button type="button" className={`${btnGhost} h-10 self-start`} onClick={() => setRows((l) => [...l, { min: String((Number(l.at(-1)?.min) || 0) + 5), pct: l.at(-1)?.pct ?? "5" }])}>
          + {t("shop.customReg.addStep")}
        </button>
        <label className={label}>
          <span className={caption}>{t("shop.customReg.minPrice")}</span>
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="0" className={`${field} h-11 text-base`} />
          <span className="text-[11px] text-text-muted">{t("shop.customReg.minPriceHint")}</span>
        </label>
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} h-11`}>
          {busy ? t("shop.common.loading") : t("shop.customOpt.save")}
        </button>
      </form>
    </Dialog>
  );
}
