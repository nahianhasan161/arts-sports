import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { publicUrlFor } from "@/lib/media/storage";
import { isStaffImagePath } from "@/lib/custom-jersey/files";
import {
  customerLink,
  dueFor,
  findOrder,
  loadDetail,
  moveOrder,
  notifyCustomOrder,
  recordManualPayment,
  stageLabel,
  type OrderRow,
} from "@/lib/custom-jersey/server";
import { BEFORE_APPROVAL, STAFF_TRANSITIONS, STATUSES, type CustomOrderStatus } from "@/lib/custom-jersey/types";
import { formatMoney, resolveLocale } from "@/i18n";

/**
 * GET   /api/admin/custom-orders/<id>   everything about one order
 * PATCH /api/admin/custom-orders/<id>   { action }
 *         move          { to, reason? }                 next step, send back, reject
 *         send_mockup   { images: paths[], note?, final_price }
 *         update        { final_price?, delivery_charge?, assigned_to?, due_date?, staff_note? }
 *         message       { body }
 *         payment       { amount, method, kind?, trx_id?, note? }   cash/card/wallet taken by staff
 *         gallery_add   { image: path, caption? }       needs the customer's consent
 */

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const PAY_METHODS = ["cash", "card", "bkash", "nagad", "bank", "cod"];

async function respond(order: OrderRow) {
  const fresh = (await findOrder({ id: order.id })) ?? order;
  const detail = await loadDetail(fresh, "staff");
  return NextResponse.json({
    order: detail,
    due: dueFor(fresh, detail.paid_total),
    customer_link: customerLink(fresh.access_token),
    preview_url: typeof fresh.design?.preview_path === "string" ? publicUrlFor(fresh.design.preview_path) : null,
    logo_url: typeof fresh.design?.logo_path === "string" ? publicUrlFor(fresh.design.logo_path) : null,
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("custom_orders.manage");
    const { id } = await params;
    const order = await findOrder({ id });
    if (!order) return bad("Not found", 404);
    return await respond(order);
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("custom_orders.manage");
    const { id } = await params;
    const b = (await request.json()) as Record<string, unknown>;
    const order = await findOrder({ id });
    if (!order) return bad("Not found", 404);

    const db = getServiceSupabase();
    const staff = { kind: "staff" as const, id: user.id };
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const stale = () => bad("Someone else changed this order. Reload it.", 409);
    const locale = resolveLocale(order.locale);

    switch (b.action) {
      case "move": {
        const to = STATUSES.find((s) => s === b.to) as CustomOrderStatus | undefined;
        if (!to || !STAFF_TRANSITIONS[order.status].includes(to) || to === "mockup_sent") {
          return bad(`An order that is "${order.status}" cannot be moved to "${String(b.to)}"`);
        }
        const reason = text(b.reason, 1000);
        if ((to === "rejected" || to === "changes_needed") && reason.length < 3) return bad("Give the reason: the customer will read it");
        if (!(await moveOrder(order, to, staff, { reason: reason || null }))) return stale();

        if (to === "changes_needed") await notifyCustomOrder(order, "custom_changes_needed", { reason });
        else if (to === "rejected") await notifyCustomOrder(order, "custom_rejected", { reason });
        else if (to === "ready") {
          const detail = await loadDetail(order, "staff");
          const due = dueFor({ ...order, status: to }, detail.paid_total);
          await notifyCustomOrder(order, "custom_ready", { amount: formatMoney(due.payable, locale) });
        } else if (to === "delivered") await notifyCustomOrder(order, "custom_delivered");
        else if (["cutting", "printing", "sewing", "qc"].includes(to)) {
          await notifyCustomOrder(order, "custom_stage", { stage: stageLabel(to, order.locale) });
        }
        break;
      }

      case "send_mockup": {
        if (!["submitted", "in_review", "mockup_sent", "revision_requested"].includes(order.status)) {
          return bad("A mockup can only be sent while the design is being reviewed");
        }
        const images = (Array.isArray(b.images) ? b.images : []).filter(isStaffImagePath).slice(0, 8);
        if (images.length === 0) return bad("Upload at least one mockup image");
        const finalPrice = Number(b.final_price);
        if (!Number.isFinite(finalPrice) || finalPrice <= 0 || finalPrice > 10_000_000) return bad("Enter the final price");

        const { data: last } = await db.from("custom_order_mockups").select("version").eq("custom_order_id", order.id).order("version", { ascending: false }).limit(1);
        const version = (last?.[0]?.version ?? 0) + 1;
        const { error } = await db.from("custom_order_mockups").insert({
          custom_order_id: order.id,
          version,
          images: images.map((p) => publicUrlFor(p)),
          note: text(b.note, 1000) || null,
          created_by: user.id,
        });
        if (error) return bad(error.message, 500);
        if (!(await moveOrder(order, "mockup_sent", staff, { reason: null, note: `Mockup v${version}`, patch: { final_price: finalPrice } }))) return stale();
        await notifyCustomOrder(order, "custom_mockup_ready", { total: formatMoney(finalPrice, locale) });
        break;
      }

      case "update": {
        const patch: Record<string, unknown> = {};
        if (b.final_price !== undefined || b.delivery_charge !== undefined) {
          // The price the customer confirmed is the price.
          if (!BEFORE_APPROVAL.includes(order.status)) return bad("The price cannot be changed after the customer has confirmed");
          if (b.final_price !== undefined) {
            const n = Number(b.final_price);
            if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return bad("Final price is not a valid amount");
            patch.final_price = n;
          }
          if (b.delivery_charge !== undefined) {
            const n = Number(b.delivery_charge);
            if (!Number.isFinite(n) || n < 0 || n > 100_000) return bad("Delivery charge is not a valid amount");
            patch.delivery_charge = n;
          }
        }
        if (b.assigned_to !== undefined) patch.assigned_to = typeof b.assigned_to === "string" && b.assigned_to ? b.assigned_to : null;
        if (b.due_date !== undefined) {
          const d = text(b.due_date, 10);
          if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad("Due date is not a valid date");
          patch.due_date = d || null;
        }
        if (b.staff_note !== undefined) patch.staff_note = text(b.staff_note, 2000) || null;
        if (Object.keys(patch).length === 0) return bad("Nothing to change");
        const { error } = await db.from("custom_orders").update(patch).eq("id", order.id);
        if (error) return bad(error.message, 500);
        break;
      }

      case "message": {
        const body = text(b.body, 2000);
        if (!body) return bad("Write a message first");
        const { error } = await db.from("custom_order_messages").insert({ custom_order_id: order.id, author: "staff", author_id: user.id, body });
        if (error) return bad(error.message, 500);
        break;
      }

      case "payment": {
        if (BEFORE_APPROVAL.includes(order.status) || ["rejected", "cancelled"].includes(order.status)) {
          return bad("Money is taken only after the customer has confirmed the design");
        }
        const amount = Number(b.amount);
        const method = text(b.method, 20);
        if (!Number.isFinite(amount) || amount <= 0) return bad("Enter the amount");
        if (!PAY_METHODS.includes(method)) return bad("Choose how it was paid");
        const detail = await loadDetail(order, "staff");
        const due = dueFor(order, detail.paid_total);
        if (amount > due.total - due.paid + 0.001) return bad(`That is more than what is left to pay (${formatMoney(due.total - due.paid, "en")})`);
        const kind = b.kind === "advance" || b.kind === "balance" || b.kind === "other" ? b.kind : due.kind;
        await recordManualPayment({ order, amount, method, kind, trxId: text(b.trx_id, 60), note: text(b.note, 300), staffId: user.id });
        break;
      }

      case "gallery_add": {
        // Only with the customer's permission (roadmap 3.4).
        if (!order.gallery_consent) return bad("The customer has not agreed to show this jersey in the gallery");
        if (!isStaffImagePath(b.image)) return bad("Upload the photo first");
        const { error } = await db.from("custom_gallery").insert({
          custom_order_id: order.id,
          image_url: publicUrlFor(b.image),
          caption: text(b.caption, 200) || null,
          sport: order.sport,
        });
        if (error) return bad(error.message, 500);
        break;
      }

      default:
        return bad("Unknown action");
    }
    return await respond(order);
  } catch (error) {
    return handleAdminError(error);
  }
}
