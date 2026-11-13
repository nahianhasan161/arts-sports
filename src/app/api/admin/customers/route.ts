import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normalizeBdPhone } from "@/lib/phone";
import { notify } from "@/lib/notifications";
import { providers } from "@/lib/notifications/providers";
import { resolveLocale } from "@/i18n";
import { explainPosError, toCsv } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

const SEGMENTS = ["all", "inactive_90", "new_30", "shop", "online", "team", "vip", "consented", "blacklisted"] as const;
type Segment = (typeof SEGMENTS)[number];

interface Stats {
  customer_id: string;
  online_orders: number;
  online_spent: number;
  shop_sales: number;
  shop_spent: number;
  custom_orders: number;
  custom_spent: number;
  total_spent: number;
  last_purchase_at: string | null;
}

interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  marketing_consent: boolean;
  marketing_opt_out: boolean;
  is_blacklisted: boolean;
  first_seen_channel: string;
  preferred_locale?: string | null;
  created_at: string;
}

const DAY = 86400000;

/** Customers matching the filters, with their totals. Capped at 5,000 rows. */
async function findCustomers(params: URLSearchParams) {
  const db = getServiceSupabase();
  const segment = (SEGMENTS as readonly string[]).includes(params.get("segment") ?? "") ? (params.get("segment") as Segment) : "all";
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  const tag = (params.get("tag") ?? "").trim().slice(0, 40);
  const bought = (params.get("bought") ?? "").trim().slice(0, 60);

  let query = db.from("customers").select("*").order("created_at", { ascending: false }).limit(5000);
  if (q) {
    const phone = normalizeBdPhone(q);
    const safe = q.replace(/[%,()]/g, "");
    query = phone ? query.eq("phone", phone) : query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  if (tag) query = query.contains("tags", [tag]);
  if (segment === "vip") query = query.contains("tags", ["VIP"]);
  if (segment === "consented") query = query.eq("marketing_consent", true).eq("marketing_opt_out", false);
  if (segment === "blacklisted") query = query.eq("is_blacklisted", true);
  if (segment === "new_30") query = query.gte("created_at", new Date(Date.now() - 30 * DAY).toISOString());

  // "Bought an Argentina jersey": anyone with a matching line online or in the shop.
  if (bought) {
    const like = `%${bought.replace(/[%,()]/g, " ").trim()}%`;
    const [online, shop] = await Promise.all([
      db.from("order_items").select("orders!inner(customer_id)").ilike("title", like).limit(3000),
      db.from("pos_sale_items").select("pos_sales!inner(customer_id)").ilike("title", like).limit(3000),
    ]);
    const ids = new Set<string>();
    for (const r of (online.data ?? []) as unknown as { orders: { customer_id: string | null } | { customer_id: string | null }[] }[]) {
      for (const o of Array.isArray(r.orders) ? r.orders : [r.orders]) if (o?.customer_id) ids.add(o.customer_id);
    }
    for (const r of (shop.data ?? []) as unknown as { pos_sales: { customer_id: string | null } | { customer_id: string | null }[] }[]) {
      for (const s of Array.isArray(r.pos_sales) ? r.pos_sales : [r.pos_sales]) if (s?.customer_id) ids.add(s.customer_id);
    }
    if (!ids.size) return { rows: [], segment };
    query = query.in("id", [...ids].slice(0, 500));
  }

  const { data: customers, error } = await query;
  if (error) throw new Error(error.message);

  const stats = new Map<string, Stats>();
  const { data: all, error: statsError } = await db.from("customer_stats").select("*").limit(20000);
  if (statsError) throw new Error(statsError.message);
  for (const s of (all ?? []) as Stats[]) stats.set(s.customer_id, s);

  let rows = ((customers ?? []) as Customer[]).map((c) => {
    const s = stats.get(c.id);
    return {
      ...c,
      online_orders: Number(s?.online_orders ?? 0),
      shop_sales: Number(s?.shop_sales ?? 0),
      custom_orders: Number(s?.custom_orders ?? 0),
      total_spent: Number(s?.total_spent ?? 0),
      last_purchase_at: s?.last_purchase_at ?? null,
    };
  });
  if (segment === "inactive_90") rows = rows.filter((r) => r.last_purchase_at && Date.parse(r.last_purchase_at) < Date.now() - 90 * DAY);
  if (segment === "shop") rows = rows.filter((r) => r.shop_sales > 0);
  if (segment === "online") rows = rows.filter((r) => r.online_orders > 0);
  if (segment === "team") rows = rows.filter((r) => r.custom_orders > 0);
  return { rows, segment };
}

/**
 * GET  /api/admin/customers?q=&segment=&tag=&bought=&format=csv
 * POST /api/admin/customers   { action: "message", text, filters }  SMS to everyone in
 *      the filtered list who agreed to promotional messages (marketing.manage)
 */
export async function GET(request: Request) {
  try {
    await requirePermission("customers.view");
    const params = new URL(request.url).searchParams;
    const { rows } = await findCustomers(params);

    if (params.get("format") === "csv") {
      const csv = toCsv([
        ["Name", "Phone", "Email", "Tags", "Online orders", "Shop sales", "Custom orders", "Total spent", "Last purchase", "Promo messages", "First seen", "Since"],
        ...rows.map((r) => [r.name, r.phone, r.email, r.tags.join("; "), r.online_orders, r.shop_sales, r.custom_orders, r.total_spent, r.last_purchase_at?.slice(0, 10), r.marketing_consent && !r.marketing_opt_out ? "yes" : "no", r.first_seen_channel, r.created_at.slice(0, 10)]),
      ]);
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"` } });
    }

    const tags = [...new Set(rows.flatMap((r) => r.tags))].sort();
    return NextResponse.json({ customers: rows.slice(0, 500), total: rows.length, tags, sms_ready: providers.sms.isConfigured() });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("marketing.manage");
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action !== "message") return bad("Unknown action");
    const text = typeof b.text === "string" ? b.text.trim().slice(0, 600) : "";
    if (text.length < 5) return bad("Write the message first");
    if (!providers.sms.isConfigured()) return bad("No SMS gateway is connected yet, so nothing can be sent. Use the WhatsApp button on a customer instead.");

    const filters = new URLSearchParams(typeof b.filters === "string" ? b.filters : "");
    const { rows } = await findCustomers(filters);
    // Promotional messages only with consent, and never after "stop".
    const targets = rows.filter((r) => r.marketing_consent && !r.marketing_opt_out && !r.is_blacklisted).slice(0, 2000);
    if (!targets.length) return bad("Nobody in this list has agreed to promotional messages");

    let sent = 0;
    let failedCount = 0;
    for (const c of targets) {
      const outcome = await notify({ template: "promo", locale: resolveLocale(c.preferred_locale ?? "bn"), to: { phone: c.phone }, vars: { name: c.name ?? "", text }, channels: ["sms"], customerId: c.id });
      if (outcome[0]?.result.status === "sent") sent++;
      else failedCount++;
    }
    return NextResponse.json({ ok: true, sent, failed: failedCount, skipped_no_consent: rows.length - targets.length });
  } catch (error) {
    if (error instanceof Error && /customer_stats|marketing_opt_out/.test(error.message)) return bad(explainPosError(error.message), 500);
    return failed(error);
  }
}
