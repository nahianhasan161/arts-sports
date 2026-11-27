import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { POS_METHODS, explainPosError, staffNames } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * GET  /api/admin/pos/sales/<id or receipt no>   one sale, for the receipt and the return screen
 * POST /api/admin/pos/sales/<id>                 { items: [{ sale_item_id, quantity }], refund_method, reason, restock, refund_amount? }
 *                                                refund_amount = give back less than the full value (0 .. full); left out = full
 *                                                take goods back (pos.manage)
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: actor } = await requirePermission("pos.use");
    const { id } = await params;
    const db = getServiceSupabase(actor);
    const query = db.from("pos_sales").select("*");
    const { data: sale, error } = await (/^R-\d+$/i.test(id) ? query.eq("receipt_no", id.toUpperCase()) : query.eq("id", id)).maybeSingle();
    if (error) return bad(explainPosError(error.message), 500);
    if (!sale) return bad("Sale not found", 404);

    const [items, payments, returns, showroom] = await Promise.all([
      db.from("pos_sale_items").select("*").eq("sale_id", sale.id).order("id"),
      db.from("pos_payments").select("id, type, method, amount, reference, created_at").eq("sale_id", sale.id).order("created_at"),
      db.from("pos_returns").select("id, reason, refund_amount, refund_method, items, created_at").eq("sale_id", sale.id).order("created_at"),
      db.from("showrooms").select("name, address").eq("id", sale.showroom_id).maybeSingle(),
    ]);
    const names = await staffNames(db, [sale.sold_by]);
    return NextResponse.json({
      sale: { ...sale, staff: sale.sold_by ? names.get(sale.sold_by) ?? "Staff" : "" },
      items: items.data ?? [],
      payments: payments.data ?? [],
      returns: returns.data ?? [],
      showroom: showroom.data ?? null,
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("pos.manage");
    const { id } = await params;
    const db = getServiceSupabase(user);
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const method = String(b.refund_method ?? "cash");
    if (!(POS_METHODS as readonly string[]).includes(method)) return bad("Choose how the money goes back");
    const items = (Array.isArray(b.items) ? b.items : [])
      .map((raw) => {
        const i = raw as Record<string, unknown>;
        return { sale_item_id: String(i.sale_item_id ?? ""), quantity: Math.floor(Number(i.quantity) || 0) };
      })
      .filter((i) => i.sale_item_id && i.quantity > 0);
    if (!items.length) return bad("Choose what is coming back");

    // Optional part refund. The database checks it is not more than the full value.
    const rawAmount = b.refund_amount;
    const amount = rawAmount === undefined || rawAmount === null || rawAmount === "" ? null : Math.round(Number(rawAmount) * 100) / 100;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return bad("Enter the amount to give back");
    if (amount !== null) {
      // The older pos_return_sale ignores refund_amount and pays in full; refuse until 20261128110000 is applied.
      const probe = await db.from("pos_returns").select("full_amount").limit(0);
      if (probe.error) return bad("Part refunds need the latest database update (20261128110000). Ask the admin to apply it.", 400);
    }

    const { data: session } = await db.from("pos_sessions").select("id").eq("opened_by", user.id).eq("status", "open").maybeSingle();
    if (method === "cash" && amount !== 0 && !session) return bad("Open your cash drawer first: the refund comes out of it");

    const { data, error } = await db.rpc("pos_return_sale", {
      p: {
        actor: user.id,
        sale_id: id,
        session_id: session?.id ?? "",
        refund_method: method,
        reason: typeof b.reason === "string" ? b.reason.slice(0, 300) : "",
        restock: b.restock !== false,
        items,
        ...(amount !== null ? { refund_amount: amount } : {}),
      },
    });
    if (error) return bad(explainPosError(error.message), 400);
    return NextResponse.json(data);
  } catch (error) {
    return failed(error);
  }
}
