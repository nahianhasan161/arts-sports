"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, Download, FileSpreadsheet, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { importRosterFile, parseDelimited, rowsToRoster, MAX_ROSTER, ROSTER_SAMPLE_CSV } from "@/lib/custom-jersey/roster";
import { sizeSummary } from "@/lib/custom-jersey/pricing";
import { SIZES, type RosterRow, type Sleeve } from "@/lib/custom-jersey/types";

const cell = "w-full h-9 px-2 rounded-md border border-border-light bg-white text-sm focus:outline-none focus:ring-1 focus:ring-primary";
const tool = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light bg-white text-xs font-semibold hover:bg-surface-subtle";

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

  const update = (index: number, patch: Partial<RosterRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => rows.length < MAX_ROSTER && onChange([...rows, { player_name: "", player_number: "", size: "M", sleeve: defaultSleeve }]);

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
            className="w-full rounded-lg border border-border-light bg-white p-2 text-sm font-mono"
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t("customJersey.roster.pastePlaceholder")}
          />
          <button
            type="button"
            className="self-start h-9 px-4 rounded-lg bg-primary text-white text-xs font-bold uppercase"
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
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted">
                <th className="w-8 font-semibold pb-1">#</th>
                <th className="font-semibold pb-1">{t("customJersey.roster.name")}</th>
                <th className="w-20 font-semibold pb-1">{t("customJersey.roster.number")}</th>
                <th className="w-24 font-semibold pb-1">{t("customJersey.roster.size")}</th>
                <th className="w-32 font-semibold pb-1">{t("customJersey.roster.sleeve")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="text-xs text-text-muted tabular-nums">{i + 1}</td>
                  <td className="p-0.5">
                    <input className={cell} value={r.player_name} maxLength={40} onChange={(e) => update(i, { player_name: e.target.value })} aria-label={t("customJersey.roster.name")} />
                  </td>
                  <td className="p-0.5">
                    <input className={cell} value={r.player_number} maxLength={4} inputMode="numeric" onChange={(e) => update(i, { player_number: e.target.value })} aria-label={t("customJersey.roster.number")} />
                  </td>
                  <td className="p-0.5">
                    <select className={cell} value={r.size} onChange={(e) => update(i, { size: e.target.value })} aria-label={t("customJersey.roster.size")}>
                      {(SIZES as readonly string[]).includes(r.size) ? null : <option value={r.size}>{r.size}</option>}
                      {SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <select className={cell} value={r.sleeve} onChange={(e) => update(i, { sleeve: e.target.value as Sleeve })} aria-label={t("customJersey.roster.sleeve")}>
                      <option value="short">{t("customJersey.options.short")}</option>
                      <option value="full">{t("customJersey.options.full")}</option>
                    </select>
                  </td>
                  <td>
                    <button type="button" onClick={() => onChange(rows.filter((_, x) => x !== i))} aria-label={t("customJersey.roster.remove")} className="p-1 text-text-muted hover:text-badge-discount">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
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

/** "M: 5 · L: 4 · Total 9" */
export function SizeSummary({ summary, total, label }: { summary: [string, number][]; total: number; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {summary.map(([size, count]) => (
        <span key={size} className="px-2 py-1 rounded-md bg-surface-subtle border border-border-light tabular-nums">
          <strong>{size}</strong>: {count}
        </span>
      ))}
      <span className="px-2 py-1 rounded-md bg-primary text-white font-semibold tabular-nums">
        {label}: {total}
      </span>
    </div>
  );
}
