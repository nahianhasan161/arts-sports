"use client";

import Link from "next/link";
import { Eye, ExternalLink, ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/client";

/** Strip above a staff preview: says whether customers can see the product. */
export function PreviewBar({ status, slug }: { status: string; slug: string }) {
  const { t } = useT();
  const live = status === "published";
  return (
    <div
      className={`border-b ${live ? "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-900 dark:text-green-100" : "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-100"}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Eye className="w-4 h-4" /> {t("site.preview.title")}
        </span>
        <span>{live ? t("site.preview.live") : t("site.preview.draft", { status })}</span>
        <span className="opacity-75">{t("site.preview.saved")}</span>
        <span className="ml-auto flex items-center gap-3">
          {live && (
            <a href={`/products/${encodeURIComponent(slug)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold underline">
              <ExternalLink className="w-3.5 h-3.5" /> {t("site.preview.open")}
            </a>
          )}
          <Link href="/admin/online/products" className="inline-flex items-center gap-1 font-semibold underline">
            <ArrowLeft className="w-3.5 h-3.5" /> {t("site.preview.edit")}
          </Link>
        </span>
      </div>
    </div>
  );
}
