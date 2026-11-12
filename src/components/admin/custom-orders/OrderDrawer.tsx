"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Copy, Download, ImagePlus, Loader2, X } from "lucide-react";
import { JerseyPreview } from "@/components/custom-jersey/JerseyPreview";
import { sizeSummary } from "@/lib/custom-jersey/pricing";
import { BEFORE_APPROVAL, STAFF_TRANSITIONS, isOverdue, type CustomOrderDetail, type CustomOrderStatus, type Pattern } from "@/lib/custom-jersey/types";
import { STATUS_LABEL, taka } from "./labels";

interface Payload {
  order: CustomOrderDetail;
  due: { total: number; paid: number; advance: number; payable: number; kind: "advance" | "balance" };
  customer_link: string;
  preview_url: string | null;
  logo_url: string | null;
}

const field = "px-2.5 py-1.5 text-sm bg-surface-subtle rounded border border-border-light";
const btn = "inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase px-3 py-2 rounded disabled:opacity-50";
const primary = `${btn} bg-primary text-white`;
const outline = `${btn} border border-border-light bg-white`;
const sectionTitle = "font-display uppercase font-bold text-primary text-xs tracking-wider mb-2";

async function uploadImage(file: File, kind: "mockup" | "gallery"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json.path as string;
}

export function OrderDrawer({
  orderId,
  staff,
  onClose,
  onChanged,
}: {
  orderId: string;
  staff: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [reason, setReason] = useState("");
  const [mockupPaths, setMockupPaths] = useState<{ path: string; preview: string }[]>([]);
  const [mockupNote, setMockupNote] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [reply, setReply] = useState("");
  const [pay, setPay] = useState({ amount: "", method: "cash", trx_id: "", note: "" });
  const [side, setSide] = useState<"front" | "back">("front");
  const [galleryCaption, setGalleryCaption] = useState("");

  const apply = useCallback((json: Payload) => {
    setData(json);
    setFinalPrice(String(json.order.final_price ?? json.order.estimated_price));
    setPay((p) => ({ ...p, amount: json.due.payable > 0 ? String(json.due.payable) : "" }));
  }, []);

  useEffect(() => {
    fetch(`/api/admin/custom-orders/${orderId}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Could not load the order");
        apply(json);
      })
      .catch((err) => setError(err.message));
  }, [orderId, apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const act = async (action: string, body: Record<string, unknown> = {}): Promise<boolean> => {
    setBusy(action + (body.to ?? ""));
    setError(null);
    try {
      const res = await fetch(`/api/admin/custom-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save");
        return false;
      }
      apply(json);
      onChanged();
      return true;
    } catch {
      setError("Network problem. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const addMockupImages = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("upload");
    setError(null);
    try {
      for (const file of Array.from(list).slice(0, 8 - mockupPaths.length)) {
        const path = await uploadImage(file, "mockup");
        setMockupPaths((prev) => [...prev, { path, preview: URL.createObjectURL(file) }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const addGalleryPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy("gallery");
    setError(null);
    try {
      const path = await uploadImage(file, "gallery");
      if (await act("gallery_add", { image: path, caption: galleryCaption })) setGalleryCaption("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(null);
    }
  };

  const exportRoster = () => {
    if (!data) return;
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = ["Name,Number,Size,Sleeve", ...data.order.roster.map((r) => [r.player_name, r.player_number, r.size, r.sleeve].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.order.order_number}-team-list.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const o = data?.order;
  const next = o ? STAFF_TRANSITIONS[o.status].filter((s) => !["mockup_sent", "rejected", "changes_needed"].includes(s)) : [];
  const forward = next[0];
  const backward = next[1];
  const canMockup = o && ["submitted", "in_review", "mockup_sent", "revision_requested"].includes(o.status);
  const canDecline = o && STAFF_TRANSITIONS[o.status].includes("rejected");
  const canAskChanges = o && STAFF_TRANSITIONS[o.status].includes("changes_needed");
  const takesMoney = o && !BEFORE_APPROVAL.includes(o.status) && !["rejected", "cancelled"].includes(o.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Custom order" className="w-full max-w-2xl h-full bg-surface overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-surface-card border-b border-border-light px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-primary text-lg leading-tight">{o?.order_number ?? "…"}</p>
            {o && (
              <p className="text-xs text-text-muted">
                {STATUS_LABEL[o.status]}
                {isOverdue(o) && <span className="ml-2 text-badge-discount font-bold">LATE</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-surface-subtle">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="m-4 flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {!o || !data ? (
          !error && (
            <div className="flex justify-center py-16 text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )
        ) : (
          <div className="p-4 flex flex-col gap-5">
            {/* Customer */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4">
              <h3 className={sectionTitle}>Customer</h3>
              <p className="text-sm font-semibold">{o.customer_name}</p>
              <p className="text-sm">
                <a href={`tel:${o.customer_phone}`} className="underline underline-offset-2 tabular-nums">{o.customer_phone}</a>
                {" · "}
                <a href={`https://wa.me/88${o.customer_phone}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">WhatsApp</a>
                {o.customer_email && <> · {o.customer_email}</>}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {o.delivery_method === "pickup" ? "Collects from the shop" : `Delivery (${o.delivery_zone === "dhaka" ? "inside Dhaka" : "outside Dhaka"}): ${o.delivery_address}`}
              </p>
              <button
                className={`${outline} mt-2`}
                onClick={() => {
                  void navigator.clipboard?.writeText(data.customer_link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy the customer's link"}
              </button>
            </section>

            {/* Next step */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4 flex flex-col gap-3">
              <h3 className={sectionTitle}>Next step</h3>
              {o.status_reason && <p className="text-sm bg-surface-subtle rounded p-2">Reason given: {o.status_reason}</p>}
              {o.status === "approved" && <p className="text-sm">The customer confirmed the design. Waiting for the advance of <strong>{taka(o.advance_amount ?? 0)}</strong>; it moves to the queue by itself once that is paid.</p>}
              {o.status === "changes_needed" && <p className="text-sm">Waiting for the customer to send it again.</p>}

              {(forward || backward) && (
                <div className="flex flex-wrap gap-2">
                  {backward && (
                    <button className={outline} disabled={busy !== null} onClick={() => act("move", { to: backward })}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to {STATUS_LABEL[backward]}
                    </button>
                  )}
                  {forward && (
                    <button className={primary} disabled={busy !== null} onClick={() => act("move", { to: forward })}>
                      {busy === `move${forward}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {forward === "in_review" ? "Start review" : `Move to ${STATUS_LABEL[forward]}`} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {forward === "delivered" && data.due.total - data.due.paid > 0 && (
                <p className="text-xs text-amber-700">Still to collect: {taka(data.due.total - data.due.paid)}. Record it under Payments when the money arrives.</p>
              )}

              {canMockup && (
                <div className="border-t border-border-light pt-3 flex flex-col gap-2">
                  <p className="text-sm font-semibold">Send the mockup and the final price</p>
                  <div className="flex flex-wrap gap-2">
                    {mockupPaths.map((m) => (
                      <div key={m.path} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.preview} alt="" className="w-20 h-20 object-cover rounded border border-border-light" />
                        <button aria-label="Remove" className="absolute -top-1.5 -right-1.5 bg-white border border-border-light rounded-full p-0.5" onClick={() => setMockupPaths(mockupPaths.filter((x) => x.path !== m.path))}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="w-20 h-20 rounded border-2 border-dashed border-border-light flex items-center justify-center cursor-pointer text-text-muted hover:bg-surface-subtle">
                      {busy === "upload" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                      <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void addMockupImages(e.target.files); e.target.value = ""; }} />
                    </label>
                  </div>
                  <textarea className={`${field} w-full`} rows={2} placeholder="Note for the customer (optional)" value={mockupNote} onChange={(e) => setMockupNote(e.target.value)} />
                  <label className="text-xs font-semibold flex items-center gap-2">
                    Final price ৳
                    <input type="number" min={0} className={`${field} w-32`} value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} />
                    <span className="font-normal text-text-muted">estimate was {taka(o.estimated_price)}; delivery {taka(o.delivery_charge)} is added on top</span>
                  </label>
                  <button
                    className={`${primary} self-start`}
                    disabled={busy !== null || mockupPaths.length === 0 || !(Number(finalPrice) > 0)}
                    onClick={async () => {
                      if (await act("send_mockup", { images: mockupPaths.map((m) => m.path), note: mockupNote, final_price: Number(finalPrice) })) {
                        setMockupPaths([]);
                        setMockupNote("");
                      }
                    }}
                  >
                    {busy === "send_mockup" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send mockup to the customer
                  </button>
                  {o.revision_count > 0 && <p className="text-xs text-text-muted">The customer has asked for {o.revision_count} change(s) so far.</p>}
                </div>
              )}

              {(canAskChanges || canDecline) && (
                <div className="border-t border-border-light pt-3 flex flex-col gap-2">
                  <textarea className={`${field} w-full`} rows={2} placeholder="Reason (the customer reads this): unclear picture, copyright logo, cannot be printed…" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {canAskChanges && (
                      <button className={outline} disabled={busy !== null || reason.trim().length < 3} onClick={async () => (await act("move", { to: "changes_needed", reason })) && setReason("")}>
                        Ask the customer for changes
                      </button>
                    )}
                    {canDecline && (
                      <button
                        className={`${btn} border border-badge-discount text-badge-discount`}
                        disabled={busy !== null || reason.trim().length < 3}
                        onClick={async () => confirm("Reject this request? The customer is told the reason.") && (await act("move", { to: "rejected", reason })) && setReason("")}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Request */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4 flex flex-col gap-3">
              <h3 className={sectionTitle}>Request</h3>
              <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-text-muted">Sport</dt><dd className="capitalize">{o.sport}</dd>
                <dt className="text-text-muted">Quantity</dt><dd className="tabular-nums">{o.quantity}</dd>
                <dt className="text-text-muted">Fabric</dt><dd>{o.fabric_name}</dd>
                <dt className="text-text-muted">Options</dt>
                <dd>{[`${o.sleeve} sleeve`, `${o.collar} collar`, o.with_names && "names", o.with_numbers && "numbers", o.with_logo && "logo", o.with_shorts && "shorts"].filter(Boolean).join(" · ")}</dd>
                <dt className="text-text-muted">Needed by</dt>
                <dd>{o.needed_by ?? "no date"} {o.is_rush && <span className="ml-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">Urgent</span>}</dd>
                <dt className="text-text-muted">Estimate</dt><dd className="tabular-nums">{taka(o.estimated_price)}</dd>
                {o.final_price !== null && (<><dt className="text-text-muted">Final price</dt><dd className="tabular-nums font-semibold">{taka(o.final_price)} + delivery {taka(o.delivery_charge)}</dd></>)}
                <dt className="text-text-muted">Gallery</dt><dd>{o.gallery_consent ? "Customer agreed to photos" : "No permission"}</dd>
              </dl>
              {o.notes && <p className="text-sm whitespace-pre-line bg-surface-subtle rounded p-2">{o.notes}</p>}

              {o.source === "template" && o.design.pattern && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-3 items-start">
                    <div className="w-44 bg-surface-subtle rounded-lg p-2">
                      <JerseyPreview pattern={o.design.pattern as Pattern} colors={o.design.colors ?? []} side={side} sleeve={o.sleeve} teamName={o.design.team_name} name={o.design.name} number={o.design.number} logo={data.logo_url} className="w-full h-auto" />
                    </div>
                    <div className="text-xs flex flex-col gap-1.5">
                      <button className={outline} onClick={() => setSide(side === "front" ? "back" : "front")}>Show {side === "front" ? "back" : "front"}</button>
                      <p>Pattern: <strong>{o.design.pattern}</strong></p>
                      <p className="flex items-center gap-1.5">
                        Colours:
                        {(o.design.colors ?? []).map((c) => (
                          <span key={c} className="inline-flex items-center gap-1 tabular-nums"><span className="w-4 h-4 rounded border border-border-light" style={{ background: c }} />{c}</span>
                        ))}
                      </p>
                      {o.design.team_name && <p>Team: <strong>{o.design.team_name}</strong></p>}
                      {data.preview_url && <a href={data.preview_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">What the customer saw (PNG)</a>}
                      {data.logo_url && <a href={data.logo_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Logo file</a>}
                    </div>
                  </div>
                </div>
              )}

              {o.files.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {o.files.map((f, i) => (
                    <li key={f.path}>
                      <a href={`/api/custom-jersey/file?id=${o.id}&i=${i}`} target="_blank" rel="noopener noreferrer" className="text-sm inline-flex items-center gap-1.5 underline underline-offset-2">
                        <Download className="w-3.5 h-3.5" /> {f.name} <span className="text-xs text-text-muted">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Team list */}
            {o.roster.length > 0 && (
              <section className="bg-surface-card rounded-xl border border-border-light p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`${sectionTitle} mb-0`}>Team list ({o.roster.length})</h3>
                  <button className={outline} onClick={exportRoster}><Download className="w-3.5 h-3.5" /> CSV</button>
                </div>
                <p className="text-xs mb-2 tabular-nums">{sizeSummary(o.roster).map(([s, n]) => `${s}: ${n}`).join(" · ")}</p>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase text-text-muted"><th>#</th><th>Name</th><th>No.</th><th>Size</th><th>Sleeve</th></tr></thead>
                    <tbody>
                      {o.roster.map((r, i) => (
                        <tr key={r.id} className="border-t border-border-light">
                          <td className="py-1 text-text-muted tabular-nums">{i + 1}</td><td>{r.player_name}</td><td className="tabular-nums">{r.player_number}</td><td>{r.size}</td><td>{r.sleeve}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Mockups sent */}
            {o.mockups.length > 0 && (
              <section className="bg-surface-card rounded-xl border border-border-light p-4">
                <h3 className={sectionTitle}>Mockups sent</h3>
                {o.mockups.map((m) => (
                  <div key={m.id} className="mb-3 last:mb-0">
                    <p className="text-xs text-text-muted mb-1">v{m.version} · {new Date(m.created_at).toLocaleString("en-GB")}{m.note ? ` · ${m.note}` : ""}</p>
                    <div className="flex flex-wrap gap-2">
                      {m.images.map((src) => (
                        <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="w-20 h-20 object-cover rounded border border-border-light" />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Production */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4">
              <h3 className={sectionTitle}>Production</h3>
              <form
                className="grid sm:grid-cols-2 gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act("update", { assigned_to: f.get("assigned_to"), due_date: f.get("due_date"), staff_note: f.get("staff_note") });
                }}
              >
                <label className="text-xs font-semibold flex flex-col gap-1">
                  Responsible
                  <select name="assigned_to" className={field} defaultValue={o.assigned_to ?? ""} key={`a-${o.assigned_to}`}>
                    <option value="">Nobody yet</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold flex flex-col gap-1">
                  Delivery date
                  <input name="due_date" type="date" className={field} defaultValue={o.due_date ?? ""} key={`d-${o.due_date}`} />
                </label>
                <label className="text-xs font-semibold flex flex-col gap-1 sm:col-span-2">
                  Staff note (the customer never sees this)
                  <textarea name="staff_note" className={field} rows={2} defaultValue={o.staff_note ?? ""} key={`n-${o.staff_note}`} />
                </label>
                <button type="submit" className={`${outline} justify-self-start`} disabled={busy !== null}>Save</button>
              </form>
            </section>

            {/* Payments */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4 flex flex-col gap-3">
              <h3 className={sectionTitle}>Payments</h3>
              {o.final_price === null ? (
                <p className="text-sm text-text-muted">No price yet. It is set when the mockup is sent.</p>
              ) : (
                <p className="text-sm tabular-nums">
                  Total {taka(data.due.total)} · Advance {o.advance_amount === null ? "after the customer confirms" : taka(o.advance_amount)} · Paid <strong>{taka(data.due.paid)}</strong> · Left <strong>{taka(Math.max(0, data.due.total - data.due.paid))}</strong>
                </p>
              )}
              {o.payments.length > 0 && (
                <ul className="text-sm divide-y divide-border-light">
                  {o.payments.map((p) => (
                    <li key={p.id} className="py-1.5 flex flex-wrap gap-x-3 items-baseline">
                      <span className="tabular-nums font-semibold">{taka(p.amount)}</span>
                      <span>{p.kind} · {p.method}{p.trx_id ? ` · ${p.trx_id}` : ""}</span>
                      <span className={`text-xs ${p.status === "successful" ? "text-emerald-700" : "text-text-muted"}`}>{p.status}</span>
                      <span className="text-xs text-text-muted ml-auto">{new Date(p.created_at).toLocaleString("en-GB")}</span>
                      {p.note && <span className="basis-full text-xs text-text-muted">{p.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {takesMoney && data.due.total - data.due.paid > 0 && (
                <div className="flex flex-wrap items-end gap-2 border-t border-border-light pt-3">
                  <label className="text-xs font-semibold flex flex-col gap-1">Amount ৳<input type="number" min={1} className={`${field} w-28`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
                  <label className="text-xs font-semibold flex flex-col gap-1">
                    Paid by
                    <select className={field} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                      <option value="cash">Cash</option><option value="card">Card (shop machine)</option><option value="bkash">bKash (manual)</option><option value="nagad">Nagad (manual)</option><option value="bank">Bank</option><option value="cod">COD from courier</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold flex flex-col gap-1">TrxID / slip<input className={`${field} w-32`} value={pay.trx_id} onChange={(e) => setPay({ ...pay, trx_id: e.target.value })} /></label>
                  <button
                    className={primary}
                    disabled={busy !== null || !(Number(pay.amount) > 0)}
                    onClick={async () => confirm(`Record ${taka(Number(pay.amount))} received by ${pay.method}?`) && (await act("payment", { ...pay, amount: Number(pay.amount) })) && setPay({ amount: "", method: "cash", trx_id: "", note: "" })}
                  >
                    Record payment
                  </button>
                </div>
              )}
            </section>

            {/* Messages */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4 flex flex-col gap-2">
              <h3 className={sectionTitle}>Messages</h3>
              {o.messages.length === 0 && <p className="text-sm text-text-muted">No messages.</p>}
              {o.messages.map((m) => (
                <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.author === "staff" ? "self-end bg-primary text-white" : "self-start bg-surface-subtle"}`}>
                  <span className="block text-[10px] uppercase font-bold opacity-70">{m.author === "staff" ? "Staff" : "Customer"} · {new Date(m.created_at).toLocaleString("en-GB")}</span>
                  <span className="whitespace-pre-line break-words">{m.body}</span>
                </div>
              ))}
              <form className="flex gap-2 mt-1" onSubmit={async (e) => { e.preventDefault(); if (reply.trim() && (await act("message", { body: reply }))) setReply(""); }}>
                <input className={`${field} flex-1`} placeholder="Reply (shown on the customer's order page)" value={reply} onChange={(e) => setReply(e.target.value)} />
                <button type="submit" className={outline} disabled={busy !== null || !reply.trim()}>Send</button>
              </form>
            </section>

            {/* Gallery */}
            {["ready", "delivered"].includes(o.status) && (
              <section className="bg-surface-card rounded-xl border border-border-light p-4 flex flex-col gap-2">
                <h3 className={sectionTitle}>Gallery photo</h3>
                {o.gallery_consent ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className={`${field} flex-1 min-w-40`} placeholder="Caption (optional)" value={galleryCaption} onChange={(e) => setGalleryCaption(e.target.value)} />
                    <label className={`${outline} cursor-pointer`}>
                      {busy === "gallery" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Add a photo of the finished jersey
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void addGalleryPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">The customer did not agree to show this jersey, so it cannot go in the gallery.</p>
                )}
              </section>
            )}

            {/* History */}
            <section className="bg-surface-card rounded-xl border border-border-light p-4">
              <h3 className={sectionTitle}>History</h3>
              <ul className="text-xs flex flex-col gap-1">
                {o.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-2">
                    <span className="text-text-muted tabular-nums">{new Date(e.created_at).toLocaleString("en-GB")}</span>
                    <strong>{STATUS_LABEL[e.to_status as CustomOrderStatus] ?? e.to_status}</strong>
                    <span className="text-text-muted">by {e.actor}{e.note ? ` · ${e.note}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
