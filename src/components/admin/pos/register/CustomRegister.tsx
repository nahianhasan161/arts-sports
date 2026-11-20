"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ImageIcon, LayoutGrid, Palette, Pencil, Percent, Plus, Printer, Search, Shirt, Trash2, UserRound } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka, type PayMethod } from "@/lib/pos/types";
import { advanceFor, optionName } from "@/lib/custom-jersey/pricing";
import { estimateOrder, itemSummary, MAX_ITEMS } from "@/lib/custom-jersey/items";
import { JERSEY_TYPES, orderTotal, type CustomJerseyConfig, type Fabric, type JerseyOption, type JerseyOptions, type OptionGroup, type OrderItem, type RosterRow, type SizeOption, type Sleeve, type UploadedFile } from "@/lib/custom-jersey/types";
import { designImages, type DesignRow } from "@/lib/custom-jersey/designs";
import { RosterEditor } from "@/components/custom-jersey/RosterEditor";
import { api, btnGhost, btnPrimary, field } from "../api";
import { CustomTab } from "../CustomTab";
import { Dialog, OrderPad, applyKey, type OrderMode, type PadKey } from "./parts";
import { PaymentScreen, type Pay } from "./PaymentScreen";
import { DesignRefs, Lightbox, MAX_REFS, type DesignRef } from "./DesignRefs";
import { GalleryStrip } from "./GalleryStrip";
import { CustomerInput } from "@/components/admin/pickers";
import { FabricDialog, OptionDialog, QtyDialog, type QtyPricing } from "./OptionEditor";

/** The custom-order API takes these (no "other"). */
const METHODS: readonly PayMethod[] = ["cash", "card", "bkash", "nagad"];
type Popup = "customer" | "design" | "delivery" | null;
type JerseyType = (typeof JERSEY_TYPES)[number];
/** collarId value when staff turned the collar off (null = the type's first collar). */
const NO_COLLAR = "none";
/** Which add / edit dialog is open: an option list item, a fabric, or the quantity price. `item` null = new. */
type Editing = { group: OptionGroup; item: JerseyOption | SizeOption | null } | { group: "fabric"; item: Fabric | null } | { group: "quantity" } | null;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One design of the order: its pictures, what it is made of, and its players.
 * `jersey` false = pant only. `pantId` null = no pant; `pantFabricId` null = same fabric as the jersey.
 */
interface Design {
  id: string;
  jersey: boolean;
  fabricId: string;
  jerseyType: JerseyType;
  sleeveId: string | null;
  collarId: string | null;
  extraIds: string[];
  logoId: string | null;
  pantId: string | null;
  pantFabricId: string | null;
  notes: string;
  files: DesignRef[];
  rows: RosterRow[];
}

let seq = 0;
const newId = () => `d${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`;
/** A new design; with `from` it copies that design's choices (not its pictures or players). */
function newDesign(fabricId: string, from?: Design): Design {
  return {
    id: newId(),
    jersey: from?.jersey ?? true,
    fabricId: from?.fabricId ?? fabricId,
    jerseyType: from?.jerseyType ?? "round",
    sleeveId: from?.sleeveId ?? null,
    collarId: from?.collarId ?? null,
    extraIds: from?.extraIds ?? [],
    logoId: from?.logoId ?? null,
    pantId: from?.pantId ?? null,
    pantFabricId: from?.pantFabricId ?? null,
    notes: "",
    files: [],
    rows: [],
  };
}

/** The picks of a design as they stand against the current lists (an edited or deleted option drops out). */
function picksOf(d: Design, options: JerseyOptions | null) {
  const collars = (options?.collars ?? []).filter((c) => c.type === d.jerseyType);
  const sleeve = options ? (options.sleeves.find((o) => o.id === d.sleeveId) ?? options.sleeves[0] ?? null) : null;
  const collar = d.collarId === NO_COLLAR ? null : (collars.find((o) => o.id === d.collarId) ?? collars[0] ?? null);
  const logo = options?.logos.find((o) => o.id === d.logoId) ?? null;
  const extras = (options?.extras ?? []).filter((o) => d.extraIds.includes(o.id));
  const pant = options?.pants.find((o) => o.id === d.pantId) ?? null;
  return { collars, sleeve, collar, logo, extras, pant, sleeveKind: (sleeve?.full ? "full" : "short") as Sleeve };
}

/**
 * A custom jersey order in the register's layout, so staff learn one screen:
 * design tabs on top (one order can hold several designs), then for the open design
 * its pictures, fabric, T-shirt / polo / pant only, sleeve, collar, extras, logo, pant and sizes;
 * the order slip and the number pad on the left, then the same payment screen as a sale.
 * Sleeve, collar, extras, logo, pant and sizes are lists staff keep themselves (✎ Edit, + Add),
 * stored with the price table; the server prices the order from the same lists.
 */
export function CustomRegister() {
  const { t, locale } = useT();
  const [mode, setMode] = useState<"new" | "find">("new");
  const [config, setConfig] = useState<CustomJerseyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; number: string; warning: string | null; paid: number } | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [pane, setPane] = useState<"tiles" | "slip">("tiles");
  const [screen, setScreen] = useState<"slip" | "pay">("slip");

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [options, setOptions] = useState<JerseyOptions | null>(null);
  const [qty, setQty] = useState<QtyPricing | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [designs, setDesigns] = useState<Design[]>(() => [newDesign("")]);
  const [active, setActive] = useState(0);
  const [sureRemove, setSureRemove] = useState(false);
  /** The slip line being edited: `${designId}|${size}`. */
  const [selected, setSelected] = useState<string | null>(null);
  const [padMode, setPadMode] = useState<OrderMode>("qty");
  const [typed, setTyped] = useState<string | null>(null);
  const [neededBy, setNeededBy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [zone, setZone] = useState<"dhaka" | "outside">("dhaka");
  const [address, setAddress] = useState("");
  const [confirm, setConfirm] = useState<"now" | "later">("now");
  const [price, setPrice] = useState("");
  const [take, setTake] = useState<"advance" | "full">("advance");
  const [pays, setPays] = useState<Pay[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [big, setBig] = useState<number | null>(null);

  const d = designs[Math.min(active, designs.length - 1)];
  /** Change one design (by id, so an upload finishing later lands on the right one). */
  const patchDesign = (id: string, p: Partial<Design> | ((x: Design) => Partial<Design>)) =>
    setDesigns((l) => l.map((x) => (x.id === id ? { ...x, ...(typeof p === "function" ? p(x) : p) } : x)));
  const patch = (p: Partial<Design> | ((x: Design) => Partial<Design>)) => patchDesign(d.id, p);
  const setRows = (rows: RosterRow[]) => patch({ rows });
  const setFiles: React.Dispatch<React.SetStateAction<DesignRef[]>> = (u) => patch((x) => ({ files: typeof u === "function" ? u(x.files) : u }));

  function loadConfig() {
    void api<CustomJerseyConfig>("/api/custom-jersey/config").then((res) => {
      if (!res.ok) return setError(res.error);
      setConfig(res.data);
      const first = res.data.fabrics[0]?.id || "";
      setDesigns((l) => l.map((x) => (res.data.fabrics.some((f) => f.id === x.fabricId) ? x : { ...x, fabricId: first })));
    });
  }
  useEffect(() => {
    loadConfig();
  }, []);

  // The option lists come fresh from the server (not the cached website config), with whether I may edit them.
  useEffect(() => {
    void api<{ options: JerseyOptions; tiers: QtyPricing["tiers"]; min_per_piece: number; can_edit: boolean }>("/api/admin/pos/custom-options").then((res) => {
      if (!res.ok) return setError(res.error);
      setOptions(res.data.options);
      setQty({ tiers: res.data.tiers, min_per_piece: res.data.min_per_piece });
      setCanEdit(res.data.can_edit);
    });
  }, []);

  const pk = picksOf(d, options);

  // Opened from the design catalogue with ?designs=a,b: those designs start on the slip.
  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get("designs");
    if (!ids) return;
    window.history.replaceState(null, "", window.location.pathname);
    void api<{ designs: DesignRow[] }>(`/api/admin/pos/designs?ids=${encodeURIComponent(ids)}`).then((res) => {
      if (!res.ok) return setError(res.error);
      setDesigns((l) => l.map((x, i) => (i === 0 ? { ...x, files: [...x.files, ...res.data.designs.filter((g) => g.image_url).slice(0, MAX_REFS).map(galleryRef)] } : x)));
      setPane("slip");
    });
  }, []);

  // A known customer's name fills in from their number.
  useEffect(() => {
    if (!/^01\d{9}$/.test(phone)) return;
    let cancelled = false;
    void api<{ customer: { name: string | null } | null }>(`/api/admin/pos/customer?phone=${phone}`).then((res) => {
      if (!cancelled && res.ok && res.data.customer?.name) setName((n) => n || res.data.customer!.name!);
    });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const sizes = useMemo(() => options?.sizes ?? [], [options]);
  const sizeCount = (s: SizeOption) => d.rows.filter((r) => r.size === s.label).length;
  /** Make design `id` hold exactly `n` rows of this size: keeps the typed names, adds blank rows or drops the last ones. */
  function setSizeCount(id: string, label: string, n: number) {
    const size = sizes.find((s) => s.label === label);
    n = Math.max(0, Math.min(500, n));
    patchDesign(id, (x) => {
      const p = picksOf(x, options);
      let seen = 0;
      const kept = x.rows.filter((r) => (r.size === label ? ++seen <= n : true));
      const add = Array.from(
        { length: Math.max(0, n - seen) },
        () => ({ player_name: "", player_number: "", size: label, sleeve: p.sleeveKind, chest: size?.chest, length: size?.length, pant_size: x.jersey && x.pantId ? label : null }) as RosterRow
      );
      return { rows: [...kept, ...add] };
    });
  }

  const fabricOf = (id: string | null) => config?.fabrics.find((f) => f.id === id);
  const fabricName = (f: { name_en: string; name_bn: string | null }) => (locale === "bn" && f.name_bn ? f.name_bn : f.name_en);
  const titleOf = (i: number) => t("shop.customReg.designN", { n: i + 1 });

  /** A design as the order stores it (ids only; the server fills names and prices). */
  function toItem(x: Design, i: number): OrderItem {
    const p = picksOf(x, options);
    return {
      id: x.id,
      title: titleOf(i),
      jersey: x.jersey,
      fabric_id: x.jersey ? x.fabricId : null,
      fabric_name: x.jersey ? (fabricOf(x.fabricId)?.name_en ?? null) : null,
      jersey_type: x.jerseyType,
      choice: { sleeve: p.sleeve?.id ?? null, collar: p.collar?.id ?? null, extras: p.extras.map((o) => o.id), logo: p.logo?.id ?? null },
      pant: p.pant ? { option: p.pant.id, fabric_id: x.pantFabricId ?? (x.jersey ? x.fabricId : null), fabric_name: null } : null,
      notes: x.notes.trim() || null,
      files: [],
    };
  }

  const pieces = designs.reduce((n, x) => n + x.rows.filter((r) => r.size).length, 0);
  const est = useMemo(() => {
    if (!config || !options || !qty || pieces === 0) return null;
    return estimateOrder(
      { items: designs.map((x, i) => ({ item: toItem(x, i), rows: x.rows.filter((r) => r.size) })), fabrics: config.fabrics, neededBy: neededBy || null },
      { ...config.pricing, ...qty, options }
    );
    // toItem reads only designs, options and config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, options, qty, designs, neededBy, pieces]);

  const deliveryCharge = delivery === "pickup" || !config ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;
  const agreed = price === "" ? (est?.total ?? 0) : Number(price) || 0;
  const total = orderTotal({ final_price: agreed, delivery_charge: deliveryCharge });
  const advance = config ? advanceFor(total, config.pricing) : 0;
  const target = take === "full" ? total : advance;
  const customerLabel = name || phone || t("shop.customReg.customer");

  /** Slip lines: one per design and size. */
  const slip = designs.map((x, i) => {
    const m = new Map<string, number>();
    for (const r of x.rows) if (r.size) m.set(r.size, (m.get(r.size) ?? 0) + 1);
    const e = est?.items.find((it) => it.id === x.id);
    return { design: x, index: i, est: e, perPiece: e && e.pieces ? e.subtotal / e.pieces : 0, lines: [...m.entries()].map(([label, n]) => ({ key: `${x.id}|${label}`, label, n })) };
  });

  // What the open design shows: every picture of its references (a gallery design brings all its pictures).
  const viewItems = d.files.flatMap((f) => {
    const pics = f.images?.length ? f.images : f.preview ? [f.preview] : [];
    return pics.map((src) => ({ src, title: f.note || f.name }));
  });
  const viewAt = Math.min(viewIndex, Math.max(0, viewItems.length - 1));

  const pickedDesigns = new Set(d.files.flatMap((f) => (f.design_id ? [f.design_id] : [])));
  function toggleDesign(g: DesignRow) {
    setFiles((l) => (l.some((r) => r.design_id === g.id) ? l.filter((r) => r.design_id !== g.id) : l.length >= MAX_REFS ? l : [...l, galleryRef(g)]));
    setViewIndex(viewItems.length);
  }

  function reset() {
    setPhone("");
    setName("");
    setDesigns([newDesign(config?.fabrics[0]?.id ?? "")]);
    setActive(0);
    setSelected(null);
    setPadMode("qty");
    setTyped(null);
    setNeededBy("");
    setDelivery("pickup");
    setZone("dhaka");
    setAddress("");
    setConfirm("now");
    setPrice("");
    setTake("advance");
    setPays([]);
    setScreen("slip");
    setError(null);
    setSaved(null);
    setViewIndex(0);
  }

  function openDesign(i: number) {
    setActive(i);
    setSureRemove(false);
    setViewIndex(0);
  }
  function addDesign() {
    if (designs.length >= MAX_ITEMS) return;
    setDesigns((l) => [...l, newDesign(config?.fabrics[0]?.id ?? "", d)]);
    openDesign(designs.length);
    setSelected(null);
  }
  function removeDesign() {
    if (designs.length < 2) return;
    if (!sureRemove) return setSureRemove(true);
    setDesigns((l) => l.filter((x) => x.id !== d.id));
    openDesign(Math.max(0, active - 1));
    setSelected(null);
  }

  function addSize(size: SizeOption) {
    setSizeCount(d.id, size.label, sizeCount(size) + 1);
    setSelected(`${d.id}|${size.label}`);
    setPadMode("qty");
    setTyped(null);
  }

  /** `key` = `${designId}|${size}`, as on the slip line. */
  function removeLine(key: string) {
    const [id, size] = key.split("|");
    patchDesign(id, (x) => ({ rows: x.rows.filter((r) => r.size !== size) }));
    setSelected(null);
    setTyped(null);
  }

  function press(key: PadKey) {
    const buf = applyKey(typed ?? "", key);
    setTyped(buf);
    if (padMode === "price") return setPrice(buf);
    if (!selected) return;
    const [id, size] = selected.split("|");
    setSizeCount(id, size, Math.floor(Number(buf) || 0));
  }

  /** Sleeve option picked: every player of the design takes that sleeve (change one in the names list). */
  function pickSleeve(o: JerseyOption) {
    const full = options?.sleeves.find((x) => x.id === o.id)?.full === true;
    patch((x) => ({ sleeveId: o.id, rows: x.rows.map((r) => ({ ...r, sleeve: full ? "full" : "short" })) }));
  }
  /** Pant picked (or none): everyone gets a pant of their jersey size, or nobody. */
  function pickPant(id: string | null) {
    patch((x) => ({ pantId: id, rows: x.rows.map((r) => ({ ...r, pant_size: id ? (r.pant_size ?? r.size) : null })) }));
  }
  function pickKind(kind: JerseyType | "pant") {
    if (kind === "pant") return patch((x) => ({ jersey: false, pantId: x.pantId ?? options?.pants[0]?.id ?? null }));
    patch({ jersey: true, jerseyType: kind, collarId: null });
  }

  async function upload(list: FileList | File[] | null) {
    if (!list?.length) return;
    const id = d.id;
    setUploading(true);
    for (const file of Array.from(list).slice(0, MAX_REFS - d.files.length)) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "design");
      try {
        const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) setError(json.error ?? t("shop.customNew.uploadFailed"));
        else patchDesign(id, (x) => ({ files: [...x.files, { path: json.path, name: json.name, mime: json.mime, size: json.size, kind: "design", preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }] }));
      } catch {
        setError(t("shop.customNew.uploadFailed"));
      }
    }
    setUploading(false);
  }

  /** The slip is ready: check what's missing, then pay (price agreed) or save (mockup first). */
  function next() {
    setError(null);
    if (!/^01\d{9}$/.test(phone) || !name.trim()) return setPopup("customer");
    const empty = designs.findIndex((x) => !x.rows.some((r) => r.size));
    if (empty !== -1) {
      openDesign(empty);
      return setError(`${titleOf(empty)}: ${t("shop.customReg.listHint")}`);
    }
    if (delivery === "delivery" && !address.trim()) return setPopup("delivery");
    if (est?.tooSoon) return setError(t("shop.customNew.tooSoon", { days: String(config?.pricing.rush.min_days ?? "") }));
    if (confirm === "later") return void save([]);
    setPays([]);
    setScreen("pay");
  }

  /** Cash over the amount is change; only what's kept is recorded. */
  function keptPayments(list: Pay[]) {
    let left = target;
    const out: { method: PayMethod; amount: number; trx: string }[] = [];
    for (const p of list) {
      const amount = Math.min(left, Number(p.amount) || 0);
      if (amount > 0) out.push({ method: p.method, amount: round2(amount), trx: p.reference });
      left = round2(left - amount);
    }
    return out;
  }

  async function save(list: Pay[]) {
    const kept = keptPayments(list);
    setBusy(true);
    setError(null);
    const first = kept[0];
    const res = await api<{ id: string; order_number: string; payment_error: string | null }>("/api/admin/pos/custom", {
      action: "create",
      customer_name: name,
      customer_phone: phone,
      // Each design with its picks (ids) and pictures; the server reads names and prices from its own lists.
      items: designs.map((x, i) => ({
        ...toItem(x, i),
        files: x.files.map((f): UploadedFile => ({ path: f.path, name: f.name, mime: f.mime, size: f.size, kind: f.kind, note: f.note, product_id: f.product_id, design_id: f.design_id })),
      })),
      roster: designs.flatMap((x) => x.rows.filter((r) => r.size).map((r) => ({ ...r, item_id: x.id }))),
      needed_by: neededBy || null,
      delivery_method: delivery,
      delivery_zone: zone,
      delivery_address: address,
      confirm,
      final_price: confirm === "now" ? agreed : undefined,
      pay_amount: confirm === "now" && first ? first.amount : 0,
      pay_method: first?.method ?? "cash",
      pay_trx: first?.trx ?? "",
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    // A split payment: the first part went with the order, the rest go one by one.
    let warning = res.data.payment_error;
    let paid = warning ? 0 : (first?.amount ?? 0);
    for (const p of warning ? [] : kept.slice(1)) {
      const r = await api("/api/admin/pos/custom", { id: res.data.id, action: "payment", amount: p.amount, method: p.method, trx_id: p.trx });
      if (!r.ok) {
        warning = r.error;
        break;
      }
      paid += p.amount;
    }
    setBusy(false);
    setSaved({ id: res.data.id, number: res.data.order_number, warning, paid });
  }

  // ---- Screens -----------------------------------------------------------

  const subTabs = (
    <div className="h-12 bg-surface-card border-b border-border-light flex items-center gap-2 px-2 flex-shrink-0">
      <div className="flex rounded-md border border-border-light overflow-hidden text-sm font-semibold">
        <button type="button" onClick={() => setMode("new")} className={`h-9 px-3 border-r border-border-light flex items-center gap-1.5 ${mode === "new" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
          <Shirt className="w-4 h-4" /> {t("shop.customReg.newTab")}
        </button>
        <button type="button" onClick={() => setMode("find")} className={`h-9 px-3 flex items-center gap-1.5 ${mode === "find" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
          <Search className="w-4 h-4" /> {t("shop.customReg.findTab")}
        </button>
      </div>
      {mode === "new" && !saved && (
        <button type="button" onClick={reset} className="ml-auto h-9 px-3 rounded-md border border-border-light text-sm text-on-surface-variant hover:bg-surface-subtle">
          {t("shop.customReg.clear")}
        </button>
      )}
    </div>
  );

  if (mode === "find") {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {subTabs}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto w-full max-w-3xl">
            <CustomTab hideNew />
          </div>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {subTabs}
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-6 text-center flex flex-col gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h2 className="font-display text-xl font-bold text-primary">{t("shop.customNew.saved", { number: saved.number })}</h2>
            {saved.paid > 0 && <p className="text-lg font-semibold tabular-nums">{t("shop.customReg.paidNow", { amount: taka(saved.paid) })}</p>}
            {saved.warning && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{saved.warning}</p>}
            <a className={btnGhost} href={`/admin/offline/pos/custom-receipt/${saved.id}`} target="_blank" rel="noreferrer">
              <Printer className="w-4 h-4" /> {t("shop.custom.printReceipt")}
            </a>
            <button type="button" autoFocus onClick={reset} className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold hover:opacity-90">
              {t("shop.customReg.another")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "pay") {
    const choice = (k: "advance" | "full", label: string, amount: number) => (
      <button type="button" onClick={() => { setTake(k); setPays([]); }} className={`h-12 px-3 rounded-lg border flex items-center justify-between gap-2 text-sm font-semibold ${take === k ? "border-accent-gold ring-1 ring-accent-gold bg-accent-gold/10" : "border-border-light bg-surface-card hover:border-accent-gold"}`}>
        <span>{label}</span>
        <span className="tabular-nums">{taka(amount)}</span>
      </button>
    );
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {subTabs}
        <PaymentScreen
          total={target}
          pays={pays}
          setPays={setPays}
          customerLabel={customerLabel}
          onCustomer={() => setPopup("customer")}
          onBack={() => setScreen("slip")}
          onValidate={() => void save(pays)}
          busy={busy}
          error={error}
          blocked={null}
          methods={METHODS}
          extra={
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs font-semibold text-text-muted">{t("shop.customReg.takeNow")}</p>
              {choice("advance", t("shop.customReg.advance", { percent: String(config?.pricing.advance_percent ?? "") }), advance)}
              {choice("full", t("shop.customNew.fillFull"), total)}
              <p className="text-xs text-text-muted">{t("shop.customReg.orderTotal", { amount: taka(total) })}</p>
            </div>
          }
        />
        {popup === "customer" && customerDialog()}
      </div>
    );
  }

  // ---- Dialogs -----------------------------------------------------------

  function customerDialog() {
    return (
      <Dialog title={t("shop.customReg.customer")} onClose={() => setPopup(null)}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.phone")}</span>
            <CustomerInput autoFocus value={phone} onChange={(v) => setPhone(v.replace(/[^\d]/g, "").slice(0, 11))} onPick={(c) => { setPhone(c.phone); setName(c.name ?? ""); }} minChars={3} placeholder="01XXXXXXXXX" inputMode="numeric" className={`${field} h-11 text-base`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.name")}</span>
            <CustomerInput value={name} onChange={setName} onPick={(c) => { setPhone(c.phone); setName(c.name ?? ""); }} className={`${field} h-11 text-base`} />
          </label>
          {(!/^01\d{9}$/.test(phone) || !name.trim()) && <p className="text-xs text-text-muted">{t("shop.customReg.needCustomer")}</p>}
          <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
            {t("shop.customNew.done")}
          </button>
        </div>
      </Dialog>
    );
  }

  const tile = (on: boolean) =>
    `relative h-16 px-3 rounded-md border text-sm font-semibold text-on-surface transition active:scale-[0.98] flex items-center justify-center text-center ${on ? "border-accent-gold bg-accent-gold/20 ring-2 ring-accent-gold" : "border-border-light bg-surface-card hover:border-accent-gold"}`;
  const chip = (on: boolean) => `h-10 px-3 rounded-md border text-sm ${on ? "border-accent-gold bg-accent-gold/20 ring-1 ring-accent-gold font-semibold" : "border-border-light bg-surface-card hover:border-accent-gold"}`;
  const heading = "text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5 mt-3 first:mt-0";
  const slipBtn = (on: boolean) => `h-10 px-3 rounded-md border text-sm flex items-center gap-1.5 min-w-0 ${on ? "border-primary bg-primary/10 text-on-surface font-semibold" : "border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container"}`;
  const priceTag = (n: number) => (
    <span className="text-[11px] font-normal text-text-muted tabular-nums">{n > 0 ? `+${taka(n)}` : t("customJersey.options.free")}</span>
  );
  const optName = (o: JerseyOption) => optionName(o, locale);

  /** In ✎ edit mode a tile opens its editor instead of being picked. */
  const pickOr = (group: OptionGroup, item: JerseyOption | SizeOption, pick: () => void) => () => (editMode ? setEditing({ group, item }) : pick());
  const addTile = (onClick: () => void, className = "h-16") =>
    canEdit ? (
      <button type="button" onClick={onClick} className={`${className} rounded-md border-2 border-dashed border-accent-gold/60 text-accent-gold text-sm font-semibold flex items-center justify-center gap-1 hover:bg-accent-gold/10`} aria-label={t("shop.customOpt.add")}>
        <Plus className="w-4 h-4" /> {t("shop.customOpt.add")}
      </button>
    ) : null;
  const editBadge = editMode ? <Pencil className="absolute top-1 right-1 w-3.5 h-3.5 text-accent-gold" /> : null;
  const loadingTiles = (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
      {Array.from({ length: 3 }).map((_, i) => <span key={i} aria-hidden className="h-16 rounded-md bg-surface-subtle animate-pulse" />)}
    </div>
  );
  const optionTiles = (group: "sleeves" | "collars" | "extras" | "logos" | "pants", list: JerseyOption[], isOn: (o: JerseyOption) => boolean, pick: (o: JerseyOption) => void, none?: { on: boolean; pick: () => void; label?: string }) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
      {none && (
        <button type="button" className={tile(none.on)} onClick={none.pick}>
          {none.label ?? t("customJersey.options.logoTypes.none")}
        </button>
      )}
      {list.map((o) => (
        <button key={o.id} type="button" className={`${tile(!editMode && isOn(o))} flex-col gap-0.5`} onClick={pickOr(group, o, () => pick(o))}>
          {editBadge}
          {optName(o)}
          {priceTag(o.price)}
        </button>
      ))}
      {addTile(() => setEditing({ group, item: null }))}
    </div>
  );
  const dEst = est?.items.find((x) => x.id === d.id);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {subTabs}
      <div className="flex-1 min-h-0 flex">
        {/* The order slip */}
        <section className={`${pane === "slip" ? "flex" : "hidden"} lg:flex w-full lg:w-[420px] xl:w-[450px] flex-col bg-surface-card border-r border-border-light flex-shrink-0`}>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {pieces === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-text-muted p-6 text-center">
                <Shirt className="w-10 h-10 opacity-40" />
                <p className="text-sm">{t("shop.customReg.empty")}</p>
              </div>
            ) : (
              <ul>
                {slip.map((s) => (
                  <li key={s.design.id} className="border-b border-border-light last:border-b-0">
                    <button type="button" onClick={() => { openDesign(s.index); setPane("tiles"); }} className={`w-full text-left px-3 pt-2 pb-1 ${s.index === active ? "bg-accent-gold/10" : "hover:bg-surface-subtle"}`}>
                      <span className="flex items-baseline gap-2 text-sm font-semibold text-on-surface">
                        <span className="flex-1 truncate">{titleOf(s.index)}</span>
                        {s.est && <span className="tabular-nums text-xs text-text-muted">{t("shop.customReg.pcs", { n: s.est.pieces })}</span>}
                      </span>
                      <span className="block text-[11px] text-text-muted leading-snug">{itemSummary(toItem(s.design, s.index), s.est, locale, t as (k: string) => string)}</span>
                    </button>
                    {s.lines.map(({ key, label, n }) => {
                      const on = key === selected && padMode === "qty";
                      return (
                        <button key={key} type="button" className={`w-full text-left px-3 py-1.5 text-sm ${on ? "bg-primary/10" : "hover:bg-surface-subtle"}`} onClick={() => { setSelected(key); setPadMode("qty"); setTyped(null); }}>
                          <span className="flex items-baseline gap-3">
                            <b className="tabular-nums text-on-surface">{n}</b>
                            <span className="flex-1 min-w-0 truncate text-on-surface">{t("shop.customReg.sizeLine", { size: label })}</span>
                            {s.perPiece > 0 && <b className="whitespace-nowrap tabular-nums text-on-surface">{taka(Math.round(s.perPiece * n))}</b>}
                          </span>
                        </button>
                      );
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-2 pb-2 flex flex-col gap-2 flex-shrink-0">
            <div className="px-1 pt-2 border-t border-border-light text-sm">
              {est && est.discountAmount > 0 && (
                <p className="flex justify-between text-xs text-emerald-700">
                  <span>{t("shop.customReg.discount", { percent: String(est.discountPercent) })}</span>
                  <span className="tabular-nums">−{taka(est.discountAmount)}</span>
                </p>
              )}
              {est && (
                <p className="flex justify-between text-xs text-text-muted">
                  <span>
                    {t("shop.customNew.estimate")} ({taka(est.perPiece)}/{t("shop.customNew.each")})
                    {est.isRush && <span className="ml-1 text-badge-discount font-semibold">{t("shop.customNew.rush")}</span>}
                  </span>
                  <span className="tabular-nums">{taka(est.total)}</span>
                </p>
              )}
              {price !== "" && (
                <p className={`flex justify-between text-xs ${padMode === "price" ? "text-primary font-semibold" : "text-text-muted"}`}>
                  <span>{t("shop.customReg.agreed")}</span>
                  <span className="tabular-nums">{taka(agreed)}</span>
                </p>
              )}
              {deliveryCharge > 0 && (
                <p className="flex justify-between text-xs text-text-muted">
                  <span>{t("shop.customReg.delivery")}</span>
                  <span className="tabular-nums">{taka(deliveryCharge)}</span>
                </p>
              )}
              <p className="flex justify-between items-baseline text-on-surface">
                <span className="font-bold">
                  {t("shop.register.total")} <span className="text-xs font-normal text-text-muted">· {t("shop.register.pieces", { n: pieces })}</span>
                </span>
                <span className="text-lg font-bold tabular-nums">{taka(total)}</span>
              </p>
              {confirm === "now" && total > 0 && <p className="flex justify-between text-xs text-text-muted"><span>{t("shop.customReg.advance", { percent: String(config?.pricing.advance_percent ?? "") })}</span><span className="tabular-nums">{taka(advance)}</span></p>}
            </div>
            {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}

            <div className="grid grid-cols-3 gap-2 border-t border-border-light pt-2">
              <button type="button" onClick={() => setPopup("customer")} className={`${slipBtn(Boolean(phone || name))} col-span-2`}>
                <UserRound className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{customerLabel}</span>
              </button>
              <button type="button" onClick={() => setPopup("delivery")} className={slipBtn(Boolean(neededBy) || delivery === "delivery")} title={t("shop.customReg.dateDelivery")}>
                <CalendarDays className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{neededBy ? neededBy.slice(5) : t("shop.customReg.date")}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm("now")} className={slipBtn(confirm === "now")}>
                <span className="truncate">{t("shop.customReg.priceNow")}</span>
              </button>
              <button type="button" onClick={() => setConfirm("later")} className={slipBtn(confirm === "later")}>
                <span className="truncate">{t("shop.customReg.mockupFirst")}</span>
              </button>
            </div>

            <OrderPad
              onKey={press}
              onSign={() => selected && removeLine(selected)}
              mode={padMode}
              setMode={(m) => {
                setPadMode(m);
                setTyped(null);
              }}
              noDisc
              disabled={padMode === "qty" ? !selected : confirm === "later"}
              labels={{ qty: t("shop.common.qty"), price: t("shop.register.price"), sign: t("shop.register.removeLine") }}
            />

            <button type="button" onClick={next} disabled={busy || !config || pieces === 0} className="h-16 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 disabled:opacity-50">
              {busy ? t("shop.customNew.saving") : confirm === "now" ? t("shop.register.payment") : t("shop.customNew.save")}
            </button>
          </div>
        </section>

        {/* Tiles: what to make, for the open design */}
        <section className={`${pane === "tiles" ? "flex" : "hidden"} lg:flex flex-1 min-w-0 flex-col bg-surface`}>
          {/* Design tabs */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border-light bg-surface-card overflow-x-auto no-scrollbar flex-shrink-0">
            {designs.map((x, i) => {
              const n = x.rows.filter((r) => r.size).length;
              return (
                <button key={x.id} type="button" onClick={() => openDesign(i)} className={`shrink-0 h-9 px-3 rounded-md border text-sm font-semibold flex items-center gap-1.5 ${i === active ? "border-accent-gold bg-accent-gold/20 ring-1 ring-accent-gold text-on-surface" : "border-border-light text-on-surface-variant hover:bg-surface-subtle"}`}>
                  {x.jersey && <Shirt className="w-4 h-4" />}
                  {titleOf(i)}
                  {n > 0 && <span className="min-w-5 h-5 px-1 rounded bg-neutral-900 text-white text-[11px] flex items-center justify-center tabular-nums">{n}</span>}
                </button>
              );
            })}
            {designs.length < MAX_ITEMS && (
              <button type="button" onClick={addDesign} title={t("shop.customReg.addDesignHint")} className="shrink-0 h-9 px-3 rounded-md border-2 border-dashed border-accent-gold/60 text-accent-gold text-sm font-semibold flex items-center gap-1 hover:bg-accent-gold/10">
                <Plus className="w-4 h-4" /> {t("shop.customReg.addDesign")}
              </button>
            )}
            <span className="flex-1" />
            {canEdit && (
              <>
                {editMode && (
                  <button type="button" onClick={() => setEditing({ group: "quantity" })} className="shrink-0 h-8 px-3 rounded-md border border-accent-gold text-xs font-semibold flex items-center gap-1.5 hover:bg-accent-gold/10">
                    <Percent className="w-3.5 h-3.5" /> {t("shop.customReg.qtyPrice")}
                  </button>
                )}
                <button type="button" onClick={() => setEditMode((v) => !v)} aria-pressed={editMode} className={`shrink-0 h-8 px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 ${editMode ? "border-accent-gold bg-accent-gold/15 text-on-surface" : "border-border-light text-on-surface-variant hover:bg-surface-subtle"}`}>
                  <Pencil className="w-3.5 h-3.5" /> {editMode ? t("shop.customOpt.doneEditing") : t("shop.customOpt.editLists")}
                </button>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {editMode && <p className="text-xs text-text-muted mb-1 text-right">{t("shop.customOpt.editHint")}</p>}

            {/* The chosen design: browse all its pictures */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {titleOf(active)} · {t("shop.customReg.chosenDesign")}
                {dEst && dEst.pieces > 0 && <span className="normal-case font-normal"> · {t("shop.customReg.designTotal")} {taka(dEst.subtotal)}</span>}
              </p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPopup("design")} className={`${btnGhost} h-9 px-3 text-xs`}>
                  <Palette className="w-4 h-4" /> {t("shop.customReg.pictures")}
                  {d.files.length > 0 && <span className="tabular-nums">({d.files.length})</span>}
                </button>
                {designs.length > 1 && (
                  <button type="button" onClick={removeDesign} className={`h-9 px-3 rounded-md border text-xs font-semibold flex items-center gap-1 ${sureRemove ? "border-badge-discount bg-badge-discount/10 text-badge-discount" : "border-border-light text-on-surface-variant hover:text-badge-discount"}`}>
                    <Trash2 className="w-3.5 h-3.5" /> {sureRemove ? t("shop.customReg.sureRemove") : t("shop.customReg.removeDesign")}
                  </button>
                )}
              </div>
            </div>
            {viewItems.length === 0 ? (
              <button type="button" onClick={() => setPopup("design")} className="w-full h-24 rounded-lg border-2 border-dashed border-border-light text-text-muted text-sm flex items-center justify-center gap-2 px-4 hover:border-accent-gold">
                <ImageIcon className="w-5 h-5 shrink-0" /> {t("shop.customReg.noPicture")}
              </button>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="relative h-56 sm:h-64 rounded-lg bg-surface-subtle border border-border-light overflow-hidden">
                  <button type="button" onClick={() => setBig(viewAt)} className="absolute inset-0 cursor-zoom-in" aria-label={t("shop.customNew.viewBig")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={viewItems[viewAt].src} alt={viewItems[viewAt].title} className="w-full h-full object-contain" />
                  </button>
                  {viewItems[viewAt].title && <span className="absolute bottom-1.5 left-1.5 right-1.5 text-xs bg-black/60 text-white rounded px-2 py-1 truncate">{viewItems[viewAt].title}</span>}
                  {viewItems.length > 1 && (
                    <>
                      <button type="button" aria-label="‹" onClick={() => setViewIndex((viewAt - 1 + viewItems.length) % viewItems.length)} className="absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
                      <button type="button" aria-label="›" onClick={() => setViewIndex((viewAt + 1) % viewItems.length)} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"><ChevronRight className="w-5 h-5" /></button>
                      <span className="absolute top-1.5 right-1.5 text-[11px] bg-black/60 text-white rounded px-1.5 py-0.5 tabular-nums">{viewAt + 1}/{viewItems.length}</span>
                    </>
                  )}
                </div>
                {viewItems.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {viewItems.map((v, i) => (
                      <button key={`${v.src}-${i}`} type="button" onClick={() => setViewIndex(i)} className={`shrink-0 w-14 h-14 rounded border-2 overflow-hidden ${i === viewAt ? "border-accent-gold" : "border-border-light"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {d.notes && <p className="mt-1.5 text-xs whitespace-pre-line bg-surface-card border border-border-light rounded p-2">{d.notes}</p>}

            <p className={`${heading} mt-3`}>{t("shop.customReg.gallery")}</p>
            <GalleryStrip picked={pickedDesigns} onToggle={toggleDesign} onMore={() => setPopup("design")} />

            <p className={heading}>{t("shop.customReg.jerseyOrPant")}</p>
            <div className="grid grid-cols-3 gap-2 max-w-md">
              {JERSEY_TYPES.map((c) => (
                <button key={c} type="button" className={tile(d.jersey && d.jerseyType === c)} onClick={() => pickKind(c)}>
                  {t(c === "polo" ? "customJersey.options.poloName" : "customJersey.options.tshirtName")}
                </button>
              ))}
              <button type="button" className={tile(!d.jersey)} onClick={() => pickKind("pant")}>
                {t("shop.customReg.pantOnly")}
              </button>
            </div>

            {d.jersey && (
              <>
                <p className={heading}>{t("shop.customNew.fabric")}</p>
                {!config ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                    {Array.from({ length: 4 }).map((_, i) => <span key={i} aria-hidden className="h-32 rounded-md bg-surface-subtle animate-pulse" />)}
                  </div>
                ) : (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                    {config.fabrics.map((f) => {
                      const on = !editMode && f.id === d.fabricId;
                      return (
                        <li key={f.id}>
                          <button type="button" onClick={() => (editMode ? setEditing({ group: "fabric", item: f }) : patch({ fabricId: f.id }))} className={`relative w-full h-32 flex flex-col text-left rounded-md border bg-surface-card overflow-hidden border-b-4 transition active:scale-[0.98] ${on ? "border-accent-gold ring-2 ring-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"}`}>
                            {f.image_url ? (
                              <span className="relative flex-1 min-h-0 bg-surface-subtle">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              </span>
                            ) : null}
                            <span className={`px-2 py-1.5 text-sm text-on-surface leading-snug line-clamp-2 ${f.image_url ? "pr-8" : "flex-1 flex items-center justify-center text-center"}`}>{fabricName(f)}</span>
                            <span className="absolute top-1 right-1 rounded bg-surface-card/90 text-on-surface text-[11px] font-semibold px-1.5 py-0.5 tabular-nums">{taka(f.price_per_piece)}</span>
                            {on && <CheckCircle2 className="absolute top-1 left-1 w-5 h-5 text-accent-gold bg-surface-card rounded-full" />}
                            {editMode && <Pencil className="absolute top-1.5 left-1.5 w-4 h-4 text-accent-gold" />}
                          </button>
                        </li>
                      );
                    })}
                    {canEdit && <li>{addTile(() => setEditing({ group: "fabric", item: null }), "w-full h-32")}</li>}
                  </ul>
                )}

                <p className={heading}>{t("customJersey.options.sleeve")}</p>
                {!options ? loadingTiles : optionTiles("sleeves", options.sleeves, (o) => o.id === pk.sleeve?.id, pickSleeve)}

                <p className={heading}>{t("customJersey.options.collar")}</p>
                {!options ? loadingTiles : optionTiles("collars", pk.collars, (o) => o.id === pk.collar?.id, (o) => patch({ collarId: o.id === pk.collar?.id ? NO_COLLAR : o.id }))}

                <p className={heading}>{t("shop.customReg.extras")}</p>
                {!options ? loadingTiles : optionTiles("extras", options.extras, (o) => d.extraIds.includes(o.id), (o) => patch((x) => ({ extraIds: x.extraIds.includes(o.id) ? x.extraIds.filter((v) => v !== o.id) : [...x.extraIds, o.id] })))}

                <p className={heading}>{t("customJersey.options.logo")}</p>
                {!options ? loadingTiles : optionTiles("logos", options.logos, (o) => o.id === d.logoId, (o) => patch({ logoId: o.id }), { on: !d.logoId, pick: () => patch({ logoId: null }) })}
              </>
            )}

            <p className={heading}>{t("shop.customReg.pant")}</p>
            {!options
              ? loadingTiles
              : optionTiles("pants", options.pants, (o) => o.id === pk.pant?.id, (o) => pickPant(o.id), d.jersey ? { on: !pk.pant, pick: () => pickPant(null), label: t("shop.customReg.noPant") } : undefined)}
            {pk.pant && config && (
              <>
                <p className="text-[11px] text-text-muted mt-1.5">{t("shop.customReg.pantFabric")}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {d.jersey && (
                    <button type="button" className={chip(!d.pantFabricId)} onClick={() => patch({ pantFabricId: null })}>
                      {t("shop.customReg.sameFabric")}
                    </button>
                  )}
                  {config.fabrics.map((f) => (
                    <button key={f.id} type="button" className={chip(d.pantFabricId === f.id)} onClick={() => patch({ pantFabricId: f.id })}>
                      {fabricName(f)}
                    </button>
                  ))}
                </div>
                {d.jersey && d.rows.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] text-text-muted">{t("shop.customReg.pantHint")}</span>
                    <button type="button" className={`${btnGhost} h-8 px-2 text-xs`} onClick={() => patch((x) => ({ rows: x.rows.map((r) => ({ ...r, pant_size: r.pant_size ?? r.size })) }))}>
                      {t("shop.customReg.pantAll")}
                    </button>
                    <button type="button" className={`${btnGhost} h-8 px-2 text-xs`} onClick={() => patch((x) => ({ rows: x.rows.map((r) => ({ ...r, pant_size: null })) }))}>
                      {t("shop.customReg.pantNobody")}
                    </button>
                  </div>
                )}
              </>
            )}

            <p className={heading}>{t("shop.customReg.sizesHint")}</p>
            <div className="grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
              {sizes.map((s) => {
                const n = sizeCount(s);
                return (
                  <button key={s.id} type="button" onClick={pickOr("sizes", s, () => addSize(s))} className={`relative h-20 rounded-md border bg-surface-card text-on-surface border-b-4 transition active:scale-[0.98] flex flex-col items-center justify-center ${n && !editMode ? "border-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"}`}>
                    {editBadge}
                    <span className="text-xl font-bold leading-tight">{s.label}</span>
                    {(s.chest || s.length) && (
                      <span className="text-[11px] text-text-muted tabular-nums leading-tight">
                        {[s.chest ? t("shop.customOpt.chestShort", { n: s.chest }) : "", s.length ? t("shop.customOpt.lengthShort", { n: s.length }) : ""].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {n > 0 && <span className="absolute bottom-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-md bg-neutral-900 text-white text-xs font-bold flex items-center justify-center tabular-nums">{n}</span>}
                  </button>
                );
              })}
              {addTile(() => setEditing({ group: "sizes", item: null }), "h-20")}
            </div>

            {/* Names list: one row per piece of this design, follows the size counts above. */}
            <p className={heading}>
              {t("shop.customReg.list")} · {t("shop.register.pieces", { n: d.rows.length })}
              {dEst && dEst.pants > 0 && ` · ${t("shop.customReg.pants", { n: dEst.pants })}`}
            </p>
            {d.rows.length === 0 ? (
              <p className="text-xs text-text-muted">{t("shop.customReg.listHint")}</p>
            ) : (
              <RosterEditor key={d.id} rows={d.rows} onChange={setRows} defaultSleeve={pk.sleeveKind} sizes={sizes} pant={d.jersey && Boolean(pk.pant)} noSleeve={!d.jersey} />
            )}
          </div>
        </section>
      </div>

      {/* Phones: switch between the tiles and the slip. */}
      <div className="lg:hidden grid grid-cols-2 border-t border-border-light bg-surface-card flex-shrink-0">
        <button type="button" onClick={() => setPane("tiles")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "tiles" ? "text-accent-gold" : "text-on-surface-variant"}`}>
          <LayoutGrid className="w-4 h-4" /> {t("shop.customReg.options")}
        </button>
        <button type="button" onClick={() => setPane("slip")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "slip" ? "text-accent-gold" : "text-on-surface-variant"}`}>
          <Shirt className="w-4 h-4" /> {t("shop.customReg.slip")} · {taka(total)}
          {pieces > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-accent-gold text-white text-[11px] font-bold flex items-center justify-center">{pieces}</span>}
        </button>
      </div>

      {popup === "customer" && customerDialog()}
      <Lightbox items={viewItems} index={big} setIndex={setBig} />

      {editing?.group === "fabric" && <FabricDialog item={editing.item} onSaved={loadConfig} onClose={() => setEditing(null)} />}
      {editing?.group === "quantity" && qty && <QtyDialog value={qty} onSaved={setQty} onClose={() => setEditing(null)} />}
      {editing && editing.group !== "fabric" && editing.group !== "quantity" && options && (
        <OptionDialog group={editing.group} item={editing.item} options={options} jerseyType={d.jerseyType} onSaved={setOptions} onClose={() => setEditing(null)} />
      )}

      {popup === "design" && (
        <Dialog title={`${titleOf(active)} · ${t("shop.customReg.pictures")}`} wide onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">{t("shop.customReg.picturesHint")}</p>
            <DesignRefs refs={d.files} setRefs={setFiles} uploading={uploading} onUpload={(l) => void upload(l)} />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customReg.designNotes")}</span>
              <textarea value={d.notes} onChange={(e) => patch({ notes: e.target.value })} rows={3} placeholder={t("shop.customNew.notesPlaceholder")} className={field} />
            </label>
            <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
              {t("shop.customNew.done")}
            </button>
          </div>
        </Dialog>
      )}

      {popup === "delivery" && (
        <Dialog title={t("shop.customReg.dateDelivery")} onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.neededBy")}</span>
              <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={`${field} h-11`} />
            </label>
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.handover")}</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={tile(delivery === "pickup")} onClick={() => setDelivery("pickup")}>
                {t("customJersey.contact.pickup")}
              </button>
              <button type="button" className={tile(delivery === "delivery")} onClick={() => setDelivery("delivery")}>
                {t("customJersey.contact.delivery")}
              </button>
            </div>
            {delivery === "delivery" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={tile(zone === "dhaka")} onClick={() => setZone("dhaka")}>
                    {t("shop.customNew.dhaka")} · {taka(config?.delivery.dhaka ?? 0)}
                  </button>
                  <button type="button" className={tile(zone === "outside")} onClick={() => setZone("outside")}>
                    {t("shop.customNew.outside")} · {taka(config?.delivery.outside ?? 0)}
                  </button>
                </div>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("shop.customNew.address")} className={`${field} h-11`} />
              </>
            )}
            <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
              {t("shop.customNew.done")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** A gallery design as a reference on the slip, with all its pictures for browsing. */
function galleryRef(g: DesignRow): DesignRef {
  return { path: g.image_url, name: g.title || g.caption || "design", mime: "image/*", size: 0, kind: "reference", design_id: g.id, preview: g.image_url, images: designImages(g) };
}
