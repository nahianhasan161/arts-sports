"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Printer, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { advanceFor, estimate } from "@/lib/custom-jersey/pricing";
import { SIZES, SPORTS, orderTotal, type Collar, type CustomJerseyConfig, type RosterRow, type Sleeve, type UploadedFile } from "@/lib/custom-jersey/types";
import { RosterEditor } from "@/components/custom-jersey/RosterEditor";
import { api, btnGhost, btnPrimary, card, field } from "./api";

const METHODS = ["cash", "card", "bkash", "nagad"] as const;
type Method = (typeof METHODS)[number];

/**
 * A custom jersey order taken at the counter, in one screen: customer, what to
 * make, sizes, the price agreed with the customer and the advance. The price
 * shown is the same estimate the website gives; the server works it out again.
 */
export function NewCustomOrder({ onDone, onCancel }: { onDone: (orderNumber: string) => void; onCancel: () => void }) {
  const { t, locale } = useT();
  const [config, setConfig] = useState<CustomJerseyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; number: string; warning: string | null } | null>(null);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("football");
  const [fabricId, setFabricId] = useState("");
  const [sleeve, setSleeve] = useState<Sleeve>("short");
  const [collar, setCollar] = useState<Collar>("round");
  const [extras, setExtras] = useState({ with_names: false, with_numbers: false, with_logo: false, with_shorts: false });
  const [sizeMode, setSizeMode] = useState<"counts" | "list">("counts");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [zone, setZone] = useState<"dhaka" | "outside">("dhaka");
  const [address, setAddress] = useState("");
  const [confirm, setConfirm] = useState<"now" | "later">("now");
  const [price, setPrice] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<Method>("cash");
  const [payTrx, setPayTrx] = useState("");

  useEffect(() => {
    void api<CustomJerseyConfig>("/api/custom-jersey/config").then((res) => {
      if (!res.ok) return setError(res.error);
      setConfig(res.data);
      setFabricId((f) => f || res.data.fabrics[0]?.id || "");
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

  const sizedRoster: RosterRow[] = useMemo(() => {
    if (sizeMode === "list") return roster.filter((r) => r.size);
    return SIZES.flatMap((size) => Array.from({ length: Math.max(0, Math.min(500, Math.floor(Number(counts[size]) || 0))) }, () => ({ player_name: "", player_number: "", size, sleeve })));
  }, [sizeMode, roster, counts, sleeve]);

  const fabric = config?.fabrics.find((f) => f.id === fabricId);
  const deliveryCharge = delivery === "pickup" || !config ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;
  const est = useMemo(() => {
    if (!config || !fabric || sizedRoster.length === 0) return null;
    return estimate(
      { fabricPrice: fabric.price_per_piece, quantity: sizedRoster.length, sleeve, collar, withShorts: extras.with_shorts, withNames: extras.with_names, withNumbers: extras.with_numbers, withLogo: extras.with_logo, roster: sizedRoster, neededBy: neededBy || null },
      config.pricing
    );
  }, [config, fabric, sizedRoster, sleeve, collar, extras, neededBy]);

  const agreed = price === "" ? (est?.total ?? 0) : Number(price) || 0;
  const total = orderTotal({ final_price: agreed, delivery_charge: deliveryCharge });
  const advance = config ? advanceFor(total, config.pricing) : 0;

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list).slice(0, 10 - files.length)) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "design");
      try {
        const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) setError(json.error ?? "Upload failed");
        else setFiles((f) => [...f, { path: json.path, name: json.name, mime: json.mime, size: json.size, kind: "design" }]);
      } catch {
        setError(t("shop.customNew.uploadFailed"));
      }
    }
    setUploading(false);
  }

  async function submit() {
    setError(null);
    if (est?.tooSoon) return setError(t("shop.customNew.tooSoon", { days: String(config?.pricing.rush.min_days ?? "") }));
    setBusy(true);
    const res = await api<{ id: string; order_number: string; payment_error: string | null }>("/api/admin/pos/custom", {
      action: "create",
      customer_name: name,
      customer_phone: phone,
      sport,
      fabric_id: fabricId,
      sleeve,
      collar,
      ...extras,
      roster: sizedRoster,
      needed_by: neededBy || null,
      notes,
      files,
      delivery_method: delivery,
      delivery_zone: zone,
      delivery_address: address,
      confirm,
      final_price: confirm === "now" ? agreed : undefined,
      pay_amount: confirm === "now" ? Number(payAmount) || 0 : 0,
      pay_method: payMethod,
      pay_trx: payTrx,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSaved({ id: res.data.id, number: res.data.order_number, warning: res.data.payment_error });
  }

  if (saved) {
    return (
      <div className={`${card} p-6 flex flex-col items-center gap-3 text-center`}>
        <CheckCircle2 className="w-10 h-10 text-green-600" />
        <h3 className="font-display font-bold text-xl">{t("shop.customNew.saved", { number: saved.number })}</h3>
        {saved.warning && <p className="text-sm text-badge-discount">{saved.warning}</p>}
        <div className="flex gap-2">
          <a className={btnPrimary} href={`/admin/offline/pos/custom-receipt/${saved.id}`} target="_blank" rel="noreferrer">
            <Printer className="w-4 h-4" /> {t("shop.custom.printReceipt")}
          </a>
          <button className={btnGhost} onClick={() => onDone(saved.number)}>
            {t("shop.customNew.done")}
          </button>
        </div>
      </div>
    );
  }

  const label = "text-xs font-semibold text-on-surface-variant";
  const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-sm border ${on ? "bg-primary text-white border-primary" : "bg-surface-card border-border-light hover:bg-surface-subtle"}`;
  const fabricName = (f: { name_en: string; name_bn: string | null }) => (locale === "bn" && f.name_bn ? f.name_bn : f.name_en);

  return (
    <div className={`${card} p-4 flex flex-col gap-4`}>
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-lg">{t("shop.custom.newOrder")}</h3>
        <button className={btnGhost} onClick={onCancel} aria-label={t("shop.customNew.cancel")}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Customer */}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={label}>{t("shop.customNew.phone")}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 11))} placeholder="01XXXXXXXXX" inputMode="numeric" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>{t("shop.customNew.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
      </div>

      {/* What to make */}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={label}>{t("customJersey.sport.label")}</span>
          <select value={sport} onChange={(e) => setSport(e.target.value as typeof sport)} className={field}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {t(`customJersey.sport.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>{t("shop.customNew.fabric")}</span>
          <select value={fabricId} onChange={(e) => setFabricId(e.target.value)} className={field}>
            {config?.fabrics.map((f) => (
              <option key={f.id} value={f.id}>
                {fabricName(f)} · {taka(f.price_per_piece)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["short", "full"] as const).map((s) => (
          <button key={s} type="button" className={chip(sleeve === s)} onClick={() => setSleeve(s)}>
            {t(`customJersey.options.${s}`)}
          </button>
        ))}
        <span className="w-px bg-border-light mx-1" />
        {(["round", "v", "polo"] as const).map((c) => (
          <button key={c} type="button" className={chip(collar === c)} onClick={() => setCollar(c)}>
            {t(`customJersey.options.${c}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["with_names", "names"],
            ["with_numbers", "numbers"],
            ["with_logo", "logo"],
            ["with_shorts", "shorts"],
          ] as const
        ).map(([key, text]) => (
          <button key={key} type="button" className={chip(extras[key])} onClick={() => setExtras((x) => ({ ...x, [key]: !x[key] }))}>
            {t(`customJersey.options.${text}`)}
          </button>
        ))}
      </div>

      {/* Sizes */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={label}>{t("shop.customNew.sizes")}</span>
          <button type="button" className={chip(sizeMode === "counts")} onClick={() => setSizeMode("counts")}>
            {t("shop.customNew.byCount")}
          </button>
          <button type="button" className={chip(sizeMode === "list")} onClick={() => setSizeMode("list")}>
            {t("shop.customNew.byList")}
          </button>
        </div>
        {sizeMode === "counts" ? (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {SIZES.map((s) => (
              <label key={s} className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold">{s}</span>
                <input value={counts[s] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [s]: e.target.value.replace(/\D/g, "").slice(0, 3) }))} inputMode="numeric" className={`${field} text-center`} placeholder="0" />
              </label>
            ))}
          </div>
        ) : (
          <RosterEditor rows={roster} onChange={setRoster} defaultSleeve={sleeve} />
        )}
      </div>

      {/* Design */}
      <div className="flex flex-col gap-2">
        <span className={label}>{t("shop.customNew.design")}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("shop.customNew.notesPlaceholder")} className={field} />
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btnGhost} cursor-pointer`}>
            <FileUp className="w-4 h-4" /> {uploading ? t("shop.customNew.uploading") : t("shop.customNew.addFile")}
            <input type="file" multiple accept="image/*,.pdf,.ai,.eps" className="hidden" onChange={(e) => void upload(e.target.files)} disabled={uploading} />
          </label>
          {files.map((f, i) => (
            <span key={f.path} className="inline-flex items-center gap-1 text-xs rounded bg-surface-subtle px-2 py-1">
              {f.name}
              <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label="remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Date and delivery */}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={label}>{t("shop.customNew.neededBy")}</span>
          <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={field} />
        </label>
        <div className="flex flex-col gap-1">
          <span className={label}>{t("shop.customNew.handover")}</span>
          <div className="flex gap-2">
            <button type="button" className={chip(delivery === "pickup")} onClick={() => setDelivery("pickup")}>
              {t("customJersey.contact.pickup")}
            </button>
            <button type="button" className={chip(delivery === "delivery")} onClick={() => setDelivery("delivery")}>
              {t("customJersey.contact.delivery")}
            </button>
          </div>
        </div>
      </div>
      {delivery === "delivery" && (
        <div className="grid sm:grid-cols-[160px_1fr] gap-3">
          <select value={zone} onChange={(e) => setZone(e.target.value as typeof zone)} className={field}>
            <option value="dhaka">{t("shop.customNew.dhaka")}</option>
            <option value="outside">{t("shop.customNew.outside")}</option>
          </select>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("shop.customNew.address")} className={field} />
        </div>
      )}

      {/* Price and money */}
      <div className="rounded-lg bg-surface-subtle p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            {t("shop.customNew.pieces", { count: String(sizedRoster.length) })}
            {est && est.isRush && <span className="ml-2 text-badge-discount font-semibold">{t("shop.customNew.rush")}</span>}
          </span>
          <span>
            {t("shop.customNew.estimate")}: <b>{est ? taka(est.total) : "—"}</b>
            {est && <span className="text-text-muted"> ({taka(est.perPiece)}/{t("shop.customNew.each")})</span>}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(confirm === "now")} onClick={() => setConfirm("now")}>
            {t("shop.customNew.confirmNow")}
          </button>
          <button type="button" className={chip(confirm === "later")} onClick={() => setConfirm("later")}>
            {t("shop.customNew.confirmLater")}
          </button>
        </div>
        <p className="text-xs text-text-muted">{t(confirm === "now" ? "shop.customNew.confirmNowHint" : "shop.customNew.confirmLaterHint")}</p>

        {confirm === "now" && (
          <>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <label className="flex flex-col gap-1">
                <span className={label}>{t("shop.customNew.agreedPrice")}</span>
                <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder={est ? String(est.total) : ""} inputMode="decimal" className={field} />
              </label>
              <div className="text-sm">
                <div className="text-xs text-text-muted">{t("shop.common.total")}</div>
                <b>{taka(total)}</b>
                {deliveryCharge > 0 && <span className="text-xs text-text-muted"> ({t("shop.customNew.withDelivery", { amount: taka(deliveryCharge) })})</span>}
              </div>
              <div className="text-sm">
                <div className="text-xs text-text-muted">{t("shop.customNew.advanceRule", { percent: String(config?.pricing.advance_percent ?? "") })}</div>
                <b>{taka(advance)}</b>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_110px_1fr] gap-2">
              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder={t("shop.customNew.payNow", { amount: String(advance) })} inputMode="decimal" className={field} />
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as Method)} className={field}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`shop.method.${m}`)}
                  </option>
                ))}
              </select>
              <input value={payTrx} onChange={(e) => setPayTrx(e.target.value)} placeholder={t("shop.pos.reference")} className={field} disabled={payMethod === "cash"} />
            </div>
            <div className="flex gap-2">
              <button type="button" className={btnGhost} onClick={() => setPayAmount(String(advance))}>
                {t("shop.customNew.fillAdvance")}
              </button>
              <button type="button" className={btnGhost} onClick={() => setPayAmount(String(total))}>
                {t("shop.customNew.fillFull")}
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="text-sm text-badge-discount">{error}</p>}
      <div className="flex justify-end gap-2">
        <button className={btnGhost} onClick={onCancel}>
          {t("shop.customNew.cancel")}
        </button>
        <button className={btnPrimary} disabled={busy || !config || sizedRoster.length === 0} onClick={() => void submit()}>
          {busy ? t("shop.customNew.saving") : t("shop.customNew.save")}
        </button>
      </div>
    </div>
  );
}
