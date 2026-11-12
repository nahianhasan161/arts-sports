import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { advanceFor } from "@/lib/custom-jersey/pricing";
import { isDesignPath } from "@/lib/custom-jersey/files";
import {
  dueFor,
  findOrder,
  isOnlinePaymentAvailable,
  loadDetail,
  loadPricing,
  moveOrder,
  notifyCustomOrder,
  paidTotal,
  startCustomPayment,
  type OrderRow,
} from "@/lib/custom-jersey/server";
import { BEFORE_APPROVAL, orderTotal, type UploadedFile } from "@/lib/custom-jersey/types";
import { formatMoney, resolveLocale } from "@/i18n";

/**
 * The customer's side of one custom order. The token in the URL is the
 * key: 64 random hex characters that only the customer's link carries.
 *
 * GET   the order, its mockups, messages, payments and progress
 * POST  { action }
 *         comment            { body }
 *         resubmit           { notes?, files? }   after "changes needed"
 *         request_revision   { body }             ask for a change to the mockup
 *         approve            { accept_terms: true, gallery_consent? }
 *         cancel                                  only before approving
 *         pay                                     start an online payment for what is due
 */

const TOKEN = /^[0-9a-f]{64}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function respond(order: OrderRow) {
  const fresh = (await findOrder({ id: order.id })) ?? order;
  const detail = await loadDetail(fresh, "customer");
  const pricing = await loadPricing();
  return NextResponse.json({
    order: detail,
    due: dueFor(fresh, detail.paid_total),
    free_revisions: pricing.free_revisions,
    advance_percent: pricing.advance_percent,
    online_payment: isOnlinePaymentAvailable(),
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token) || !isServiceSupabaseConfigured()) return bad("Not found", 404);
  try {
    const order = await findOrder({ token });
    if (!order) return bad("Not found", 404);
    return await respond(order);
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Could not load", 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token) || !isServiceSupabaseConfigured()) return bad("Not found", 404);
  const limit = checkRateLimit(request, "customAction");
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid request");
  }

  try {
    const order = await findOrder({ token });
    if (!order) return bad("Not found", 404);
    const db = getServiceSupabase();
    const body = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
    const customer = { kind: "customer" as const };
    const stale = () => bad("This order has changed. Reload the page.", 409);

    switch (b.action) {
      case "comment": {
        if (!body) return bad("Write a message first");
        const { error } = await db.from("custom_order_messages").insert({ custom_order_id: order.id, author: "customer", body });
        if (error) return bad(error.message, 500);
        break;
      }

      case "resubmit": {
        if (order.status !== "changes_needed") return stale();
        const files: UploadedFile[] = [...order.files];
        for (const f of Array.isArray(b.files) ? b.files.slice(0, 10) : []) {
          const file = f as Partial<UploadedFile>;
          if (!isDesignPath(file.path) || files.some((x) => x.path === file.path)) continue;
          files.push({ path: file.path, name: String(file.name ?? "file").slice(0, 120), mime: String(file.mime ?? ""), size: Number(file.size) || 0, kind: "design" });
        }
        const patch: Record<string, unknown> = { files: files.slice(0, 20) };
        if (typeof b.notes === "string" && b.notes.trim()) patch.notes = b.notes.trim().slice(0, 4000);
        if (!(await moveOrder(order, "in_review", customer, { reason: null, patch }))) return stale();
        if (body) await db.from("custom_order_messages").insert({ custom_order_id: order.id, author: "customer", body });
        break;
      }

      case "request_revision": {
        if (order.status !== "mockup_sent") return stale();
        if (body.length < 3) return bad("Tell us what to change");
        if (!(await moveOrder(order, "revision_requested", customer, { reason: null, patch: { revision_count: order.revision_count + 1 } }))) return stale();
        await db.from("custom_order_messages").insert({ custom_order_id: order.id, author: "customer", body });
        break;
      }

      case "approve": {
        if (order.status !== "mockup_sent") return stale();
        if (order.final_price === null) return bad("The final price has not been set yet");
        // The rule is shown next to the button; without the tick there is no approval.
        if (b.accept_terms !== true) return bad("Please tick the box to accept that a confirmed order cannot be cancelled or refunded");
        const pricing = await loadPricing();
        const now = new Date().toISOString();
        const advance = advanceFor(orderTotal(order), pricing);
        const moved = await moveOrder(order, "approved", customer, {
          reason: null,
          note: "Design confirmed; accepted no cancellation or refund after confirming",
          patch: { approved_at: now, terms_accepted_at: now, advance_amount: advance, gallery_consent: b.gallery_consent === true },
        });
        if (!moved) return stale();
        await notifyCustomOrder(order, "custom_approved", { amount: formatMoney(advance, resolveLocale(order.locale)) });
        break;
      }

      case "cancel": {
        // After confirming, printing has started: no cancellation (roadmap 3.4).
        if (!BEFORE_APPROVAL.includes(order.status)) return bad("A confirmed order cannot be cancelled", 409);
        if (!(await moveOrder(order, "cancelled", customer, { reason: body || "Cancelled by the customer" }))) return stale();
        break;
      }

      case "pay": {
        if (["rejected", "cancelled"].includes(order.status) || BEFORE_APPROVAL.includes(order.status)) return bad("Nothing is due on this order yet", 409);
        const due = dueFor(order, await paidTotal(order.id));
        if (!(due.payable > 0)) return bad("Nothing is due on this order", 409);
        const started = await startCustomPayment(order);
        return NextResponse.json({ checkout_url: started.checkoutUrl, payment_id: started.paymentId, amount: started.amount });
      }

      default:
        return bad("Unknown action");
    }
    return await respond(order);
  } catch (err) {
    console.error("custom order action failed:", err);
    return bad(err instanceof Error ? err.message : "Something went wrong", 500);
  }
}
