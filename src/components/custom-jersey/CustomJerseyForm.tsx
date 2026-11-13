"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Check, FileText, Images, Loader2, Palette, Upload, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney, localized, type MessageKey } from "@/i18n";
import { Turnstile, TURNSTILE_ENABLED } from "@/components/checkout/Turnstile";
import { useAuth } from "@/components/auth/AuthProvider";
import { normalizeBdPhone } from "@/lib/phone";
import { estimate } from "@/lib/custom-jersey/pricing";
import { DESIGN_ACCEPT } from "@/lib/custom-jersey/files";
import { SPORTS, type Collar, type CustomJerseyConfig, type JerseyTemplate, type RosterRow, type Sleeve, type Sport, type UploadedFile } from "@/lib/custom-jersey/types";
import { JerseyPreview, svgToPng } from "./JerseyPreview";
import { RosterEditor } from "./RosterEditor";
import { LanguageToggle } from "./LanguageToggle";

const input = "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-card text-sm focus:outline-none focus:ring-1 focus:ring-primary";
const card = "bg-surface-card border border-border-light rounded-xl p-4 sm:p-5 flex flex-col gap-3";
const heading = "font-display uppercase font-bold text-primary text-sm tracking-wider";

function Choice({ active, onClick, children, className = "" }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border-light bg-surface-card hover:bg-surface-subtle"} ${className}`}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" className="w-4 h-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

async function uploadFile(file: File | Blob, kind: string, name?: string): Promise<UploadedFile & { url: string | null }> {
  const form = new FormData();
  form.append("file", file, name ?? (file instanceof File ? file.name : "preview.png"));
  form.append("kind", kind);
  const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json;
}

/** Shrinks a logo to at most 512px and returns it as a data: URL for the preview. */
function logoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the logo"));
    };
    image.src = url;
  });
}

export function CustomJerseyForm() {
  const { t, locale } = useT();
  const router = useRouter();
  const { user } = useAuth();
  const money = (n: number) => formatMoney(n, locale);

  const [config, setConfig] = useState<CustomJerseyConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [source, setSource] = useState<"upload" | "template">("upload");
  const [sport, setSport] = useState<Sport>("football");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>(["#0b3d91", "#ffffff", "#c89b3c"]);
  const [teamName, setTeamName] = useState("");
  const [sampleName, setSampleName] = useState("");
  const [sampleNumber, setSampleNumber] = useState("10");
  const [logo, setLogo] = useState<{ dataUrl: string; path: string } | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const frontRef = useRef<SVGSVGElement>(null);

  const [fabricId, setFabricId] = useState<string | null>(null);
  const [sleeve, setSleeve] = useState<Sleeve>("short");
  const [collar, setCollar] = useState<Collar>("round");
  const [withShorts, setWithShorts] = useState(false);
  const [withNames, setWithNames] = useState(false);
  const [withNumbers, setWithNumbers] = useState(false);
  const [withLogo, setWithLogo] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [useRoster, setUseRoster] = useState(false);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [neededBy, setNeededBy] = useState("");

  // null = not typed yet: the signed-in account's name and email are offered.
  const [typedName, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [typedEmail, setEmail] = useState<string | null>(null);
  const accountName = user?.user_metadata?.full_name;
  const name = typedName ?? (typeof accountName === "string" ? accountName : "");
  const email = typedEmail ?? user?.email ?? "";
  const [pickup, setPickup] = useState(false);
  const [zone, setZone] = useState<"dhaka" | "outside">("dhaka");
  const [address, setAddress] = useState("");
  const [galleryConsent, setGalleryConsent] = useState(false);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/custom-jersey/config")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        setConfig(json);
      })
      .catch((err) => setLoadError(err instanceof Error && err.message ? err.message : "unavailable"));
  }, []);

  const templates = useMemo(() => (config?.templates ?? []).filter((x) => x.sport === sport), [config, sport]);
  const template = templates.find((x) => x.id === templateId) ?? null;
  const fabric = config?.fabrics.find((f) => f.id === fabricId) ?? null;
  const activeRoster = useRoster ? roster.filter((r) => r.size) : [];

  const pickTemplate = (tpl: JerseyTemplate) => {
    setTemplateId(tpl.id);
    setColors(tpl.default_colors.slice(0, 3));
  };

  const result = useMemo(
    () =>
      config && fabric
        ? estimate(
            { fabricPrice: fabric.price_per_piece, quantity, sleeve, collar, withShorts, withNames, withNumbers, withLogo, roster: activeRoster.length ? activeRoster : undefined, neededBy: neededBy || null },
            config.pricing
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, fabric, quantity, sleeve, collar, withShorts, withNames, withNumbers, withLogo, useRoster, roster, neededBy]
  );
  const deliveryFee = !config || pickup ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(list).slice(0, 10 - files.length)) {
        const uploaded = await uploadFile(file, "design");
        setFiles((prev) => [...prev, { path: uploaded.path, name: uploaded.name, mime: uploaded.mime, size: uploaded.size, kind: "design" }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("customJersey.errors.generic"));
    } finally {
      setUploading(false);
    }
  };

  const addLogo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const [dataUrl, uploaded] = await Promise.all([logoDataUrl(file), uploadFile(file, "logo")]);
      setLogo({ dataUrl, path: uploaded.path });
      setWithLogo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("customJersey.errors.generic"));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const fail = (key: MessageKey) => setError(t(key));
    if (source === "upload" && files.length === 0 && !notes.trim()) return fail("customJersey.errors.needDesign");
    if (source === "template" && !template) return fail("customJersey.errors.needTemplate");
    if (!fabric) return fail("customJersey.errors.needFabric");
    if (result?.tooSoon) return setError(t("customJersey.date.tooSoon", { days: config.pricing.rush.min_days }));
    if (name.trim().length < 2) return fail("customJersey.errors.needName");
    if (!normalizeBdPhone(phone)) return fail("customJersey.errors.needPhone");
    if (!pickup && address.trim().length < 5) return fail("customJersey.errors.needAddress");
    if (TURNSTILE_ENABLED && !turnstileToken) return fail("customJersey.errors.security");

    setSubmitting(true);
    setError(null);
    try {
      // Keep the picture the customer saw, so the designer starts from the same one.
      let previewPath: string | null = null;
      if (source === "template" && frontRef.current) {
        const png = await svgToPng(frontRef.current).catch(() => null);
        if (png) previewPath = (await uploadFile(png, "preview", "preview.png").catch(() => null))?.path ?? null;
      }

      const res = await fetch("/api/custom-jersey/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The POS opens this form with ?shop=1 for an order taken at the counter.
          channel: new URLSearchParams(window.location.search).get("shop") === "1" ? "shop" : undefined,
          source,
          sport,
          files: source === "upload" ? files : [],
          notes,
          template_id: source === "template" ? template?.id : null,
          design: source === "template" ? { colors, team_name: teamName, name: sampleName, number: sampleNumber, logo_path: logo?.path ?? null, preview_path: previewPath } : {},
          fabric_id: fabric.id,
          sleeve,
          collar,
          with_shorts: withShorts,
          with_names: withNames,
          with_numbers: withNumbers,
          with_logo: withLogo,
          quantity,
          roster: activeRoster,
          needed_by: neededBy || null,
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          delivery_method: pickup ? "pickup" : "delivery",
          delivery_zone: zone,
          delivery_address: address,
          gallery_consent: galleryConsent,
          locale,
          turnstile_token: turnstileToken ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? t("customJersey.errors.generic"));
        setTurnstileReset((n) => n + 1);
        return;
      }
      router.push(`/custom-jersey/order/${json.token}?new=1`);
    } catch {
      setError(t("customJersey.errors.network"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="bg-surface-card border border-border-light rounded-xl p-6 text-sm text-text-muted flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-badge-discount" />
        <span>
          Custom jersey orders are not open on the website yet. Please call or WhatsApp us and we will take your order.
        </span>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="flex justify-center py-16 text-text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + config.pricing.rush.min_days);
  const minDateValue = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, "0")}-${String(minDate.getDate()).padStart(2, "0")}`;
  const previewProps = { pattern: template?.pattern ?? "plain", colors, sleeve, teamName, name: sampleName, number: sampleNumber, logo: logo?.dataUrl } as const;

  return (
    <form onSubmit={submit} className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-space-lg items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <ol className="hidden sm:flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            {(["one", "two", "three", "four"] as const).map((k, i) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                {t(`customJersey.steps.${k}`, { percent: config.pricing.advance_percent })}
              </li>
            ))}
          </ol>
          <LanguageToggle />
        </div>

        {/* 1. Path */}
        <section className={card}>
          <h2 className={heading}>{t("customJersey.path.label")}</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            <Choice active={source === "upload"} onClick={() => setSource("upload")} className="flex items-start gap-3 py-3">
              <Upload className="w-5 h-5 mt-0.5 shrink-0" />
              <span>
                <strong className="block">{t("customJersey.path.upload")}</strong>
                <span className="text-xs opacity-80">{t("customJersey.path.uploadHint")}</span>
              </span>
            </Choice>
            <Choice active={source === "template"} onClick={() => setSource("template")} className="flex items-start gap-3 py-3">
              <Palette className="w-5 h-5 mt-0.5 shrink-0" />
              <span>
                <strong className="block">{t("customJersey.path.template")}</strong>
                <span className="text-xs opacity-80">{t("customJersey.path.templateHint")}</span>
              </span>
            </Choice>
          </div>

          <h3 className="text-xs font-semibold mt-1">{t("customJersey.sport.label")}</h3>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <Choice
                key={s}
                active={sport === s}
                onClick={() => {
                  setSport(s);
                  setTemplateId(null);
                }}
              >
                {t(`customJersey.sport.${s}`)}
              </Choice>
            ))}
          </div>
        </section>

        {/* 2. Design */}
        {source === "upload" ? (
          <section className={card}>
            <h2 className={heading}>{t("customJersey.upload.label")}</h2>
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border-light rounded-xl py-6 px-3 text-center cursor-pointer hover:bg-surface-subtle">
              {uploading ? <Loader2 className="w-6 h-6 animate-spin text-text-muted" /> : <Upload className="w-6 h-6 text-text-muted" />}
              <span className="text-sm font-semibold">{uploading ? t("customJersey.upload.uploading") : t("customJersey.upload.add")}</span>
              <span className="text-xs text-text-muted">{t("customJersey.upload.hint")}</span>
              <input type="file" multiple accept={DESIGN_ACCEPT} className="hidden" disabled={uploading || files.length >= 10} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {files.map((f) => (
                  <li key={f.path} className="flex items-center gap-2 text-sm bg-surface-subtle rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 shrink-0 text-text-muted" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-text-muted tabular-nums">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button type="button" onClick={() => setFiles(files.filter((x) => x.path !== f.path))} aria-label={t("customJersey.upload.remove")} className="text-text-muted hover:text-badge-discount">
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="text-xs font-semibold" htmlFor="cj-notes">{t("customJersey.upload.notes")}</label>
            <textarea id="cj-notes" className="w-full rounded-lg border border-border-light bg-surface-card p-3 text-sm" rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("customJersey.upload.notesPlaceholder")} />
          </section>
        ) : (
          <section className={card}>
            <h2 className={heading}>{t("customJersey.template.label")}</h2>
            {templates.length === 0 ? (
              <p className="text-sm text-text-muted">{t("customJersey.template.none")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => pickTemplate(tpl)}
                    aria-pressed={templateId === tpl.id}
                    className={`rounded-lg border p-2 bg-surface-subtle flex flex-col items-center gap-1 ${templateId === tpl.id ? "border-primary ring-1 ring-primary" : "border-border-light"}`}
                  >
                    <JerseyPreview pattern={tpl.pattern} colors={tpl.default_colors} side="front" className="w-full h-auto" />
                    <span className="text-xs font-semibold">{localized(tpl as unknown as Record<string, unknown>, "name", locale)}</span>
                  </button>
                ))}
              </div>
            )}

            {template && (
              <div className="grid sm:grid-cols-[220px_minmax(0,1fr)] gap-4 mt-2">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-full bg-surface-subtle rounded-xl p-3">
                    {/* The front is always mounted (hidden when the back is shown): it is the picture saved with the order. */}
                    <JerseyPreview ref={frontRef} {...previewProps} side="front" className={`w-full h-auto ${side === "front" ? "" : "hidden"}`} />
                    {side === "back" && <JerseyPreview {...previewProps} side="back" className="w-full h-auto" />}
                  </div>
                  <div className="flex gap-1">
                    {(["front", "back"] as const).map((s) => (
                      <Choice key={s} active={side === s} onClick={() => setSide(s)} className="px-4 py-1 text-xs">
                        {t(`customJersey.template.${s}`)}
                      </Choice>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-xs font-semibold">{t("customJersey.template.colors")}</span>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {(["primary", "secondary", "accent"] as const).map((k, i) => (
                        <label key={k} className="flex items-center gap-2 text-xs">
                          <input type="color" value={colors[i]} onChange={(e) => setColors(colors.map((c, x) => (x === i ? e.target.value : c)))} className="w-9 h-9 rounded border border-border-light bg-surface-card p-0.5 cursor-pointer" />
                          {t(`customJersey.template.${k}`)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2 text-xs font-semibold flex flex-col gap-1">
                      {t("customJersey.template.teamName")}
                      <input className={input} value={teamName} maxLength={24} onChange={(e) => setTeamName(e.target.value)} onFocus={() => setSide("front")} />
                    </label>
                    <label className="text-xs font-semibold flex flex-col gap-1">
                      {t("customJersey.template.sampleName")}
                      <input className={input} value={sampleName} maxLength={14} onChange={(e) => setSampleName(e.target.value)} onFocus={() => setSide("back")} />
                    </label>
                    <label className="text-xs font-semibold flex flex-col gap-1">
                      {t("customJersey.template.sampleNumber")}
                      <input className={input} value={sampleNumber} maxLength={3} inputMode="numeric" onChange={(e) => setSampleNumber(e.target.value.replace(/[^\d০-৯]/g, ""))} />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light bg-surface-card font-semibold cursor-pointer hover:bg-surface-subtle">
                      <Images className="w-4 h-4" /> {t("customJersey.template.logo")}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void addLogo(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    {logo ? (
                      <button type="button" className="text-text-muted hover:text-badge-discount inline-flex items-center gap-1" onClick={() => setLogo(null)}>
                        <X className="w-3.5 h-3.5" /> {t("customJersey.upload.remove")}
                      </button>
                    ) : (
                      <span className="text-text-muted">{t("customJersey.template.logoHint")}</span>
                    )}
                  </div>
                  <textarea className="w-full rounded-lg border border-border-light bg-surface-card p-3 text-sm" rows={2} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("customJersey.upload.notesPlaceholder")} aria-label={t("customJersey.upload.notes")} />
                  <p className="text-xs text-text-muted">{t("customJersey.template.previewNote")}</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 3. Fabric */}
        <section className={card}>
          <h2 className={heading}>{t("customJersey.fabric.label")}</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {config.fabrics.map((f) => {
              const row = f as unknown as Record<string, unknown>;
              const active = fabricId === f.id;
              return (
                <button key={f.id} type="button" onClick={() => setFabricId(f.id)} aria-pressed={active} className={`text-left rounded-lg border p-3 flex gap-3 ${active ? "border-primary ring-1 ring-primary bg-surface-subtle" : "border-border-light bg-surface-card hover:bg-surface-subtle"}`}>
                  {f.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.image_url} alt="" className="w-14 h-14 rounded-md object-cover border border-border-light shrink-0" />
                  )}
                  <span className="min-w-0">
                    <strong className="text-sm flex items-center gap-1.5">
                      {localized(row, "name", locale)} {active && <Check className="w-4 h-4 text-emerald-600" />}
                    </strong>
                    <span className="block text-xs text-text-muted">{localized(row, "description", locale)}</span>
                    <span className="block text-xs font-semibold text-primary mt-1 tabular-nums">{t("customJersey.fabric.perPiece", { price: money(f.price_per_piece) })}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Options */}
        <section className={card}>
          <h2 className={heading}>{t("customJersey.options.label")}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">{t("customJersey.options.sleeve")}</span>
              <div className="flex gap-2">
                {(["short", "full"] as const).map((s) => (
                  <Choice key={s} active={sleeve === s} onClick={() => setSleeve(s)}>{t(`customJersey.options.${s}`)}</Choice>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">{t("customJersey.options.collar")}</span>
              <div className="flex flex-wrap gap-2">
                {(["round", "v", "polo"] as const).map((c) => (
                  <Choice key={c} active={collar === c} onClick={() => setCollar(c)}>{t(`customJersey.options.${c}`)}</Choice>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Toggle checked={withNames} onChange={setWithNames} label={t("customJersey.options.names")} />
            <Toggle checked={withNumbers} onChange={setWithNumbers} label={t("customJersey.options.numbers")} />
            <Toggle checked={withLogo} onChange={setWithLogo} label={t("customJersey.options.logo")} />
            <Toggle checked={withShorts} onChange={setWithShorts} label={t("customJersey.options.shorts")} />
          </div>
        </section>

        {/* 5. Quantity and team list */}
        <section className={card}>
          <h2 className={heading}>{t("customJersey.quantity.label")}</h2>
          {useRoster && activeRoster.length > 0 ? (
            <p className="text-sm font-semibold">{t("customJersey.quantity.fromRoster", { count: activeRoster.length })}</p>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={2000} className={`${input} w-28`} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(2000, Math.floor(Number(e.target.value)) || 1)))} aria-label={t("customJersey.quantity.label")} />
              <span className="text-sm text-text-muted">{t("customJersey.quantity.pieces")}</span>
            </div>
          )}
          <Toggle checked={useRoster} onChange={setUseRoster} label={t("customJersey.quantity.useRoster")} />
          {useRoster && <RosterEditor rows={roster} onChange={setRoster} defaultSleeve={sleeve} />}
        </section>

        {/* 6. Date */}
        <section className={card}>
          <h2 className={heading}>{t("customJersey.date.label")}</h2>
          <input type="date" className={`${input} w-48`} value={neededBy} min={minDateValue} onChange={(e) => setNeededBy(e.target.value)} aria-label={t("customJersey.date.label")} />
          <p className="text-xs text-text-muted">
            {t("customJersey.date.hint", { days: config.pricing.rush.normal_days })} {config.pricing.rush.percent > 0 && t("customJersey.date.rush", { days: config.pricing.rush.normal_days, percent: config.pricing.rush.percent })}{" "}
            {t("customJersey.date.optional")}
          </p>
          {result?.tooSoon && <p className="text-xs text-badge-discount">{t("customJersey.date.tooSoon", { days: config.pricing.rush.min_days })}</p>}
        </section>

        {/* 7. Contact */}
        <section className={card}>
          <h2 className={heading}>{t("customJersey.contact.label")}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold flex flex-col gap-1">
              {t("customJersey.contact.name")}
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
            <label className="text-xs font-semibold flex flex-col gap-1">
              {t("customJersey.contact.phone")}
              <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" required />
            </label>
            <label className="text-xs font-semibold flex flex-col gap-1 sm:col-span-2">
              {t("customJersey.contact.email")}
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Choice active={!pickup} onClick={() => setPickup(false)}>{t("customJersey.contact.delivery")}</Choice>
            <Choice active={pickup} onClick={() => setPickup(true)}>{t("customJersey.contact.pickup")}</Choice>
          </div>
          {!pickup && (
            <>
              <div className="flex flex-wrap gap-2">
                <Choice active={zone === "dhaka"} onClick={() => setZone("dhaka")}>{t("customJersey.contact.dhaka", { fee: money(config.delivery.dhaka) })}</Choice>
                <Choice active={zone === "outside"} onClick={() => setZone("outside")}>{t("customJersey.contact.outside", { fee: money(config.delivery.outside) })}</Choice>
              </div>
              <textarea className="w-full rounded-lg border border-border-light bg-surface-card p-3 text-sm" rows={2} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("customJersey.contact.address")} aria-label={t("customJersey.contact.address")} autoComplete="street-address" />
            </>
          )}
          <Toggle checked={galleryConsent} onChange={setGalleryConsent} label={t("customJersey.contact.galleryConsent")} />
        </section>
      </div>

      {/* Estimate */}
      <aside className="lg:sticky lg:top-24 bg-surface-card border border-border-light rounded-xl p-4 sm:p-5 flex flex-col gap-3">
        <h2 className={heading}>{t("customJersey.estimate.title")}</h2>
        {result && fabric ? (
          <>
            <ul className="flex flex-col gap-1.5 text-sm">
              {result.lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3">
                  <span className="text-text-muted">
                    {l.key === "fabric" ? t("customJersey.estimate.fabric", { fabric: localized(fabric as unknown as Record<string, unknown>, "name", locale) }) : t(`customJersey.estimate.${l.key}`)}
                    {l.key !== "rush" && <span className="tabular-nums"> · {money(l.unit)} × {l.quantity}</span>}
                  </span>
                  <span className="tabular-nums font-medium">{money(l.amount)}</span>
                </li>
              ))}
              {!pickup && (
                <li className="flex justify-between gap-3">
                  <span className="text-text-muted">{t("customJersey.estimate.delivery")}</span>
                  <span className="tabular-nums font-medium">{money(deliveryFee)}</span>
                </li>
              )}
            </ul>
            {result.discountPercent > 0 && <p className="text-xs text-emerald-700">{t("customJersey.estimate.discount", { percent: result.discountPercent })}</p>}
            <div className="border-t border-border-light pt-3 flex justify-between items-baseline">
              <span className="text-sm font-semibold">{t("customJersey.estimate.total")}</span>
              <span className="font-display text-2xl font-bold text-primary tabular-nums">{money(result.total + deliveryFee)}</span>
            </div>
            <p className="text-xs text-text-muted -mt-2 text-right">{t("customJersey.estimate.perPiece", { price: money(result.perPiece) })}</p>
          </>
        ) : (
          <p className="text-sm text-text-muted">{t("customJersey.estimate.chooseFabric")}</p>
        )}
        <p className="text-xs text-text-muted bg-surface-subtle rounded-lg p-2.5">{t("customJersey.estimate.note")}</p>

        <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
        {error && (
          <p className="text-xs text-badge-discount flex items-start gap-1.5" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}
        <button type="submit" disabled={submitting || uploading} className="h-11 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {submitting ? t("customJersey.submitting") : t("customJersey.submit")}
        </button>
        <Link href="/custom-jersey/gallery" className="text-xs text-center text-primary underline underline-offset-2">
          {t("customJersey.seeGallery")}
        </Link>
      </aside>
    </form>
  );
}
