"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  Images,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Palette,
  Phone,
  Plus,
  Store,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { usePasteDrop } from "./usePasteDrop";
import { OurDesignsPicker, type GalleryDesign } from "./OurDesignsPicker";
import { useT } from "@/i18n/client";
import { formatMoney, localized, type MessageKey } from "@/i18n";
import { Turnstile, TURNSTILE_ENABLED } from "@/components/checkout/Turnstile";
import { useAuth } from "@/components/auth/AuthProvider";
import { normalizeBdPhone } from "@/lib/phone";
import { advanceFor, estimate, logoPrice } from "@/lib/custom-jersey/pricing";
import { DESIGN_ACCEPT } from "@/lib/custom-jersey/files";
import { JERSEY_TYPES, LOGO_TYPES, SPORTS, type Collar, type LogoType, type CustomJerseyConfig, type JerseyTemplate, type RosterRow, type Sleeve, type Sport, type UploadedFile } from "@/lib/custom-jersey/types";
import { JerseyPreview, svgToPng } from "./JerseyPreview";
import { RosterEditor } from "./RosterEditor";

/*
 * Storefront custom jersey order form.
 *
 * Laid out as numbered steps with a live summary (preview + estimate) beside
 * them on desktop and a sticky total bar on phones. The price shown here is
 * only an estimate for the customer: the order API recomputes it with the
 * same estimate() and the designer sets the final price.
 */

const input =
  "w-full h-11 px-3.5 rounded-xl border border-border-light bg-surface-card text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-accent-gold focus:ring-2 focus:ring-accent-gold/25 transition";
const textarea =
  "w-full rounded-xl border border-border-light bg-surface-card p-3.5 text-sm text-on-surface placeholder:text-text-muted focus:outline-none focus:border-accent-gold focus:ring-2 focus:ring-accent-gold/25 transition";
const label = "text-xs font-semibold text-on-surface-variant";

type SectionId = "cj-design" | "cj-fabric" | "cj-style" | "cj-quantity" | "cj-date" | "cj-contact" | "cj-submit";

/** A selectable card: gold ring and tick when chosen. */
function OptionCard({ active, onClick, children, className = "" }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative text-left rounded-xl border p-3.5 transition-all ${
        active
          ? "border-accent-gold bg-accent-gold-soft ring-2 ring-accent-gold/30"
          : "border-border-light bg-surface-card hover:border-on-surface-variant/40 hover:shadow-sm"
      } ${className}`}
    >
      {active && (
        <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-accent-gold text-white flex items-center justify-center">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

/** A pill in a row of choices (sport, sleeve, collar, zone). */
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 px-4 rounded-full border text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border-light bg-surface-card text-on-surface hover:border-on-surface-variant/50"
      }`}
    >
      {children}
    </button>
  );
}

/** A numbered step: the badge turns into a tick once the step is complete. */
function Step({ id, n, title, sub, done, error, children }: { id: SectionId; n: number; title: string; sub?: string; done?: boolean; error?: string | null; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-36 lg:scroll-mt-44 bg-surface-card border border-border-light rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="flex items-start gap-3.5 px-4 sm:px-6 pt-5 sm:pt-6">
        <span
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-display text-sm font-bold transition-colors ${
            done ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"
          }`}
          aria-hidden
        >
          {done ? <Check className="w-4 h-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="font-display text-lg sm:text-xl font-bold text-on-surface leading-tight">{title}</h2>
          {sub && <p className="text-sm text-text-muted mt-1">{sub}</p>}
        </div>
      </header>
      <div className="px-4 sm:px-6 pb-5 sm:pb-6 pt-4 flex flex-col gap-4">
        {error && <ErrorNote text={error} />}
        {children}
      </div>
    </section>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm text-badge-discount bg-badge-discount/10 border border-badge-discount/25 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {text}
    </p>
  );
}

function AddOn({ checked, onChange, title, price }: { checked: boolean; onChange: (v: boolean) => void; title: string; price: string | null }) {
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-all ${
        checked ? "border-accent-gold bg-accent-gold-soft ring-2 ring-accent-gold/30" : "border-border-light bg-surface-card hover:border-on-surface-variant/40"
      }`}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? "bg-accent-gold border-accent-gold text-white" : "border-border-light bg-surface-card"}`}>
        {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0 text-sm font-semibold text-on-surface">{title}</span>
      {price && <span className="text-xs font-semibold text-text-muted tabular-nums whitespace-nowrap">{price}</span>}
    </label>
  );
}

function CheckLine({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-on-surface-variant cursor-pointer">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[rgb(var(--c-accent-gold))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
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
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);

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
  const [logoType, setLogoType] = useState<LogoType | null>(null);
  const [collarUploading, setCollarUploading] = useState(false);
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

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Where the problem is, so the message shows inside that step and the page scrolls to it.
  const [error, setError] = useState<{ text: string; at: SectionId } | null>(null);

  // The sticky phone bar hides while the real submit button is on screen.
  const submitRef = useRef<HTMLDivElement>(null);
  const [submitVisible, setSubmitVisible] = useState(false);
  useEffect(() => {
    const el = submitRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setSubmitVisible(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [config]);

  useEffect(() => {
    fetch("/api/custom-jersey/config")
      .then(async (r) => {
        const json = (await r.json()) as CustomJerseyConfig & { error?: string };
        if (!r.ok) throw new Error(json.error);
        setConfig(json);
        // Start with the first fabric so the price shows straight away; the customer can change it.
        setFabricId((id) => id ?? json.fabrics[0]?.id ?? null);
      })
      .catch((err) => setLoadError(err instanceof Error && err.message ? err.message : "unavailable"));
  }, []);

  // /custom-jersey?design=<id> (from the gallery's "Use this design") starts with that design picked.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("design");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    fetch(`/api/custom-jersey/designs?ids=${id}`)
      .then((r) => r.json())
      .then((json) => {
        const d = (json.designs ?? [])[0] as GalleryDesign | undefined;
        if (d) setFiles((prev) => (prev.some((x) => x.design_id === d.id) ? prev : [...prev, designFile(d)]));
      })
      .catch(() => {});
  }, []);

  const templates = useMemo(() => (config?.templates ?? []).filter((x) => x.sport === sport), [config, sport]);
  const template = templates.find((x) => x.id === templateId) ?? null;
  const fabric = config?.fabrics.find((f) => f.id === fabricId) ?? null;
  const activeRoster = useRoster ? roster.filter((r) => r.size) : [];
  const pieces = activeRoster.length || quantity;

  const pickTemplate = (tpl: JerseyTemplate) => {
    setTemplateId(tpl.id);
    setColors(tpl.default_colors.slice(0, 3));
  };

  const result = useMemo(
    () =>
      config && fabric
        ? estimate(
            { fabricPrice: fabric.price_per_piece, fabricTiers: fabric.price_tiers, quantity, sleeve, collar, withShorts, withNames, withNumbers, logoType, roster: activeRoster.length ? activeRoster : undefined, neededBy: neededBy || null },
            config.pricing
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, fabric, quantity, sleeve, collar, withShorts, withNames, withNumbers, logoType, useRoster, roster, neededBy]
  );
  const deliveryFee = !config || pickup ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;
  const grandTotal = result ? result.total + deliveryFee : 0;

  // Step completion (drives the ticks and the progress bar).
  const designDone = source === "upload" ? files.length > 0 || notes.trim().length > 0 : Boolean(template);
  const contactDone = name.trim().length >= 2 && Boolean(normalizeBdPhone(phone)) && (pickup || address.trim().length >= 5);
  const required = [designDone, Boolean(fabric), contactDone];
  const doneCount = required.filter(Boolean).length;

  const fail = (at: SectionId, text: string) => {
    setError({ text, at });
    document.getElementById(at)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const errorAt = (at: SectionId) => (error?.at === at ? error.text : null);

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(list).slice(0, 10 - files.length)) {
        const uploaded = await uploadFile(file, "design");
        if (file.type.startsWith("image/")) previewUrls.set(uploaded.path, URL.createObjectURL(file));
        setFiles((prev) => [...prev, { path: uploaded.path, name: uploaded.name, mime: uploaded.mime, size: uploaded.size, kind: "design" }]);
      }
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t("customJersey.errors.generic"), at: "cj-design" });
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
      setLogoType((v) => v ?? "print");
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t("customJersey.errors.generic"), at: "cj-design" });
    }
  };

  // An optional picture of the collar / neck, kept with the design pictures under the "collar" tag.
  const collarTag = t("customJersey.upload.tags.collar");
  const collarFile = files.find((f) => f.note === collarTag && !f.design_id);
  const addCollarPicture = async (file: File | undefined) => {
    if (!file) return;
    setCollarUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, "design");
      if (file.type.startsWith("image/")) previewUrls.set(uploaded.path, URL.createObjectURL(file));
      setFiles((prev) => [...prev.filter((f) => f !== collarFile), { path: uploaded.path, name: uploaded.name, mime: uploaded.mime, size: uploaded.size, kind: "design", note: collarTag }]);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t("customJersey.errors.generic"), at: "cj-style" });
    } finally {
      setCollarUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const need = (at: SectionId, key: MessageKey) => fail(at, t(key));
    if (source === "upload" && files.length === 0 && !notes.trim()) return need("cj-design", "customJersey.errors.needDesign");
    if (source === "template" && !template) return need("cj-design", "customJersey.errors.needTemplate");
    if (!fabric) return need("cj-fabric", "customJersey.errors.needFabric");
    if (result?.tooSoon) return fail("cj-date", t("customJersey.date.tooSoon", { days: config.pricing.rush.min_days }));
    if (name.trim().length < 2) return need("cj-contact", "customJersey.errors.needName");
    if (!normalizeBdPhone(phone)) return need("cj-contact", "customJersey.errors.needPhone");
    if (!pickup && address.trim().length < 5) return need("cj-contact", "customJersey.errors.needAddress");
    if (TURNSTILE_ENABLED && !turnstileToken) return need("cj-submit", "customJersey.errors.security");

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
          // A template order sends only the extra pictures the customer added.
          files,
          notes,
          template_id: source === "template" ? template?.id : null,
          design: source === "template" ? { colors, team_name: teamName, name: sampleName, number: sampleNumber, logo_path: logo?.path ?? null, preview_path: previewPath } : {},
          fabric_id: fabric.id,
          sleeve,
          collar,
          with_shorts: withShorts,
          with_names: withNames,
          with_numbers: withNumbers,
          with_logo: Boolean(logoType),
          logo_type: logoType,
          quantity,
          roster: activeRoster,
          needed_by: neededBy || null,
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          delivery_method: pickup ? "pickup" : "delivery",
          delivery_zone: zone,
          delivery_address: address,
          locale,
          turnstile_token: turnstileToken ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        fail("cj-submit", json.error ?? t("customJersey.errors.generic"));
        setTurnstileReset((n) => n + 1);
        return;
      }
      router.push(`/custom-jersey/order/${json.token}?new=1`);
    } catch {
      fail("cj-submit", t("customJersey.errors.network"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="bg-surface-card border border-border-light rounded-2xl p-6 text-sm text-on-surface-variant flex items-start gap-3">
        <AlertCircle className="w-5 h-5 shrink-0 text-badge-discount" />
        <span>
          {t("customJersey.errors.generic")}{" "}
          <a href="tel:+8809677666888" className="font-semibold text-on-surface underline underline-offset-2">
            +880 9677 666 888
          </a>
        </span>
      </div>
    );
  }
  if (!config) return <FormSkeleton />;

  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + config.pricing.rush.min_days);
  const minDateValue = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, "0")}-${String(minDate.getDate()).padStart(2, "0")}`;
  const previewProps = { pattern: template?.pattern ?? "plain", colors, sleeve, teamName, name: sampleName, number: sampleNumber, logo: logo?.dataUrl } as const;
  const extras = config.pricing.extras;
  const plus = (n: number | undefined) => (n && n > 0 ? t("home.cj.perPiece", { price: money(n) }) : t("customJersey.options.free"));

  // Quick quantity chips: the fabric's own price breaks, else the general discount tiers.
  const quickPicks: { n: number; text: string }[] = fabric?.price_tiers?.length
    ? fabric.price_tiers.map((x) => ({ n: x.min, text: t("home.cj.tierPrice", { n: num(x.min), price: money(x.price) }) }))
    : config.pricing.tiers.filter((x) => x.discount_percent > 0).map((x) => ({ n: x.min, text: t("home.cj.tierDiscount", { n: num(x.min), percent: num(x.discount_percent) }) }));

  // Pictures to show in the summary when the customer brings their own design.
  const pictures = files.map((f) => (f.design_id ? f.path : previewUrls.get(f.path))).filter((src): src is string => Boolean(src));

  return (
    <form onSubmit={submit} onChange={() => error && error.at !== "cj-submit" && setError(null)} noValidate className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-8 items-start">
      <div className="flex flex-col gap-5 min-w-0">
        {/* 1. Design */}
        <Step id="cj-design" n={1} title={t("home.cj.sections.design")} sub={t("home.cj.sections.designSub")} done={designDone} error={errorAt("cj-design")}>
          <div className="grid sm:grid-cols-2 gap-3">
            <OptionCard active={source === "upload"} onClick={() => setSource("upload")} className="flex items-start gap-3 pr-9">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm text-on-surface">{t("customJersey.path.upload")}</strong>
                <span className="block text-xs text-text-muted mt-0.5">{t("customJersey.path.uploadHint")}</span>
              </span>
            </OptionCard>
            <OptionCard active={source === "template"} onClick={() => setSource("template")} className="flex items-start gap-3 pr-9">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-accent-gold text-white flex items-center justify-center">
                <Palette className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm text-on-surface">{t("customJersey.path.template")}</strong>
                <span className="block text-xs text-text-muted mt-0.5">{t("customJersey.path.templateHint")}</span>
              </span>
            </OptionCard>
          </div>

          <div className="flex flex-col gap-2">
            <span className={label}>{t("customJersey.sport.label")}</span>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <Pill
                  key={s}
                  active={sport === s}
                  onClick={() => {
                    setSport(s);
                    setTemplateId(null);
                  }}
                >
                  {t(`customJersey.sport.${s}`)}
                </Pill>
              ))}
            </div>
          </div>

          {source === "upload" ? (
            <>
              <DesignFiles files={files} setFiles={setFiles} uploading={uploading} onAdd={addFiles} />
              <label className="flex flex-col gap-1.5">
                <span className={label}>{t("customJersey.upload.notes")}</span>
                <textarea className={textarea} rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("customJersey.upload.notesPlaceholder")} />
              </label>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <span className={label}>{t("customJersey.template.label")}</span>
                {templates.length === 0 ? (
                  <p className="text-sm text-text-muted bg-surface-subtle rounded-xl p-4">{t("customJersey.template.none")}</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                    {templates.map((tpl) => {
                      const on = templateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => pickTemplate(tpl)}
                          aria-pressed={on}
                          className={`group rounded-xl border p-2 pb-2.5 flex flex-col items-center gap-1.5 transition-all ${
                            on ? "border-accent-gold bg-accent-gold-soft ring-2 ring-accent-gold/30" : "border-border-light bg-surface-subtle hover:border-on-surface-variant/40"
                          }`}
                        >
                          <JerseyPreview pattern={tpl.pattern} colors={tpl.default_colors} side="front" className="w-full h-auto transition-transform group-hover:scale-105" />
                          <span className="text-xs font-semibold text-on-surface">{localized(tpl as unknown as Record<string, unknown>, "name", locale)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {template && (
                <div className="grid sm:grid-cols-[240px_minmax(0,1fr)] gap-5 rounded-2xl bg-surface-subtle p-4">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-full rounded-xl bg-gradient-to-b from-surface-card to-surface-container p-4">
                      {/* The front is always mounted (hidden when the back is shown): it is the picture saved with the order. */}
                      <JerseyPreview ref={frontRef} {...previewProps} side="front" className={`w-full h-auto drop-shadow-xl ${side === "front" ? "" : "hidden"}`} />
                      {side === "back" && <JerseyPreview {...previewProps} side="back" className="w-full h-auto drop-shadow-xl" />}
                    </div>
                    <div className="inline-flex p-1 rounded-full bg-surface-card border border-border-light">
                      {(["front", "back"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSide(s)}
                          aria-pressed={side === s}
                          className={`h-8 px-4 rounded-full text-xs font-bold transition-colors ${side === s ? "bg-primary text-primary-foreground" : "text-on-surface-variant"}`}
                        >
                          {t(`customJersey.template.${s}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 min-w-0">
                    <div className="flex flex-col gap-2">
                      <span className={label}>{t("customJersey.template.colors")}</span>
                      <div className="flex flex-wrap gap-3">
                        {(["primary", "secondary", "accent"] as const).map((k, i) => (
                          <label key={k} className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                            <span className="relative w-10 h-10 rounded-full border-2 border-surface-card shadow ring-1 ring-border-light overflow-hidden" style={{ background: colors[i] }}>
                              <input
                                type="color"
                                value={colors[i]}
                                onChange={(e) => setColors(colors.map((c, x) => (x === i ? e.target.value : c)))}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                aria-label={t(`customJersey.template.${k}`)}
                              />
                            </span>
                            {t(`customJersey.template.${k}`)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className={label}>{t("customJersey.template.teamName")}</span>
                        <input className={input} value={teamName} maxLength={24} onChange={(e) => setTeamName(e.target.value)} onFocus={() => setSide("front")} />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className={label}>{t("customJersey.template.sampleName")}</span>
                        <input className={input} value={sampleName} maxLength={14} onChange={(e) => setSampleName(e.target.value)} onFocus={() => setSide("back")} />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className={label}>{t("customJersey.template.sampleNumber")}</span>
                        <input
                          className={input}
                          value={sampleNumber}
                          maxLength={3}
                          inputMode="numeric"
                          onChange={(e) => setSampleNumber(e.target.value.replace(/[^\d০-৯]/g, ""))}
                          onFocus={() => setSide("back")}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <label className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border-light bg-surface-card font-semibold text-on-surface cursor-pointer hover:border-on-surface-variant/40">
                        <Images className="w-4 h-4" /> {t("customJersey.template.logo")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            void addLogo(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {logo ? (
                        <button type="button" className="text-text-muted hover:text-badge-discount inline-flex items-center gap-1" onClick={() => setLogo(null)}>
                          <X className="w-3.5 h-3.5" /> {t("customJersey.upload.remove")}
                        </button>
                      ) : (
                        <span className="text-text-muted">{t("customJersey.template.logoHint")}</span>
                      )}
                    </div>
                    <textarea className={textarea} rows={2} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("customJersey.upload.notesPlaceholder")} aria-label={t("customJersey.upload.notes")} />
                    <p className="text-xs text-text-muted">{t("customJersey.template.previewNote")}</p>
                  </div>
                </div>
              )}
              {template && (
                <div className="flex flex-col gap-2">
                  <span className={label}>{t("customJersey.upload.extraLabel")}</span>
                  <DesignFiles files={files} setFiles={setFiles} uploading={uploading} onAdd={addFiles} />
                </div>
              )}
            </>
          )}
        </Step>

        {/* 2. Fabric */}
        <Step id="cj-fabric" n={2} title={t("home.cj.sections.fabric")} sub={t("home.cj.sections.fabricSub")} done={Boolean(fabric)} error={errorAt("cj-fabric")}>
          <div className="grid sm:grid-cols-2 gap-3">
            {config.fabrics.map((f) => {
              const row = f as unknown as Record<string, unknown>;
              const active = fabricId === f.id;
              const description = localized(row, "description", locale);
              return (
                <OptionCard key={f.id} active={active} onClick={() => setFabricId(f.id)} className="flex gap-3 pr-9">
                  {f.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-border-light shrink-0" />
                  )}
                  <span className="min-w-0 flex flex-col gap-1">
                    <strong className="text-sm text-on-surface">{localized(row, "name", locale)}</strong>
                    {description && <span className="text-xs text-text-muted leading-snug">{description}</span>}
                    <span className="text-sm font-bold text-on-surface tabular-nums">{t("customJersey.fabric.perPiece", { price: money(f.price_per_piece) })}</span>
                    {f.price_tiers?.length ? (
                      <span className="self-start inline-flex items-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">
                        {t("home.cj.bulk")}: {f.price_tiers.map((x) => `${num(x.min)}+ → ${money(x.price)}`).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </OptionCard>
              );
            })}
          </div>
        </Step>

        {/* 3. Style */}
        <Step id="cj-style" n={3} title={t("home.cj.sections.style")} sub={t("home.cj.sections.styleSub")} done>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
              <span className={label}>{t("customJersey.options.sleeve")}</span>
              <div className="flex flex-wrap gap-2">
                <Pill active={sleeve === "short"} onClick={() => setSleeve("short")}>{t("customJersey.options.short")}</Pill>
                <Pill active={sleeve === "full"} onClick={() => setSleeve("full")}>
                  {t("customJersey.options.full")}
                  {extras.full_sleeve > 0 && <span className="text-[11px] opacity-70 tabular-nums">+{money(extras.full_sleeve)}</span>}
                </Pill>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>{t("customJersey.options.jerseyType")}</span>
            <div className="grid grid-cols-2 gap-2.5">
              {JERSEY_TYPES.map((c) => (
                <OptionCard key={c} active={(collar === "polo" ? "polo" : "round") === c} onClick={() => setCollar(c)} className="flex flex-col gap-0.5 pr-9">
                  <strong className="text-sm text-on-surface">{t(c === "polo" ? "customJersey.options.poloName" : "customJersey.options.tshirtName")}</strong>
                  <span className="text-xs text-text-muted">{t(c === "polo" ? "customJersey.options.poloSub" : "customJersey.options.tshirtSub")}</span>
                  <span className="text-[11px] font-semibold text-text-muted tabular-nums">
                    {c === "polo" && extras.polo_collar > 0 ? `+${money(extras.polo_collar)}` : t("customJersey.options.free")}
                  </span>
                </OptionCard>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-border-light px-3.5 py-3">
              {collarFile && previewUrls.get(collarFile.path) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrls.get(collarFile.path)} alt="" className="w-12 h-12 rounded-lg object-cover border border-border-light" />
              ) : null}
              <span className="flex-1 min-w-[12rem] text-xs text-text-muted">
                <strong className="block text-sm text-on-surface">{t("customJersey.options.collarPicture")}</strong>
                {collarFile ? t("customJersey.options.collarPictureAdded") : t("customJersey.options.collarPictureHint")}
              </span>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-card px-3 py-2 text-xs font-semibold text-on-surface cursor-pointer hover:bg-surface-subtle">
                {collarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {t("customJersey.options.collarPictureAdd")}
                <input type="file" accept="image/*" className="sr-only" disabled={collarUploading} onChange={(e) => { void addCollarPicture(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {collarFile && (
                <button type="button" onClick={() => setFiles((prev) => prev.filter((f) => f !== collarFile))} className="p-2 rounded-lg text-text-muted hover:text-badge-discount" aria-label={t("customJersey.upload.remove")}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {errorAt("cj-style") && <ErrorNote text={errorAt("cj-style")!} />}
          </div>
          <div className="flex flex-col gap-2">
            <span className={label}>{t("customJersey.options.logo")} <span className="font-normal normal-case text-text-muted">· {t("customJersey.options.logoHint")}</span></span>
            <div className="flex flex-wrap gap-2">
              <Pill active={!logoType} onClick={() => setLogoType(null)}>{t("customJersey.options.logoTypes.none")}</Pill>
              {LOGO_TYPES.map((lt) => {
                const price = logoPrice(config.pricing, lt);
                return (
                  <Pill key={lt} active={logoType === lt} onClick={() => setLogoType(lt)}>
                    {t(`customJersey.options.logoTypes.${lt}`)}
                    <span className="text-[11px] opacity-70 tabular-nums">{price > 0 ? `+${money(price)}` : t("customJersey.options.free")}</span>
                  </Pill>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <AddOn checked={withNames} onChange={setWithNames} title={t("customJersey.options.names")} price={plus(extras.name)} />
            <AddOn checked={withNumbers} onChange={setWithNumbers} title={t("customJersey.options.numbers")} price={plus(extras.number)} />
            <AddOn checked={withShorts} onChange={setWithShorts} title={t("customJersey.options.shorts")} price={plus(extras.shorts)} />
          </div>
        </Step>

        {/* 4. Quantity and team list */}
        <Step id="cj-quantity" n={4} title={t("home.cj.sections.quantity")} sub={t("home.cj.sections.quantitySub")} done={pieces > 0}>
          {useRoster && activeRoster.length > 0 ? (
            <p className="text-sm font-semibold text-on-surface bg-surface-subtle rounded-xl px-4 py-3">{t("customJersey.quantity.fromRoster", { count: num(activeRoster.length) })}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-xl border border-border-light bg-surface-card overflow-hidden">
                <button type="button" className="w-11 h-11 flex items-center justify-center text-on-surface hover:bg-surface-subtle disabled:opacity-40" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="-">
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  className="w-16 h-11 text-center text-base font-bold bg-transparent text-on-surface focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(2000, Math.floor(Number(e.target.value)) || 1)))}
                  aria-label={t("customJersey.quantity.label")}
                />
                <button type="button" className="w-11 h-11 flex items-center justify-center text-on-surface hover:bg-surface-subtle" onClick={() => setQuantity((q) => Math.min(2000, q + 1))} aria-label="+">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-text-muted">{t("customJersey.quantity.pieces")}</span>
            </div>
          )}
          {quickPicks.length > 0 && !(useRoster && activeRoster.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((q) => (
                <button
                  key={q.n}
                  type="button"
                  onClick={() => setQuantity(q.n)}
                  className={`h-8 px-3 rounded-full border text-xs font-semibold transition-colors ${
                    quantity >= q.n ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : "border-border-light text-on-surface-variant hover:border-on-surface-variant/50"
                  }`}
                >
                  {q.text}
                </button>
              ))}
            </div>
          )}
          <CheckLine checked={useRoster} onChange={setUseRoster}>
            {t("customJersey.quantity.useRoster")}
          </CheckLine>
          {useRoster && <RosterEditor rows={roster} onChange={setRoster} defaultSleeve={sleeve} />}
        </Step>

        {/* 5. Date */}
        <Step id="cj-date" n={5} title={t("home.cj.sections.date")} sub={t("home.cj.sections.dateSub")} done={Boolean(neededBy) && !result?.tooSoon} error={errorAt("cj-date")}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <CalendarDays className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input type="date" className={`${input} w-56 pl-10`} value={neededBy} min={minDateValue} onChange={(e) => setNeededBy(e.target.value)} aria-label={t("customJersey.date.label")} />
            </div>
            {neededBy && (
              <button type="button" onClick={() => setNeededBy("")} className="text-xs text-text-muted hover:text-on-surface inline-flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> {t("customJersey.upload.remove")}
              </button>
            )}
            {result?.lines.some((l) => l.key === "rush") && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-semibold">{t("home.cj.rushOn")}</span>
            )}
          </div>
          <p className="text-xs text-text-muted">
            {t("customJersey.date.hint", { days: num(config.pricing.rush.normal_days) })}{" "}
            {config.pricing.rush.percent > 0 && t("customJersey.date.rush", { days: num(config.pricing.rush.normal_days), percent: num(config.pricing.rush.percent) })}
          </p>
        </Step>

        {/* 6. Contact */}
        <Step id="cj-contact" n={6} title={t("home.cj.sections.contact")} sub={t("home.cj.sections.contactSub")} done={contactDone} error={errorAt("cj-contact")}>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={label}>{t("customJersey.contact.name")}</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>{t("customJersey.contact.phone")}</span>
              <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={label}>{t("customJersey.contact.email")}</span>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <OptionCard active={!pickup} onClick={() => setPickup(false)} className="flex items-center gap-3 pr-9">
              <Truck className="w-5 h-5 shrink-0 text-on-surface-variant" />
              <span>
                <strong className="block text-sm text-on-surface">{t("home.cj.homeDelivery")}</strong>
                <span className="block text-xs text-text-muted">{t("home.cj.homeDeliverySub")}</span>
              </span>
            </OptionCard>
            <OptionCard active={pickup} onClick={() => setPickup(true)} className="flex items-center gap-3 pr-9">
              <Store className="w-5 h-5 shrink-0 text-on-surface-variant" />
              <span>
                <strong className="block text-sm text-on-surface">{t("home.cj.pickup")}</strong>
                <span className="block text-xs text-text-muted">{t("home.cj.pickupSub")}</span>
              </span>
            </OptionCard>
          </div>
          {!pickup && (
            <>
              <div className="flex flex-wrap gap-2">
                <Pill active={zone === "dhaka"} onClick={() => setZone("dhaka")}>{t("customJersey.contact.dhaka", { fee: money(config.delivery.dhaka) })}</Pill>
                <Pill active={zone === "outside"} onClick={() => setZone("outside")}>{t("customJersey.contact.outside", { fee: money(config.delivery.outside) })}</Pill>
              </div>
              <textarea className={textarea} rows={2} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("customJersey.contact.address")} aria-label={t("customJersey.contact.address")} autoComplete="street-address" />
            </>
          )}
          {pickup && config.pickup && <PickupShop shop={config.pickup} />}
        </Step>
      </div>

      {/* Summary: preview + estimate + send. Sticky beside the steps on desktop, last on phones. */}
      <aside id="cj-submit" className="scroll-mt-36 lg:scroll-mt-44 lg:sticky lg:top-24 flex flex-col gap-4">
        <div className="bg-surface-card border border-border-light rounded-2xl shadow-sm overflow-hidden">
          <div className="relative bg-primary-container text-white px-5 pt-5 pb-4 overflow-hidden">
            <div className="absolute inset-0 as-pitch-lines" aria-hidden />
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-accent-gold/30 blur-3xl" aria-hidden />
            <div className="relative flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">{t("home.cj.summary.title")}</h2>
              <span className="text-xs font-semibold text-white/80 tabular-nums">{t("home.cj.summary.pieces", { count: num(pieces) })}</span>
            </div>
            <div className="relative mt-3 h-44 flex items-center justify-center">
              {source === "template" && template ? (
                <JerseyPreview {...previewProps} side={side} className="h-full w-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.45)]" />
              ) : pictures.length > 0 ? (
                <div className="h-full flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pictures[0]} alt="" className="h-full aspect-square object-cover rounded-xl shadow-xl ring-2 ring-white/20" />
                  {pictures.length > 1 && (
                    <div className="flex flex-col gap-2 h-full">
                      {pictures.slice(1, 3).map((src) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={src} src={src} alt="" className="h-[calc(50%-4px)] aspect-square object-cover rounded-lg ring-1 ring-white/20" />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-1">
                  <JerseyPreview pattern="plain" colors={["#334155", "#475569", "#94a3b8"]} side="back" sleeve={sleeve} number="10" className="h-32 w-auto opacity-60" />
                  <span className="text-[11px] text-white/70">{t("home.cj.summary.empty")}</span>
                </div>
              )}
            </div>
            {files.length > 0 && <p className="relative text-[11px] text-white/70 text-center mt-2">{t("home.cj.summary.files", { count: num(files.length) })}</p>}
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-text-muted">
                <span>{t("home.cj.summary.progress", { done: num(doneCount), total: num(required.length) })}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${(doneCount / required.length) * 100}%` }} />
              </div>
            </div>

            {result && fabric ? (
              <>
                <ul className="flex flex-col gap-2 text-sm">
                  {result.lines.map((l) => (
                    <li key={l.key} className="flex justify-between gap-3">
                      <span className="text-on-surface-variant min-w-0">
                        {l.key === "fabric" ? t("customJersey.estimate.fabric", { fabric: localized(fabric as unknown as Record<string, unknown>, "name", locale) }) : l.key.startsWith("opt_") ? (locale === "bn" && l.name_bn ? l.name_bn : (l.name ?? "")) : t(`customJersey.estimate.${l.key as Exclude<typeof l.key, `opt_${string}`>}`)}
                        {l.key !== "rush" && (
                          <span className="block text-xs text-text-muted tabular-nums">
                            {money(l.unit)} × {num(l.quantity)}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums font-semibold text-on-surface whitespace-nowrap">{money(l.amount)}</span>
                    </li>
                  ))}
                  {!pickup && (
                    <li className="flex justify-between gap-3">
                      <span className="text-on-surface-variant">{t("customJersey.estimate.delivery")}</span>
                      <span className="tabular-nums font-semibold text-on-surface">{money(deliveryFee)}</span>
                    </li>
                  )}
                </ul>
                {result.discountPercent > 0 && (
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 rounded-lg px-3 py-2">{t("customJersey.estimate.discount", { percent: num(result.discountPercent) })}</p>
                )}
                <div className="border-t border-dashed border-border-light pt-4 flex flex-col gap-1">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-sm font-semibold text-on-surface">{t("customJersey.estimate.total")}</span>
                    <span className="font-display text-3xl font-bold text-on-surface tabular-nums">{money(grandTotal)}</span>
                  </div>
                  <p className="text-xs text-text-muted text-right">{t("customJersey.estimate.perPiece", { price: money(result.perPiece) })}</p>
                </div>
                {config.pricing.advance_percent > 0 && (
                  <div className="flex justify-between items-center gap-3 rounded-xl bg-accent-gold-soft border border-accent-gold/30 px-3.5 py-2.5">
                    <span className="text-xs text-on-surface-variant">{t("home.cj.summary.advance", { percent: num(config.pricing.advance_percent) })}</span>
                    <span className="text-sm font-bold text-on-surface tabular-nums">{money(advanceFor(grandTotal, config.pricing))}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-text-muted">{t("customJersey.estimate.chooseFabric")}</p>
            )}

            <p className="text-xs text-text-muted leading-relaxed">{t("customJersey.estimate.note")}</p>

            <div ref={submitRef} className="flex flex-col gap-3">
              <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
              {errorAt("cj-submit") && <ErrorNote text={errorAt("cj-submit")!} />}
              <button
                type="submit"
                disabled={submitting || uploading}
                className="h-12 rounded-xl bg-accent-gold text-white font-display text-sm font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 shadow-lg shadow-accent-gold/25 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? t("customJersey.submitting") : t("customJersey.submit")}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> {t("home.cj.summary.private")}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-light bg-surface-card px-4 py-3">
          <a href="tel:+8809677666888" className="flex items-center gap-2.5 min-w-0">
            <span className="shrink-0 w-9 h-9 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Phone className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] text-text-muted">{t("home.cj.summary.help")}</span>
              <span className="block text-sm font-semibold text-on-surface">+880 9677 666 888</span>
            </span>
          </a>
          <Link href="/custom-jersey/gallery" className="shrink-0 text-xs font-semibold text-on-surface underline underline-offset-4 decoration-accent-gold">
            {t("customJersey.seeGallery")}
          </Link>
        </div>
      </aside>

      {/* Phones: running total + send, above the bottom menu, until the real button scrolls into view. */}
      <div
        className={`lg:hidden fixed inset-x-0 bottom-16 z-40 px-3 pb-2 transition-all duration-300 ${submitVisible ? "translate-y-4 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-primary-container text-white pl-4 pr-2 py-2 shadow-2xl shadow-black/30 ring-1 ring-white/10">
          <div className="min-w-0 flex-1">
            <span className="block text-[11px] text-white/70">
              {t("home.cj.mobileTotal")} · {t("home.cj.summary.pieces", { count: num(pieces) })}
            </span>
            <span className="block font-display text-xl font-bold tabular-nums leading-tight">{result ? money(grandTotal) : "—"}</span>
          </div>
          <button
            type="submit"
            disabled={submitting || uploading}
            className="h-11 px-5 rounded-xl bg-accent-gold text-white font-display text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("customJersey.submit")}
          </button>
        </div>
      </div>
    </form>
  );
}

/** "Pick up from the shop": where the shop is, its hours and a map (Receipt settings). */
function PickupShop({ shop }: { shop: NonNullable<CustomJerseyConfig["pickup"]> }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-border-light bg-surface-subtle overflow-hidden">
      <div className="p-4 flex flex-col gap-1.5 text-sm">
        <strong className="text-on-surface">{t("home.cj.store.title")}: {shop.name}</strong>
        {shop.address && (
          <span className="flex items-start gap-2 text-on-surface-variant">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" /> {shop.address}
          </span>
        )}
        {shop.hours && (
          <span className="flex items-center gap-2 text-on-surface-variant">
            <Clock className="w-4 h-4 shrink-0" /> {t("home.cj.store.hours", { hours: shop.hours })}
          </span>
        )}
        {shop.phone && (
          <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface">
            <Phone className="w-4 h-4 shrink-0" /> {t("home.cj.store.call", { phone: shop.phone })}
          </a>
        )}
        <span className="text-xs text-text-muted">{t("home.cj.store.ready")}</span>
      </div>
      {shop.map && (
        <>
          <iframe
            src={shop.map.embed}
            title={t("home.cj.store.mapTitle")}
            className="w-full h-56 border-0 border-t border-border-light"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a href={shop.map.link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-primary border-t border-border-light hover:bg-surface-card">
            <ExternalLink className="w-3.5 h-3.5" /> {t("home.cj.store.map")}
          </a>
        </>
      )}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-8 items-start" aria-busy>
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface-card border border-border-light rounded-2xl p-6 flex flex-col gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-container" />
              <div className="h-5 w-40 rounded bg-surface-container" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="h-20 rounded-xl bg-surface-container" />
              <div className="h-20 rounded-xl bg-surface-container" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden lg:block h-[520px] rounded-2xl bg-surface-card border border-border-light animate-pulse" />
    </div>
  );
}

function designFile(d: GalleryDesign): UploadedFile {
  return { path: d.image_url, name: (d.title || d.caption || "design").slice(0, 120), mime: "image/*", size: 0, kind: "reference", design_id: d.id };
}

const FILE_TAGS = ["front", "back", "collar", "sleeve", "logo", "sponsor", "reference"] as const;

/** Local previews of the customer's own pictures (stored files are private, so no public URL). */
const previewUrls = new Map<string, string>();

/** Upload box + a card per file (picture, part chip, note). */
function DesignFiles({ files, setFiles, uploading, onAdd }: {
  files: UploadedFile[];
  setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  uploading: boolean;
  onAdd: (list: FileList | File[] | null) => void | Promise<void>;
}) {
  const { t } = useT();
  const full = files.length >= 10;
  const { dragging, dropProps } = usePasteDrop((list) => void onAdd(list), !uploading && !full);
  const [picking, setPicking] = useState(false);
  const pickedIds = new Set(files.map((f) => f.design_id).filter((id): id is string => !!id));
  const toggleDesign = (d: GalleryDesign) =>
    setFiles((prev) => (prev.some((x) => x.design_id === d.id) ? prev.filter((x) => x.design_id !== d.id) : prev.length >= 10 ? prev : [...prev, designFile(d)]));
  const setNote = (path: string, note: string) => setFiles((prev) => prev.map((x) => (x.path === path ? { ...x, note } : x)));
  const remove = (path: string) => {
    const url = previewUrls.get(path);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.delete(path);
    }
    setFiles((prev) => prev.filter((x) => x.path !== path));
  };
  return (
    <>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
        <label
          {...dropProps}
          className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-2xl py-7 px-4 text-center transition-colors ${
            dragging ? "border-accent-gold bg-accent-gold-soft" : "border-border-light bg-surface-subtle"
          } ${full ? "opacity-50" : "cursor-pointer hover:border-accent-gold/60"}`}
        >
          <span className="w-12 h-12 rounded-full bg-surface-card border border-border-light shadow-sm flex items-center justify-center mb-1">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-text-muted" /> : <Upload className="w-5 h-5 text-accent-gold" />}
          </span>
          <span className="text-sm font-bold text-on-surface">{uploading ? t("customJersey.upload.uploading") : t("customJersey.upload.add")}</span>
          <span className="text-xs text-text-muted">{t("customJersey.upload.hint")}</span>
          <span className="hidden sm:block text-xs text-text-muted">{t("customJersey.upload.pasteHint")}</span>
          <input
            type="file"
            multiple
            accept={DESIGN_ACCEPT}
            className="hidden"
            disabled={uploading || full}
            onChange={(e) => {
              void onAdd(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="sm:w-44 rounded-2xl border border-border-light bg-surface-card p-4 text-sm font-semibold text-on-surface inline-flex sm:flex-col items-center justify-center gap-2 hover:border-accent-gold/60 hover:shadow-sm transition"
        >
          <span className="w-10 h-10 rounded-full bg-accent-gold-soft text-accent-gold flex items-center justify-center">
            <Images className="w-5 h-5" />
          </span>
          <span className="text-center leading-snug">{t("customJersey.upload.ourDesigns")}</span>
        </button>
      </div>
      {picking && <OurDesignsPicker pickedIds={pickedIds} canAdd={!full} onToggle={toggleDesign} onClose={() => setPicking(false)} />}
      {files.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((f) => {
            const preview = f.design_id ? f.path : previewUrls.get(f.path);
            const labels = FILE_TAGS.map((tag) => t(`customJersey.upload.tags.${tag}`));
            const note = f.note ?? "";
            const tagLabel = labels.find((l) => note === l || note.startsWith(`${l} — `));
            const text = tagLabel ? note.slice(tagLabel.length).replace(/^ — /, "") : note;
            const save = (part: string | undefined, body: string) => setNote(f.path, part ? (body ? `${part} — ${body}` : part) : body);
            return (
              <li key={f.path} className="flex flex-col rounded-xl overflow-hidden bg-surface-card border border-border-light shadow-sm">
                <div className="relative aspect-square bg-surface-subtle">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={f.note || f.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-text-muted">
                      <FileText className="w-8 h-8" />
                      <span className="text-[11px] truncate max-w-full">{f.name}</span>
                    </div>
                  )}
                  {f.design_id && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-accent-gold text-white px-2 py-0.5 text-[11px] font-semibold shadow-sm">{t("customJersey.upload.ourDesignTag")}</span>
                  )}
                  {tagLabel && (
                    <span className="absolute top-2 right-2 rounded-md bg-surface-card/95 text-on-surface border border-border-light px-2 py-0.5 text-xs font-semibold shadow-sm">{tagLabel}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(f.path)}
                    aria-label={t("customJersey.upload.remove")}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-badge-discount"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 p-2">
                  <select
                    className="w-full rounded-lg border border-border-light bg-surface-card h-8 px-2 text-xs text-on-surface"
                    value={tagLabel ?? ""}
                    onChange={(e) => save(e.target.value || undefined, text)}
                    aria-label={t("customJersey.upload.notePlaceholder")}
                  >
                    <option value="">—</option>
                    {labels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="w-full rounded-lg border border-border-light bg-surface-card px-2 py-1.5 text-sm text-on-surface resize-none"
                    rows={2}
                    value={text}
                    maxLength={170}
                    onChange={(e) => save(tagLabel, e.target.value)}
                    placeholder={t("customJersey.upload.notePlaceholder")}
                    aria-label={t("customJersey.upload.notePlaceholder")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
