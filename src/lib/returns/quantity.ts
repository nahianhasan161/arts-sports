import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The shared rule for how much of an order line may still be returned.
 *
 * Both the customer route (/api/returns) and the admin route
 * (/api/admin/returns) need it, and they must reach the same answer -- an admin
 * approving a return that the customer's own request would have been refused
 * for is confusing, and two copies of the arithmetic eventually disagree.
 *
 * The refund guard on refund_items is still authoritative: it runs against live
 * rows inside the refund transaction, after both of these have passed. This
 * function exists so an impossible request is refused when it is made rather
 * than when the money is about to move.
 */
export interface ReturnQuantityCheck {
  ok: boolean
  status: number
  error?: string
  reason?: string
  detail?: string
}

export async function checkReturnableQuantity(
  supabase: SupabaseClient,
  orderId: string,
  requested: { order_item_id: string; quantity: number }[]
): Promise<ReturnQuantityCheck> {
  for (const item of requested) {
    const qty = Number(item?.quantity);

    if (!item?.order_item_id) {
      return { ok: false, status: 400, error: "Each return item needs an order_item_id." };
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return {
        ok: false,
        status: 400,
        error: "Each return item needs a positive integer quantity.",
      };
    }

    const { data: orderItem, error: itemError } = await supabase
      .from("order_items")
      .select("id, quantity")
      .eq("id", item.order_item_id)
      .eq("order_id", orderId)
      .maybeSingle();

    if (itemError) {
      return { ok: false, status: 500, error: itemError.message };
    }
    if (!orderItem) {
      return {
        ok: false,
        status: 404,
        error: `Item ${item.order_item_id} is not on this order.`,
        reason: "order_item_not_found",
      };
    }

    // Already on its way back, from a request that has not been rejected or
    // cancelled. A cancelled return frees the quantity again, so those are
    // excluded rather than counted.
    const { data: existing, error: existingError } = await supabase
      .from("return_items")
      .select("quantity, returns!inner(status)")
      .eq("order_item_id", item.order_item_id);

    if (existingError) {
      return { ok: false, status: 500, error: existingError.message };
    }

    const taken = (existing ?? []).reduce((sum, row) => {
      const status = (row as { returns?: { status?: string } }).returns?.status;
      if (status === "rejected" || status === "cancelled") return sum;
      return sum + Number(row.quantity ?? 0);
    }, 0);

    const available = Number(orderItem.quantity) - taken;

    if (qty > available) {
      return {
        ok: false,
        status: 409,
        error:
          available <= 0
            ? "Every unit of this item is already being returned."
            : `You can return at most ${available} more of this item.`,
        reason: "return_quantity_exceeds_ordered",
        detail: `ordered ${orderItem.quantity}, already returning ${taken}, requested ${qty}`,
      };
    }
  }

  return { ok: true, status: 200 };
}
