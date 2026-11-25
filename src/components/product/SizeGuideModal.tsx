"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Globe, Loader2 } from "lucide-react";
import { useT } from "@/i18n/client";
import {
  DEFAULT_SIZE_REGION,
  type ResolvedSize,
  type SizeRegion,
  type SizeRegionCode,
} from "@/types";

const REGION_CODES: SizeRegionCode[] = ["GLOBAL", "BD", "US"];

/** The measurements staff use most; anything else is shown as it was typed. */
const MEASURES = ["chest", "length", "shoulder", "sleeve", "waist", "hip", "inseam", "width"] as const;

const STORAGE_KEY = "size_region";

/** Read the shopper's saved region preference, defaulting to the store's home market. */
function readPreferredRegion(): SizeRegionCode {
  if (typeof window === "undefined") return DEFAULT_SIZE_REGION;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return (REGION_CODES as string[]).includes(saved ?? "")
    ? (saved as SizeRegionCode)
    : DEFAULT_SIZE_REGION;
}

interface SizeGuideModalProps {
  open: boolean;
  onClose: () => void;
  categoryId?: string | null;
  subCategoryId?: string | null;
  type?: string;
}

export default function SizeGuideModal({
  open,
  onClose,
  categoryId,
  subCategoryId,
  type,
}: SizeGuideModalProps) {
  const { t } = useT();
  const measure = (key: string) => {
    const known = MEASURES.find((m) => m === key.toLowerCase());
    return known ? t(`store.sizeGuide.${known}`) : key;
  };
  const [region, setRegion] = useState<SizeRegionCode>(DEFAULT_SIZE_REGION);
  const [sizes, setSizes] = useState<ResolvedSize[]>([]);
  const [meta, setMeta] = useState<SizeRegion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setRegion(readPreferredRegion());
  }, [open]);

  const load = useCallback(
    async (target: SizeRegionCode) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ region: target });
        if (categoryId) params.set("category_id", categoryId);
        if (subCategoryId) params.set("sub_category_id", subCategoryId);
        if (type) params.set("type", type);

        const res = await fetch(`/api/sizes?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error("size guide");

        setSizes(json.data?.sizes ?? []);
        setMeta(json.data?.region ?? null);
      } catch {
        setError(t("store.sizeGuide.failed"));
        setSizes([]);
      } finally {
        setLoading(false);
      }
    },
    [categoryId, subCategoryId, type, t]
  );

  useEffect(() => {
    if (open) load(region);
  }, [open, region, load]);

  const selectRegion = (next: SizeRegionCode) => {
    setRegion(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference is best-effort; ignore storage failures
    }
  };

  // Column set is the union of every measurement key present in the chart
  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const size of sizes) {
      for (const key of Object.keys(size.measurements)) set.add(key);
    }
    return Array.from(set);
  }, [sizes]);

  if (!open) return null;

  const unit = meta?.unit ?? "cm";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t("store.sizeGuide.title")}>
      <div className="bg-surface-card rounded-xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border-light shrink-0">
          <h3 className="font-display uppercase text-base font-bold text-primary">
            {t("store.sizeGuide.title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="sp-ico sp-red sp-lg"
            aria-label={t("store.sizeGuide.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="text-xs text-text-muted mb-4">
            {t("store.sizeGuide.note", { unit: t(unit === "in" ? "store.sizeGuide.inches" : "store.sizeGuide.cm") })}
          </p>

          {/* Region switcher */}
          <div className="flex items-center gap-1.5 mb-4">
            <Globe className="w-3.5 h-3.5 text-text-muted" />
            {REGION_CODES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => selectRegion(code)}
                className={`sp-chip ${region === code ? "sp-on" : ""} min-h-11 text-xs font-semibold`}
              >
                {t(`store.sizeGuide.region.${code}`)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">{t("store.sizeGuide.loading")}</span>
            </div>
          ) : error ? (
            <p className="text-xs text-badge-discount py-6 text-center">{error}</p>
          ) : sizes.length === 0 ? (
            <p className="text-xs text-text-muted py-6 text-center">
              {t("store.sizeGuide.none")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border border-border-light">
                <thead className="bg-surface-subtle font-display uppercase">
                  <tr>
                    <th className="p-2.5 border-b border-border-light">{t("store.pdp.size")}</th>
                    {keys.map((key) => (
                      <th key={key} className="p-2.5 border-b border-border-light capitalize">
                        {measure(key)} ({unit})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {sizes.map((size) => (
                    <tr key={size.size_id}>
                      <td className="p-2.5 font-bold">
                        {size.label}
                        {size.label !== size.canonical_label && (
                          <span className="ml-1.5 font-normal text-text-muted">
                            ({size.canonical_label})
                          </span>
                        )}
                      </td>
                      {keys.map((key) => {
                        const value = size.measurements[key];
                        return (
                          <td key={key} className="p-2.5">
                            {value !== undefined ? value : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border-light shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="sp-btn sp-wicket w-full py-3 font-display uppercase text-xs font-bold"
          >
            {t("store.sizeGuide.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
