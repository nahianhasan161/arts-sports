import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { customerLink, dueFor, explainDbError, findOrder, loadConfig, moveOrder, notifyCustomOrder, paidTotal, queueIfAdvanceCovered, recordManualPayment, stageLabel } from "@/lib/custom-jersey/server";
import { formatMoney, resolveLocale } from "@/i18n";
import { advanceFor, estimate, parseAdvance, parseChoice, parseLogoType, resolveChoice } from "@/lib/custom-jersey/pricing";
import { isDesignPath } from "@/lib/custom-jersey/files";
import { cleanRosterRow } from "@/lib/custom-jersey/roster";
import { COUNTER_STEPS, SPORTS, STATUSES, orderTotal, type Collar, type OrderItem, type RosterRow, type Sleeve, type UploadedFile } from "@/lib/custom-jersey/types";
import { estimateOrder, MAX_ITEMS } from "@/lib/custom-jersey/items";
import { bad, failed } from "@/lib/pos/http";
import type { CounterOrder } from "@/components/admin/pos/CustomTab";

/** Latest orders per page when the search box is empty. */
const PAGE = 12;
const PAY_METHODS = ["cash", "card", "bkash", "nagad"];
const NOT_PAYABLE = ["submitted", "in_review", "changes_needed", "mockup_sent", "revision_requested", "rejected", "cancelled"];

/**
 * Custom jersey orders at the counter (roadmap 4.3).
 *
 * GET  ?q=<order number, name, phone, or the scanned receipt QR>   stage and balance
 *      (no q: the latest orders, PAGE at a time from ?offset=, so the counter can see what was just taken)
 *      &status=<status> or status=open (not delivered/rejected/cancelled) narrows the list
 * POST { id, action: "payment", amount, method, trx_id }     take the advance or the balance
 *      { id, action: "handover" }                            ready -> delivered, once fully paid
 *      { id, action: "move", to, from }                      production step (any of queued … ready)
 *      { action: "create", ... }                             a new order taken at the counter (see createOrder)
 */
export async function GET(request: Request) {
  try {
    const { user: actor } = await requirePermission("pos.use");
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const q = (params.get("q") ?? "").trim().slice(0, 200);
    const db = getServiceSupabase(actor);

    const columns = "id, order_number, access_token, customer_name, customer_phone, quantity, fabric_name, sport, final_price, estimated_price, advance_amount, delivery_charge, status, due_date, needed_by, created_at";
    const offset = Math.max(0, Math.floor(Number(params.get("offset")) || 0));
    const latest = !q && !id;
    let query = db.from("custom_orders").select(columns).order("created_at", { ascending: false });
    // One extra row tells the list whether there is another page.
    query = latest ? query.range(offset, offset + PAGE) : query.limit(10);
    // The receipt QR is the customer's link, which ends in the access token.
    const token = q.match(/order\/([0-9a-f]{40,})/i)?.[1];
    const phone = normalizeBdPhone(q);
    const status = params.get("status") ?? "";
    if (status === "open") query = query.not("status", "in", "(delivered,rejected,cancelled)");
    else if ((STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
    if (id) query = query.eq("id", id);
    else if (token) query = query.eq("access_token", token);
    else if (phone) query = query.eq("customer_phone", phone);
    else if (q) {
      const term = q.replace(/[%,()*]/g, "");
      query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
    }

    const { data: found, error } = await query;
    if (error) return bad(explainDbError(error.message), 500);
    const more = latest && (found ?? []).length > PAGE;
    const data = more ? (found ?? []).slice(0, PAGE) : found;
    // The designs, when the order has several (column from migration 20261121100000; skipped before it).
    const ids = (data ?? []).map((o) => o.id);
    const designsOf = new Map<string, NonNullable<CounterOrder["designs"]>>();
    if (ids.length) {
      const { data: rows } = await db.from("custom_orders").select("id, items, estimate_breakdown").in("id", ids);
      for (const r of (rows ?? []) as { id: string; items: OrderItem[] | null; estimate_breakdown: { items?: { id: string; pieces: number; pants: number }[] } | null }[]) {
        if (!Array.isArray(r.items) || !r.items.length) continue;
        designsOf.set(
          r.id,
          r.items.map((it) => {
            const e = r.estimate_breakdown?.items?.find((x) => x.id === it.id);
            return { title: it.title, pieces: e?.pieces ?? 0, pants: e?.pants ?? 0, fabric: it.fabric_name ?? it.pant?.fabric_name ?? null, jersey: it.jersey };
          })
        );
      }
    }

    // Paid so far, read once for the whole page (not one query per order).
    const paidOf = new Map<string, number>();
    if (ids.length) {
      const { data: pays } = await db.from("custom_order_payments").select("custom_order_id, amount").in("custom_order_id", ids).eq("status", "successful");
      for (const p of pays ?? []) paidOf.set(p.custom_order_id, (paidOf.get(p.custom_order_id) ?? 0) + Number(p.amount));
    }

    const orders = [];
    for (const o of data ?? []) {
      const paid = paidOf.get(o.id) ?? 0;
      const due = dueFor({ ...o, final_price: o.final_price === null ? null : Number(o.final_price), delivery_charge: Number(o.delivery_charge), advance_amount: o.advance_amount === null ? null : Number(o.advance_amount) }, paid);
      const { access_token, ...rest } = o;
      orders.push({ ...rest, designs: designsOf.get(o.id) ?? [], link: customerLink(access_token), paid: due.paid, total: due.total, payable: due.payable, kind: due.kind, can_pay: !NOT_PAYABLE.includes(o.status) && o.final_price !== null });
    }
    return NextResponse.json({ orders, more });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("pos.use");
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "create") return await createOrder(b, user.id);
    const order = await findOrder({ id: String(b.id ?? "") });
    if (!order) return bad("Order not found", 404);
    const paid = await paidTotal(order.id);
    const due = dueFor(order, paid);

    if (b.action === "payment") {
      if (NOT_PAYABLE.includes(order.status) || order.final_price === null) return bad("Money is taken only after the customer has confirmed the design");
      const amount = Number(b.amount);
      const method = String(b.method ?? "");
      if (!Number.isFinite(amount) || amount <= 0) return bad("Enter the amount");
      if (!PAY_METHODS.includes(method)) return bad("Choose how it was paid");
      if (amount > due.total - due.paid + 0.001) return bad(`That is more than what is left to pay (৳${due.total - due.paid})`);
      try {
        await recordManualPayment({ order, amount, method, kind: due.kind, trxId: typeof b.trx_id === "string" ? b.trx_id.trim().slice(0, 60) : null, note: "Taken at the shop counter", staffId: user.id, atCounter: true });
      } catch (err) {
        return bad(err instanceof Error ? err.message : "Could not record the payment");
      }
      return NextResponse.json({ ok: true });
    }

    if (b.action === "handover") {
      if (order.status !== "ready") return bad("The order is not marked ready yet");
      if (due.total - due.paid > 0.001) return bad(`৳${due.total - due.paid} is still to be paid`);
      const moved = await moveOrder(order, "delivered", { kind: "staff", id: user.id }, { note: "Handed over at the shop" });
      if (!moved) return bad("Someone else just changed this order. Search again.", 409);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "move") {
      const to = COUNTER_STEPS.find((x) => x === b.to);
      // `from` = the status the screen showed, so a stale screen cannot skip a step.
      if (typeof b.from === "string" && b.from !== order.status) return bad("Someone else just changed this order. Search again.", 409);
      // Any production step to any other (staff pick the step from a list); review/mockup stay on the online board.
      if (!to || to === order.status || !(COUNTER_STEPS as readonly string[]).includes(order.status)) {
        return bad(`An order that is "${order.status}" cannot be moved to "${String(b.to)}" here`);
      }
      const moved = await moveOrder(order, to, { kind: "staff", id: user.id }, { note: "Moved at the shop counter" });
      if (!moved) return bad("Someone else just changed this order. Search again.", 409);
      // Same customer messages as the online board, only when the order moves forward.
      const forward = COUNTER_STEPS.indexOf(to) > COUNTER_STEPS.indexOf(order.status as (typeof COUNTER_STEPS)[number]);
      if (!forward) { /* sent back to fix something: no message */ }
      else if (to === "ready") await notifyCustomOrder(order, "custom_ready", { amount: formatMoney(dueFor({ ...order, status: to }, paid).payable, resolveLocale(order.locale)) });
      else if (to !== "queued") await notifyCustomOrder(order, "custom_stage", { stage: stageLabel(to, order.locale) });
      return NextResponse.json({ ok: true });
    }

    return bad("Unknown action");
  } catch (error) {
    return failed(error);
  }
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A custom jersey order taken at the counter, with the customer standing there.
 *
 *   confirm "now"    design and price agreed at the counter: the order is approved
 *                    straight away at the agreed price, and the advance can be taken
 *                    in the same step (paying it moves the order to the queue).
 *   confirm "later"  the designer still has to make a mockup: the order goes to the
 *                    board as "submitted" and the customer confirms on their link.
 *
 * The estimate is always worked out here from the price table; staff may agree a
 * different final price (a counter discount), which is what the customer pays.
 */
async function createOrder(b: Record<string, unknown>, staffId: string) {
  const name = text(b.customer_name, 120);
  const phone = normalizeBdPhone(text(b.customer_phone, 30));
  if (name.length < 2) return bad("Enter the customer's name");
  if (!phone) return bad("Enter a valid mobile number (01XXXXXXXXX)");
  if (Array.isArray(b.items)) return await createDesignsOrder(b, staffId, name, phone);

  // The register picks a gallery design instead of a sport; "other" when none is sent.
  const sport = SPORTS.find((s) => s === b.sport) ?? "other";
  const config = await loadConfig();
  // The register sends picks from the staff-managed option lists ({ sleeve, collar, extras, logo } ids);
  // the order's sleeve / collar / with_* columns are worked out from what those options mean.
  const choice = parseChoice(b.options);
  const picked = choice ? resolveChoice(choice, config.pricing.options, b.collar === "polo" ? "polo" : "round") : null;
  const logoType = picked ? picked.logoType : (parseLogoType(b.logo_type) ?? (b.with_logo === true ? "print" : null));
  const withLogo = picked ? picked.withLogo : Boolean(logoType);
  const sleeve: Sleeve = picked ? picked.sleeve : b.sleeve === "full" ? "full" : "short";
  const collar: Collar = picked ? picked.collar : b.collar === "v" || b.collar === "polo" ? b.collar : "round";
  const withShorts = picked ? picked.withShorts : b.with_shorts === true;
  const withNames = picked ? picked.withNames : b.with_names === true;
  const withNumbers = picked ? picked.withNumbers : b.with_numbers === true;

  const fabric = config.fabrics.find((f) => f.id === b.fabric_id);
  if (!fabric) return bad("Choose a fabric");

  // Sizes as counts ({ M: 5, L: 4 }) or a full roster with names and numbers.
  const roster: RosterRow[] = [];
  for (const r of Array.isArray(b.roster) ? b.roster.slice(0, 2000) : []) {
    const row = cleanRosterRow(r, sleeve);
    // With option picks one sleeve option is priced for every piece, so every row gets that sleeve.
    if (row) roster.push(picked ? { ...row, sleeve } : row);
  }
  const quantity = roster.length || Math.floor(Number(b.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 2000) return bad("Quantity must be between 1 and 2000");

  const files = await resolveFiles((Array.isArray(b.files) ? b.files.slice(0, 10) : []) as Partial<UploadedFile>[], staffId);
  const notes = text(b.notes, 4000) || null;
  if (files.length === 0 && !notes) return bad("Add the design file, or write what the customer wants");

  const neededBy = /^\d{4}-\d{2}-\d{2}$/.test(text(b.needed_by, 10)) ? text(b.needed_by, 10) : null;
  const result = estimate(
    { fabricPrice: fabric.price_per_piece, fabricTiers: fabric.price_tiers, quantity, sleeve, collar, withShorts, withNames, withNumbers, logoType, roster: roster.length ? roster : undefined, neededBy, choice },
    config.pricing
  );
  if (result.tooSoon) return bad(`Too soon: the earliest is ${config.pricing.rush.min_days} days from today`);

  return await saveCounterOrder(b, staffId, name, phone, config, roster, {
    estimate: result.total,
    isRush: result.isRush,
    neededBy,
    columns: {
      sport,
      files,
      notes,
      fabric_id: fabric.id,
      fabric_name: fabric.name_en,
      sleeve,
      collar,
      with_shorts: withShorts,
      with_names: withNames,
      with_numbers: withNumbers,
      with_logo: withLogo,
      quantity: result.quantity,
      estimate_breakdown: { ...result, fabric_price: fabric.price_per_piece, fabric_tiers: fabric.price_tiers ?? [] },
    },
  });
}

type Config = Awaited<ReturnType<typeof loadConfig>>;

/**
 * The part both kinds of counter order share: delivery, the agreed price, the customer,
 * the row, the roster, the events, the advance taken now and the message to the customer.
 * `columns` are the order's own fields (what to make and how it was priced).
 */
async function saveCounterOrder(
  b: Record<string, unknown>,
  staffId: string,
  name: string,
  phone: string,
  config: Config,
  roster: RosterRow[],
  o: { estimate: number; isRush: boolean; neededBy: string | null; columns: Record<string, unknown> }
) {
  const pickup = b.delivery_method !== "delivery";
  const zone = pickup ? null : b.delivery_zone === "dhaka" ? "dhaka" : "outside";
  const address = pickup ? null : text(b.delivery_address, 500);
  if (!pickup && (address ?? "").length < 5) return bad("Enter the delivery address");
  const deliveryCharge = pickup ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;

  const confirmNow = b.confirm === "now";
  let finalPrice: number | null = null;
  if (confirmNow) {
    finalPrice = b.final_price === undefined || b.final_price === "" ? o.estimate : Number(b.final_price);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0 || finalPrice > 10_000_000) return bad("Enter the agreed price");
  }

  const db = getServiceSupabase({ id: staffId });
  const { data: customerId } = await db.rpc("upsert_customer", { p_phone: phone, p_name: name, p_email: null, p_user_id: null, p_channel: "shop" });

  const now = new Date().toISOString();
  const total = finalPrice === null ? 0 : orderTotal({ final_price: finalPrice, delivery_charge: deliveryCharge });
  // Staff pick the advance (30%, 50%, any amount, or none); empty = the settings %.
  let advance: number | null = null;
  if (finalPrice !== null) {
    const asked = parseAdvance(b.advance_amount, total);
    if (Number.isNaN(asked)) return bad("The advance must be between ৳0 and the order total");
    advance = asked ?? advanceFor(total, config.pricing);
  }
  const { data: created, error } = await db
    .from("custom_orders")
    .insert({
      channel: "shop",
      customer_id: typeof customerId === "string" ? customerId : null,
      customer_name: name,
      customer_phone: phone,
      locale: "bn",
      source: "upload",
      design: {},
      ...o.columns,
      needed_by: o.neededBy,
      is_rush: o.isRush,
      delivery_method: pickup ? "pickup" : "delivery",
      delivery_zone: zone,
      delivery_address: address,
      delivery_charge: deliveryCharge,
      estimated_price: o.estimate,
      ...(confirmNow ? { status: "approved", final_price: finalPrice, advance_amount: advance, approved_at: now, terms_accepted_at: now } : {}),
    })
    .select("id")
    .single();
  if (error || !created) return bad(explainDbError(error?.message ?? "Could not save the order"), 500);

  if (roster.length) {
    const { error: rosterError } = await db
      .from("custom_order_roster")
      .insert(roster.map((r, position) => ({ custom_order_id: created.id, position, ...r, player_name: r.player_name || null, player_number: r.player_number || null })));
    if (rosterError) console.error("Could not save the roster:", rosterError.message);
  }
  await db.from("custom_order_events").insert({ custom_order_id: created.id, to_status: "submitted", actor: "staff", actor_id: staffId, note: "Taken at the shop counter" });
  if (confirmNow) {
    await db.from("custom_order_events").insert({ custom_order_id: created.id, from_status: "submitted", to_status: "approved", actor: "staff", actor_id: staffId, note: `Design and price (৳${finalPrice}) agreed at the counter` });
  }

  const order = await findOrder({ id: created.id });
  if (!order) return bad("Could not load the saved order", 500);

  // The advance, taken in the same step when the customer pays now.
  const payNow = Number(b.pay_amount);
  let paymentError: string | null = null;
  if (confirmNow && Number.isFinite(payNow) && payNow > 0) {
    const method = String(b.pay_method ?? "");
    if (!PAY_METHODS.includes(method)) paymentError = "Order saved, but the payment method was not valid: take the payment again";
    else if (payNow > total + 0.001) paymentError = `Order saved, but ৳${payNow} is more than the total (৳${total}): take the payment again`;
    else {
      try {
        await recordManualPayment({ order, amount: payNow, method, kind: payNow >= total ? "balance" : "advance", trxId: text(b.pay_trx, 60) || null, note: "Taken at the shop counter", staffId, atCounter: true });
      } catch (err) {
        paymentError = `Order saved, but the payment failed: ${err instanceof Error ? err.message : "try again"}`;
      }
    }
  }

  // No advance (or the advance paid in full above): straight into the production queue.
  const queued = confirmNow && advance === 0 ? await queueIfAdvanceCovered(order.id, { kind: "staff", id: staffId }, "No advance (agreed at the counter)") : false;

  if (!queued) await notifyCustomOrder(order, confirmNow ? "custom_approved" : "custom_submitted", confirmNow ? { amount: `৳${advance}` } : {});
  else await notifyCustomOrder(order, "custom_stage", { stage: stageLabel("queued", order.locale) });
  return NextResponse.json({ ok: true, id: order.id, order_number: order.order_number, estimated_price: o.estimate, payment_error: paymentError });
}

/**
 * Uploaded pictures (private design paths), catalogue picks and gallery designs. A catalogue
 * pick sends only the product id; its picture is read from the product here. A gallery
 * design keeps all its pictures (`images`) so they can be browsed later.
 */
async function resolveFiles(pickedFiles: Partial<UploadedFile>[], staffId: string): Promise<UploadedFile[]> {
  const db = getServiceSupabase({ id: staffId });
  const uuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
  const productIds = [...new Set(pickedFiles.map((f) => f.product_id).filter(uuid))];
  const productImages = new Map<string, { title: string; image: string }>();
  if (productIds.length) {
    const { data } = await db.from("products").select("id, title, images").in("id", productIds);
    for (const p of data ?? []) {
      const image = Array.isArray(p.images) && typeof p.images[0] === "string" ? (p.images[0] as string) : null;
      if (image && /^https:\/\//.test(image)) productImages.set(p.id as string, { title: String(p.title ?? ""), image });
    }
  }
  const designIds = [...new Set(pickedFiles.map((f) => f.design_id).filter(uuid))];
  const designImages = new Map<string, { title: string; image: string; images: string[] }>();
  if (designIds.length) {
    const { data } = await db.from("custom_gallery").select("*").in("id", designIds);
    for (const d of (data ?? []) as Record<string, unknown>[]) {
      const image = typeof d.image_url === "string" ? d.image_url : "";
      const images = (Array.isArray(d.images) ? d.images : []).filter((x): x is string => typeof x === "string" && /^https:\/\//.test(x)).slice(0, 12);
      if (/^https:\/\//.test(image)) designImages.set(d.id as string, { title: String(d.title ?? d.caption ?? ""), image, images });
    }
  }
  const files: UploadedFile[] = [];
  for (const file of pickedFiles) {
    const note = text(file.note, 200) || undefined;
    if (typeof file.design_id === "string") {
      const design = designImages.get(file.design_id);
      if (design) files.push({ path: design.image, name: design.title.slice(0, 120) || "design", mime: "image/*", size: 0, kind: "reference", design_id: file.design_id, note, ...(design.images.length > 1 ? { images: design.images } : {}) });
      continue;
    }
    if (typeof file.product_id === "string") {
      const product = productImages.get(file.product_id);
      if (product) files.push({ path: product.image, name: product.title.slice(0, 120) || "catalogue", mime: "image/*", size: 0, kind: "reference", product_id: file.product_id, note });
      continue;
    }
    if (!isDesignPath(file.path)) continue;
    files.push({ path: file.path, name: text(file.name, 120) || "file", mime: text(file.mime, 80), size: Number(file.size) || 0, kind: file.kind === "reference" ? "reference" : "design", note });
  }
  return files;
}

/**
 * A counter order with several designs (custom_orders.items). Each design has its own
 * pictures, fabric, jersey type, options and pant; players say which design they are on
 * (roster.item_id) and whether they take a pant (roster.pant_size). Priced here with
 * estimateOrder() from the server's own lists; the old one-design columns are filled
 * from the first design so lists and production keep working.
 */
async function createDesignsOrder(b: Record<string, unknown>, staffId: string, name: string, phone: string) {
  const config = await loadConfig();
  const opts = config.pricing.options;
  const rawItems = (b.items as unknown[]).slice(0, MAX_ITEMS + 1);
  if (rawItems.length === 0) return bad("Add a design");
  if (rawItems.length > MAX_ITEMS) return bad(`At most ${MAX_ITEMS} designs in one order`);

  const files: UploadedFile[] = [];
  const items: OrderItem[] = [];
  for (const [n, raw] of rawItems.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = text(r.id, 20).replace(/[^\w-]/g, "") || `d${n + 1}`;
    if (items.some((x) => x.id === id)) return bad("Two designs have the same id");
    const title = text(r.title, 60) || `Design ${n + 1}`;
    const jersey = r.jersey !== false;
    const fabric = config.fabrics.find((f) => f.id === r.fabric_id) ?? null;
    if (jersey && !fabric) return bad(`${title}: choose a fabric`);
    const p = (r.pant ?? null) as Record<string, unknown> | null;
    const pantOpt = p ? (opts.pants.find((o) => o.id === p.option) ?? null) : null;
    if (p?.option && !pantOpt) return bad(`${title}: that pant is no longer on the list, pick it again`);
    if (!jersey && !pantOpt) return bad(`${title}: choose the pant`);
    const pantFabric = pantOpt ? (config.fabrics.find((f) => f.id === p!.fabric_id) ?? null) : null;
    const choice = parseChoice(r.choice) ?? { sleeve: null, collar: null, extras: [], logo: null };
    const own = await resolveFiles((Array.isArray(r.files) ? r.files.slice(0, 10) : []) as Partial<UploadedFile>[], staffId);
    const at = files.length;
    files.push(...own);
    items.push({
      id,
      title,
      jersey,
      fabric_id: jersey ? fabric!.id : null,
      fabric_name: jersey ? fabric!.name_en : null,
      jersey_type: r.jersey_type === "polo" ? "polo" : "round",
      choice: jersey ? choice : { sleeve: null, collar: null, extras: [], logo: null },
      pant: pantOpt ? { option: pantOpt.id, fabric_id: pantFabric?.id ?? null, fabric_name: pantFabric?.name_en ?? null } : null,
      notes: text(r.notes, 2000) || null,
      files: own.map((_, i) => at + i),
    });
  }

  // Players: grouped by design, in the order of the designs.
  const byItem = new Map<string, RosterRow[]>(items.map((x) => [x.id, []]));
  for (const raw of Array.isArray(b.roster) ? b.roster.slice(0, 2000) : []) {
    const item = items.find((x) => x.id === (raw as { item_id?: unknown })?.item_id);
    if (!item) continue;
    const sleeveDefault = resolveChoice(item.choice, opts, item.jersey_type).sleeve;
    const row = cleanRosterRow(raw, sleeveDefault);
    if (!row) continue;
    const pantSize = text((raw as { pant_size?: unknown }).pant_size, 20).toUpperCase() || null;
    byItem.get(item.id)!.push({
      ...row,
      item_id: item.id,
      sleeve: item.jersey ? row.sleeve : "short",
      // A pant-only design: every row is a pant, its size is the pant size.
      pant_size: !item.pant ? null : item.jersey ? pantSize : pantSize || row.size,
    });
  }
  for (const item of items) if (!byItem.get(item.id)!.length) return bad(`${item.title}: add the sizes`);
  const roster = items.flatMap((x) => byItem.get(x.id)!);
  if (roster.length > 2000) return bad("Quantity must be between 1 and 2000");

  const notes = text(b.notes, 4000) || null;
  if (files.length === 0 && !notes && !items.some((x) => x.notes)) return bad("Add the design file, or write what the customer wants");

  const neededBy = /^\d{4}-\d{2}-\d{2}$/.test(text(b.needed_by, 10)) ? text(b.needed_by, 10) : null;
  const est = estimateOrder({ items: items.map((item) => ({ item, rows: byItem.get(item.id)! })), fabrics: config.fabrics, neededBy }, config.pricing);
  if (est.tooSoon) return bad(`Too soon: the earliest is ${config.pricing.rush.min_days} days from today`);

  // The old one-design columns, from the first design with a jersey (else the first).
  const first = items.find((x) => x.jersey) ?? items[0];
  const firstPick = resolveChoice(first.choice, opts, first.jersey_type);
  const anyPick = items.filter((x) => x.jersey).map((x) => resolveChoice(x.choice, opts, x.jersey_type));
  return await saveCounterOrder(b, staffId, name, phone, config, roster, {
    estimate: est.total,
    isRush: est.isRush,
    neededBy,
    columns: {
      sport: "other",
      files,
      notes,
      items,
      fabric_id: first.fabric_id ?? first.pant?.fabric_id ?? null,
      fabric_name: first.fabric_name ?? first.pant?.fabric_name ?? null,
      sleeve: roster.some((r) => r.sleeve === "full") ? "full" : "short",
      collar: firstPick.collar,
      with_shorts: est.items.some((x) => x.pants > 0),
      with_names: anyPick.some((x) => x.withNames),
      with_numbers: anyPick.some((x) => x.withNumbers),
      with_logo: anyPick.some((x) => x.withLogo),
      quantity: est.quantity,
      estimate_breakdown: { designs: true, ...est },
    },
  });
}
