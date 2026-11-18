"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { api, btnGhost, btnPrimary, card, field } from "@/components/admin/pos/api";
import { Lines, ReceiptShop } from "@/components/admin/pos/ReceiptShop";
import { EMPTY_RECEIPT_SETTINGS, type ReceiptSettings } from "@/lib/pos/receipt-settings";

const URL_ = "/api/admin/pos/receipt-settings";

/** Shop details, logo and terms printed on shop receipts. Needs `settings.manage`. */
export default function ReceiptSettingsPage() {
  const { t } = useT();
  const [s, setS] = useState<ReceiptSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api<{ settings: ReceiptSettings }>(URL_).then((res) => (res.ok ? setS(res.data.settings) : (setError(res.error), setS(EMPTY_RECEIPT_SETTINGS))));
  }, []);

  if (!s) return <PageSkeleton label={t("shop.common.loading")} />;

  const set = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) => {
    setSaved(false);
    setS((p) => (p ? { ...p, [k]: v } : p));
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "gallery");
      const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? t("shop.receiptSettings.uploadFailed"));
      set("logo_url", json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shop.receiptSettings.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await api<{ settings: ReceiptSettings }>(URL_, s, "PUT");
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setS(res.data.settings);
    setSaved(true);
  };

  const text = (k: "shop_name" | "address" | "phone" | "email" | "website", label: string, help?: string) => (
    <label className="text-xs space-y-1 block">
      <span className="font-semibold block">{label}</span>
      <input className={field} value={s[k]} onChange={(e) => set(k, e.target.value)} />
      {help && <span className="text-text-muted block">{help}</span>}
    </label>
  );
  const area = (k: "terms" | "custom_terms" | "footer", label: string, placeholder: string, rows = 4) => (
    <label className="text-xs space-y-1 block">
      <span className="font-semibold block">{label}</span>
      <textarea rows={rows} className={field} value={s[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-on-surface">{t("shop.receiptSettings.title")}</h1>
        <p className="text-xs text-text-muted mt-1">{t("shop.receiptSettings.intro")}</p>
      </div>
      {error && <p className="text-sm text-badge-discount">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <section className={`${card} p-4 space-y-3`}>
            <h2 className="font-semibold text-sm">{t("shop.receiptSettings.shopDetails")}</h2>
            {text("shop_name", t("shop.receiptSettings.shopName"))}
            {text("address", t("shop.receiptSettings.address"), t("shop.receiptSettings.addressHelp"))}
            <div className="grid sm:grid-cols-2 gap-3">
              {text("phone", t("shop.receiptSettings.phone"))}
              {text("email", t("shop.receiptSettings.email"))}
            </div>
            {text("website", t("shop.receiptSettings.website"))}
          </section>

          <section className={`${card} p-4 space-y-3`}>
            <h2 className="font-semibold text-sm">{t("shop.receiptSettings.logo")}</h2>
            <div className="flex items-center gap-3 flex-wrap">
              {s.logo_url && <img src={s.logo_url} alt="" className="h-16 max-w-[160px] object-contain bg-white rounded border border-border-light p-1" />}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
              <button type="button" className={btnGhost} disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {t("shop.receiptSettings.uploadLogo")}
              </button>
              {s.logo_url && (
                <button type="button" className={btnGhost} onClick={() => set("logo_url", "")}>
                  <Trash2 className="w-4 h-4" /> {t("shop.receiptSettings.removeLogo")}
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.show_logo} onChange={(e) => set("show_logo", e.target.checked)} /> {t("shop.receiptSettings.showLogo")}
            </label>
            <p className="text-xs text-text-muted">{t("shop.receiptSettings.logoHelp")}</p>
          </section>

          <section className={`${card} p-4 space-y-3`}>
            <h2 className="font-semibold text-sm">{t("shop.receiptSettings.terms")}</h2>
            {area("terms", t("shop.receiptSettings.saleTerms"), t("shop.receipt.returnPolicy"))}
            {area("custom_terms", t("shop.receiptSettings.customTerms"), t("shop.receipt.customTerms"))}
            {area("footer", t("shop.receiptSettings.footer"), t("shop.receipt.thanks"), 2)}
          </section>

          <div className="flex items-center gap-3">
            <button type="button" className={btnPrimary} disabled={saving || uploading} onClick={() => void save()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("shop.receiptSettings.save")}
            </button>
            {saved && (
              <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {t("shop.receiptSettings.saved")}
              </span>
            )}
          </div>
        </div>

        <section className={`${card} p-4 lg:sticky lg:top-4`}>
          <h2 className="font-semibold text-sm mb-3">{t("shop.receiptSettings.preview")}</h2>
          <div className="bg-white text-black text-[12px] p-4 rounded border border-border-light">
            <ReceiptShop s={s} />
            <div className="border-t border-b border-black my-3 py-6 text-center text-[11px] text-neutral-500">…</div>
            <Lines className="text-[10px]" text={s.terms || t("shop.receipt.returnPolicy")} />
            <Lines className="text-center mt-2" text={s.footer || t("shop.receipt.thanks")} />
          </div>
        </section>
      </div>
    </div>
  );
}
