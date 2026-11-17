"use client";

import { Fragment, useRef, useState } from "react";
import { ClipboardPaste, Download, FileSpreadsheet, Plus, Ruler, Trash2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { importRosterFile, parseDelimited, rowsToRoster, MAX_ROSTER, ROSTER_SAMPLE_CSV } from "@/lib/custom-jersey/roster";
import { sizeSummary } from "@/lib/custom-jersey/pricing";
import { BOYS_SIZES, CUSTOM_SIZE, SIZES, type Fit, type RosterRow, type Sleeve } from "@/lib/custom-jersey/types";

const cell = "w-full h-9 px-2 rounded-md border border-border-light bg-surface-card text-sm focus:outline-none focus:ring-1 focus:ring-primary";
const tool = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light bg-surface-card text-xs font-semibold hover:bg-surface-subtle";

/** The team list: one row per jersey, typed in, pasted from Excel or imported from a file. */
export function RosterEditor({
  rows,
  onChange,
  defaultSleeve,
}: {
  rows: RosterRow[];
  onChange: (rows: RosterRow[]) => void;
  defaultSleeve: Sleeve;
}) {
  const { t } = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");

  // Rows whose measurement line is open (custom size always shows it).
  const [measureOpen, setMeasureOpen] = useState<Set<number>>(new Set());
  const toggleMeasure = (i: number) =>
    setMeasureOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const inches = (v: string) => {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) ? null : n;
  };
  const changeFit = (i: number, fit: Fit) => {
    const r = rows[i];
    const list: readonly string[] = fit === "boys" ? BOYS_SIZES : SIZES;
    update(i, { fit, size: r.size === CUSTOM_SIZE || list.includes(r.size) ? r.size : fit === "boys" ? "26" : "M" });
  };

  const update = (index: number, patch: Partial<RosterRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => rows.length < MAX_ROSTER && onChange([...rows, { player_name: "", player_number: "", size: "M", sleeve: defaultSleeve, fit: "men" }]);

  const append = (imported: { rows: RosterRow[]; skipped: number }) => {
    const room = MAX_ROSTER - rows.length;
    onChange([...rows, ...imported.rows.slice(0, room)]);
    setError(null);
    setNotice(
      [t("customJersey.roster.imported", { count: Math.min(imported.rows.length, room) }), imported.skipped ? t("customJersey.roster.skipped", { count: imported.skipped }) : ""]
        .filter(Boolean)
        .join(" · ")
    );
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      append(await importRosterFile(file, defaultSleeve));
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : t("customJersey.errors.generic"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([ROSTER_SAMPLE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-list-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = sizeSummary(rows);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{t("customJersey.roster.hint")}</p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={tool} onClick={() => fileInput.current?.click()}>
          <FileSpreadsheet className="w-4 h-4" /> {t("customJersey.roster.importFile")}
        </button>
        <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,.xlsx" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" className={tool} onClick={() => setPasteOpen((v) => !v)}>
          <ClipboardPaste className="w-4 h-4" /> {t("customJersey.roster.paste")}
        </button>
        <button type="button" className={tool} onClick={downloadSample}>
          <Download className="w-4 h-4" /> {t("customJersey.roster.sample")}
        </button>
        {rows.length > 0 && (
          <button type="button" className={`${tool} ml-auto text-badge-discount`} onClick={() => onChange([])}>
            <Trash2 className="w-4 h-4" /> {t("customJersey.roster.clear")}
          </button>
        )}
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-2">
          <textarea
            className="w-full rounded-lg border border-border-light bg-surface-card p-2 text-sm font-mono"
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t("customJersey.roster.pastePlaceholder")}
          />
          <button
            type="button"
            className="self-start h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase"
            onClick={() => {
              append(rowsToRoster(parseDelimited(pasted), defaultSleeve));
              setPasted("");
              setPasteOpen(false);
            }}
          >
            {t("customJersey.roster.pasteAdd")}
          </button>
        </div>
      )}

      {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      {error && <p className="text-xs text-badge-discount">{error}</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted">
                <th className="w-8 font-semibold pb-1">#</th>
                <th className="font-semibold pb-1">{t("customJersey.roster.name")}</th>
                <th className="w-20 font-semibold pb-1">{t("customJersey.roster.number")}</th>
                <th className="w-24 font-semibold pb-1">{t("customJersey.roster.fit")}</th>
                <th className="w-24 font-semibold pb-1">{t("customJersey.roster.size")}</th>
                <th className="w-32 font-semibold pb-1">{t("customJersey.roster.sleeve")}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sizes: readonly string[] = r.fit === "boys" ? BOYS_SIZES : SIZES;
                const custom = r.size === CUSTOM_SIZE;
                const showMeasure = custom || measureOpen.has(i) || !!r.sleeve_length || !!r.chest || !!r.length;
                const missing = custom && (!r.chest || !r.length);
                return (
                <Fragment key={i}>
                <tr>
                  <td className="text-xs text-text-muted tabular-nums">{i + 1}</td>
                  <td className="p-0.5">
                    <input className={cell} value={r.player_name} maxLength={40} onChange={(e) => update(i, { player_name: e.target.value })} aria-label={t("customJersey.roster.name")} />
                  </td>
                  <td className="p-0.5">
                    <input className={cell} value={r.player_number} maxLength={4} inputMode="numeric" onChange={(e) => update(i, { player_number: e.target.value })} aria-label={t("customJersey.roster.number")} />
                  </td>
                  <td className="p-0.5">
                    <select className={cell} value={r.fit ?? "men"} onChange={(e) => changeFit(i, e.target.value as Fit)} aria-label={t("customJersey.roster.fit")}>
                      <option value="men">{t("customJersey.roster.men")}</option>
                      <option value="boys">{t("customJersey.roster.boys")}</option>
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select className={cell} value={r.size} onChange={(e) => update(i, { size: e.target.value })} aria-label={t("customJersey.roster.size")}>
                      {sizes.includes(r.size) || custom ? null : <option value={r.size}>{r.size}</option>}
                      {sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                      <option value={CUSTOM_SIZE}>{t("customJersey.roster.custom")}</option>
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select className={cell} value={r.sleeve} onChange={(e) => update(i, { sleeve: e.target.value as Sleeve })} aria-label={t("customJersey.roster.sleeve")}>
                      <option value="short">{t("customJersey.options.short")}</option>
                      <option value="full">{t("customJersey.options.full")}</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleMeasure(i)}
                      disabled={custom}
                      title={t("customJersey.roster.measure")}
                      aria-label={t("customJersey.roster.measure")}
                      className={`p-1 hover:text-primary ${showMeasure ? "text-primary" : "text-text-muted"}`}
                    >
                      <Ruler className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => { setMeasureOpen(new Set()); onChange(rows.filter((_, x) => x !== i)); }} aria-label={t("customJersey.roster.remove")} className="p-1 text-text-muted hover:text-badge-discount">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {showMeasure && (
                  <tr>
                    <td />
                    <td colSpan={6} className="pb-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-text-muted">{t("customJersey.roster.inches")}</span>
                        {custom && (
                          <>
                            <MeasureInput label={`${t("customJersey.roster.chest")} *`} value={r.chest} invalid={missing && !r.chest} onChange={(v) => update(i, { chest: inches(v) })} />
                            <MeasureInput label={`${t("customJersey.roster.length")} *`} value={r.length} invalid={missing && !r.length} onChange={(v) => update(i, { length: inches(v) })} />
                          </>
                        )}
                        <MeasureInput label={t("customJersey.roster.sleeveLength")} value={r.sleeve_length} onChange={(v) => update(i, { sleeve_length: inches(v) })} />
                        {missing && <span className="text-badge-discount">{t("customJersey.roster.needMeasure")}</span>}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" className={`${tool} self-start`} onClick={addRow}>
        <Plus className="w-4 h-4" /> {t("customJersey.roster.addRow")}
      </button>

      {summary.length > 0 && <SizeSummary summary={summary} total={rows.length} label={t("customJersey.roster.total")} />}
    </div>
  );
}

function MeasureInput({ label, value, invalid, onChange }: { label: string; value?: number | null; invalid?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span>{label}</span>
      <input
        className={`${cell} w-16 h-8 ${invalid ? "border-badge-discount" : ""}`}
        type="number"
        inputMode="decimal"
        min={4}
        max={80}
        step={0.5}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** "M: 5 · L: 4 · Total 9" */
export function SizeSummary({ summary, total, label }: { summary: [string, number][]; total: number; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {summary.map(([size, count]) => (
        <span key={size} className="px-2 py-1 rounded-md bg-surface-subtle border border-border-light tabular-nums">
          <strong>{size}</strong>: {count}
        </span>
      ))}
      <span className="px-2 py-1 rounded-md bg-primary text-primary-foreground font-semibold tabular-nums">
        {label}: {total}
      </span>
    </div>
  );
}
