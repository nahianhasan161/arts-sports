"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Link2, Loader2, X, XCircle } from "lucide-react";
import { parseDelimited, parseXlsx } from "@/lib/custom-jersey/roster";
import { buildRows, templateCsv, MAX_IMPORT_ROWS, type Column, type ImportRow, type Lookups } from "@/lib/products/import";
import { appendImageFiles, optimizeImageFile } from "@/lib/media/client-optimize";
import { MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES, MEDIA_MAX_PER_PRODUCT, type ProductStatus } from "@/types";

/**
 * Add many products at once from a Google Sheet (shared link), copied cells
 * or a CSV / .xlsx file. Rows are checked first and shown; each one is then
 * saved through the same APIs the product form uses (product, pictures,
 * brand, search text), one after another.
 */

type Source = "link" | "paste" | "file";
type RowState = { state: "waiting" | "saving" | "done" | "skipped" | "failed"; note?: string; id?: string };

interface Props {
  categories: Lookups["categories"];
  colors: Lookups["colors"];
  sizes: Lookups["sizes"];
  onClose: () => void;
  /** Called after an import that saved at least one product. */
  onDone: () => void;
}

const FIELD_LABEL: Record<string, string> = {
  title: "Name",
  slug: "Slug",
  category: "Category",
  sub_category: "Sub-category",
  brand: "Brand (+ spec)",
  price: "Price",
  sale_price: "Sale price",
  discount: "Discount",
  stock: "Stock",
  colors: "Colours",
  sizes: "Sizes",
  sku: "SKU",
  status: "Status",
  featured: "Featured",
  gender: "Gender",
  description: "Description",
  images: "Pictures",
  specs: "Specs list",
  ignore: "Ignored",
};

const inputClass =
  "w-full px-3 py-2 text-sm bg-surface-card border border-border-light rounded-lg text-on-surface focus:outline-none focus:border-primary";

export function ProductImport({ categories, colors, sizes, onClose, onDone }: Props) {
  const [source, setSource] = useState<Source>("link");
  const [link, setLink] = useState("");
  const [pasted, setPasted] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<ProductStatus>("draft");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [states, setStates] = useState<Record<number, RowState>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef(false);
  const savedAny = useRef(false);

  const ready = rows.filter((r) => r.payload);
  const counts = useMemo(() => {
    const c = { done: 0, skipped: 0, failed: 0 };
    for (const s of Object.values(states)) if (s.state in c) c[s.state as keyof typeof c]++;
    return c;
  }, [states]);

  const read = async () => {
    setError(null);
    setReading(true);
    setColumns(null);
    setRows([]);
    setStates({});
    setFinished(false);
    try {
      let cells: string[][];
      if (source === "link") {
        if (!link.trim()) throw new Error("Paste the Google Sheets link first.");
        const res = await fetch(`/api/admin/products/import?sheet=${encodeURIComponent(link.trim())}`);
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not read the sheet");
        cells = parseDelimited(await res.text());
      } else if (source === "paste") {
        if (!pasted.trim()) throw new Error("Paste the cells first (with the header row).");
        cells = parseDelimited(pasted);
      } else {
        if (!file) throw new Error("Choose a file first.");
        if (file.size > 5 * 1024 * 1024) throw new Error("The file is over 5 MB.");
        if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported. Save it as .xlsx or CSV.");
        cells = /\.xlsx$/i.test(file.name) ? await parseXlsx(await file.arrayBuffer()) : parseDelimited(await file.text());
      }
      if (cells.length < 2) throw new Error("No product rows found. The first row must be the header (Name, Category, Price…).");

      const brandRes = await fetch("/api/admin/catalog-terms");
      const terms = brandRes.ok
        ? (((await brandRes.json()) as { terms?: { id: string; type: string; name_en: string; name_bn?: string | null; slug?: string }[] }).terms ?? [])
        : [];
      const brands = terms.filter((t) => t.type === "brand");

      const built = buildRows(cells, { categories, colors, sizes, brands }, { defaultStatus });
      if (!built.columns.some((c) => c.field === "title")) {
        throw new Error('No "Name" column found. The first row must be the header: Name, Category, Price, then any spec columns.');
      }
      setColumns(built.columns);
      setRows(built.rows);
      if (cells.length - 1 > MAX_IMPORT_ROWS) setError(`Only the first ${MAX_IMPORT_ROWS} rows are read. Import the rest in a second go.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read it");
    } finally {
      setReading(false);
    }
  };

  const mark = (line: number, s: RowState) => setStates((prev) => ({ ...prev, [line]: s }));

  /** Downloads each picture link through the server, shrinks it, uploads them in one go. */
  const addPictures = async (productId: string, links: string[]): Promise<string | null> => {
    const files: File[] = [];
    const problems: string[] = [];
    for (const [i, url] of links.slice(0, MEDIA_MAX_PER_PRODUCT).entries()) {
      try {
        const res = await fetch(`/api/admin/products/import?image=${encodeURIComponent(url)}`);
        if (!res.ok) {
          problems.push(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `picture ${i + 1} failed`);
          continue;
        }
        const blob = await res.blob();
        const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        const shrunk = await optimizeImageFile(new File([blob], `picture-${i + 1}.${ext}`, { type: blob.type }));
        if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(shrunk.type) || shrunk.size > MEDIA_MAX_BYTES) {
          problems.push(`picture ${i + 1} is not a JPG/PNG/WebP or is too big`);
          continue;
        }
        files.push(shrunk);
      } catch {
        problems.push(`picture ${i + 1} could not be read`);
      }
    }
    for (let at = 0; at < files.length; at += 10) {
      const form = new FormData();
      await appendImageFiles(form, files.slice(at, at + 10));
      const up = await fetch(`/api/admin/products/${productId}/media`, { method: "POST", body: form });
      if (!up.ok) problems.push(((await up.json().catch(() => ({}))) as { error?: string }).error ?? "upload failed");
    }
    if (links.length > MEDIA_MAX_PER_PRODUCT) problems.push(`only the first ${MEDIA_MAX_PER_PRODUCT} pictures are kept`);
    return problems.length ? problems.join("; ") : null;
  };

  const run = async () => {
    stopRef.current = false;
    setRunning(true);
    setFinished(false);
    for (const row of ready) {
      if (stopRef.current) break;
      const prev = states[row.line]?.state;
      if (prev === "done" || prev === "skipped") continue;
      mark(row.line, { state: "saving", note: "Saving…" });
      try {
        const res = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row.payload),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; data?: { id?: string } };
        if (res.status === 409 && /slug/i.test(`${body.error} ${body.code}`)) {
          mark(row.line, { state: "skipped", note: "Already in the shop (same name/slug)" });
          continue;
        }
        if (!res.ok || !body.data?.id) throw new Error(body.error ?? "Save failed");
        const id = body.data.id;
        savedAny.current = true;
        const notes: string[] = [];

        if (row.brandId) {
          const b = await fetch(`/api/admin/products/${id}/brand`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ term_id: row.brandId }),
          });
          if (!b.ok) notes.push("brand not saved");
        }
        if (row.images.length > 0) {
          mark(row.line, { state: "saving", note: `Pictures (${row.images.length})…`, id });
          const pictureError = await addPictures(id, row.images);
          if (pictureError) notes.push(pictureError);
        }
        // Same as the form: lets the server write search text and ping search engines.
        await fetch(`/api/admin/products/${id}/seo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "saved" }),
        }).catch(() => undefined);

        mark(row.line, { state: "done", id, note: notes.length ? `Saved, but: ${notes.join("; ")}` : undefined });
      } catch (e) {
        mark(row.line, { state: "failed", note: e instanceof Error ? e.message : "Save failed" });
      }
    }
    setRunning(false);
    setFinished(true);
  };

  const close = () => {
    if (running) return;
    if (savedAny.current) onDone();
    onClose();
  };

  const downloadTemplate = () => {
    const blob = new Blob(["﻿" + templateCsv()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "products-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const specColumns = columns?.filter((c) => c.field === "spec") ?? [];
  const fieldColumns = columns?.filter((c) => c.field !== "spec") ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pi-title"
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="fixed inset-0 z-50 bg-surface-subtle overflow-y-auto"
    >
      <div className="sticky top-0 z-10 bg-surface-card border-b border-border-light">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h2 id="pi-title" className="font-semibold text-on-surface">
            Import products from a sheet
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={running}
            aria-label="Close"
            className="ml-auto p-2 rounded-lg text-text-muted hover:bg-surface-subtle disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <section className="bg-surface-card border border-border-light rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["link", "Google Sheet link"],
                ["paste", "Paste cells"],
                ["file", "CSV / Excel file"],
              ] as [Source, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSource(id)}
                className={`px-3 h-9 text-sm font-semibold rounded-lg border transition-colors ${
                  source === id ? "border-primary text-primary bg-primary/5" : "border-border-light text-text-muted hover:bg-surface-subtle"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={downloadTemplate}
              className="ml-auto inline-flex items-center gap-1.5 px-3 h-9 text-sm font-semibold rounded-lg border border-border-light text-on-surface hover:bg-surface-subtle"
            >
              <Download className="w-4 h-4" />
              Template (CSV)
            </button>
          </div>

          {source === "link" && (
            <div className="space-y-1.5">
              <div className="relative">
                <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <p className="text-xs text-text-muted">
                In Google Sheets: Share → General access → <b>Anyone with the link</b> (Viewer), then copy the address bar. The tab
                that is open in the link is read.
              </p>
            </div>
          )}
          {source === "paste" && (
            <div className="space-y-1.5">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={7}
                placeholder={"Select the cells in the sheet (with the header row), Ctrl+C, then paste here.\nName\tCategory\tPrice\tBrand\tModel\nVE Titan 10\tBadminton > Racket\t3500\tVE\tTitan 10"}
                className={`${inputClass} font-mono text-xs`}
              />
            </div>
          )}
          {source === "file" && (
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block text-sm text-on-surface"
            />
          )}

          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer font-semibold text-on-surface">Which columns?</summary>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>
                <b>Name</b>, <b>Category</b> and <b>Price</b> are needed. Category can be &quot;Badminton&quot;, a sub-category name, or
                &quot;Badminton &gt; Racket&quot;. The category must already exist.
              </li>
              <li>
                Optional: Sub category, Sale price (or Discount: 10% / 100৳), Stock, Colours, Sizes (comma separated, names from the
                lists), Status (draft / published), Featured, Gender, Description, SKU, Slug.
              </li>
              <li>
                <b>Images</b>: picture links, several in one cell (comma or new line) or columns Image 1, Image 2… Google Drive
                pictures must be shared as &quot;Anyone with the link&quot;.
              </li>
              <li>
                <b>Every other column is a spec</b> named after its header: Brand, Model, Frame Material, Weight, Grip Size… Empty
                cells are left out. A &quot;Specs&quot; column with lines like &quot;Weight: 85 g&quot; also works.
              </li>
              <li>A row whose name/slug is already in the shop is skipped, so the same sheet can be imported again after fixes.</li>
            </ul>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-on-surface flex items-center gap-2">
              Rows without a Status:
              <select
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as ProductStatus)}
                className="h-9 px-2 text-sm bg-surface-card border border-border-light rounded-lg"
              >
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published</option>
              </select>
            </label>
            <button
              type="button"
              onClick={read}
              disabled={reading || running}
              className="ml-auto inline-flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-container disabled:opacity-50"
            >
              {reading && <Loader2 className="w-4 h-4 animate-spin" />}
              Read and check
            </button>
          </div>
          {error && <p className="text-sm text-badge-discount">{error}</p>}
        </section>

        {columns && (
          <section className="bg-surface-card border border-border-light rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-on-surface">Columns</h3>
            <div className="flex flex-wrap gap-1.5">
              {fieldColumns.map((c) => (
                <span
                  key={c.index}
                  className={`px-2 py-1 rounded-md text-xs border ${
                    c.field === "ignore" ? "border-border-light text-text-muted" : "border-primary/30 text-on-surface bg-primary/5"
                  }`}
                >
                  {c.header || `(column ${c.index + 1})`} → {FIELD_LABEL[c.field]}
                </span>
              ))}
            </div>
            {specColumns.length > 0 && (
              <p className="text-xs text-text-muted">
                Specs: {specColumns.map((c) => c.spec).join(", ")}
              </p>
            )}
          </section>
        )}

        {columns && (
          <section className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border-light">
              <p className="text-sm text-on-surface">
                <b>{ready.length}</b> of {rows.length} rows ready
                {rows.length - ready.length > 0 && <span className="text-badge-discount"> · {rows.length - ready.length} need fixing</span>}
                {(counts.done > 0 || counts.skipped > 0 || counts.failed > 0) && (
                  <span className="text-text-muted">
                    {" "}
                    · saved {counts.done}
                    {counts.skipped > 0 && `, skipped ${counts.skipped}`}
                    {counts.failed > 0 && `, failed ${counts.failed}`}
                  </span>
                )}
              </p>
              <div className="ml-auto flex gap-2">
                {running ? (
                  <button
                    type="button"
                    onClick={() => (stopRef.current = true)}
                    className="px-4 h-9 text-sm font-semibold rounded-lg border border-border-light text-on-surface hover:bg-surface-subtle"
                  >
                    Stop after this one
                  </button>
                ) : finished ? (
                  <button
                    type="button"
                    onClick={close}
                    className="px-4 h-9 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-container"
                  >
                    Done
                  </button>
                ) : null}
                {!running && ready.length > 0 && (!finished || counts.failed > 0) && (
                  <button
                    type="button"
                    onClick={run}
                    className="px-4 h-9 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-container"
                  >
                    {finished ? `Try the ${counts.failed} failed again` : `Import ${ready.length} product${ready.length === 1 ? "" : "s"}`}
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-subtle text-xs text-text-muted uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2 w-12">Row</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Specs</th>
                    <th className="text-right px-3 py-2">Pictures</th>
                    <th className="text-left px-3 py-2">Check / result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {rows.map((r) => {
                    const s = states[r.line];
                    const p = r.payload as { regular_price?: number; comparison_price?: number; status?: string } | null;
                    return (
                      <tr key={r.line} className={r.errors.length ? "bg-badge-discount/5" : undefined}>
                        <td className="px-3 py-2 text-text-muted">{r.line}</td>
                        <td className="px-3 py-2 text-on-surface">
                          <div className="font-medium">{r.title}</div>
                          {p?.status && <div className="text-[11px] text-text-muted">{p.status}</div>}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{r.categoryLabel || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-on-surface">
                          {p?.regular_price ? `৳${p.regular_price}` : "—"}
                          {p?.comparison_price ? <div className="text-[11px] text-text-muted">sale ৳{p.comparison_price}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.specCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.images.length}</td>
                        <td className="px-3 py-2 text-xs max-w-[22rem]">
                          {s ? (
                            <div className="flex items-start gap-1.5">
                              {s.state === "saving" && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                              {s.state === "done" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                              {s.state === "skipped" && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
                              {s.state === "failed" && <XCircle className="w-4 h-4 text-badge-discount shrink-0" />}
                              <span className={s.state === "failed" ? "text-badge-discount" : "text-on-surface"}>
                                {s.note ?? (s.state === "done" ? "Saved" : s.state)}
                              </span>
                            </div>
                          ) : r.errors.length ? (
                            <span className="text-badge-discount">{r.errors.join(". ")}</span>
                          ) : r.warnings.length ? (
                            <span className="text-amber-700 dark:text-amber-400">{r.warnings.join(" ")}</span>
                          ) : (
                            <span className="text-text-muted">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
