import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { normalizeBdPhone } from "@/lib/phone";
import { resolveLocale, LOCALE_COOKIE } from "@/i18n";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { estimate } from "@/lib/custom-jersey/pricing";
import { isDesignPath, isPreviewPath } from "@/lib/custom-jersey/files";
import { explainDbError, loadConfig, notifyCustomOrder, findOrder } from "@/lib/custom-jersey/server";
import { MAX_ROSTER } from "@/lib/custom-jersey/roster";
import { PATTERNS, SPORTS, type Collar, type RosterRow, type Sleeve, type UploadedFile } from "@/lib/custom-jersey/types";

/**
 * POST /api/custom-jersey/orders   submit a custom jersey request
 * GET  /api/custom-jersey/orders   the signed-in customer's own requests
 *
 * No account is needed to submit: the phone number identifies the customer,
 * as at checkout, and the response carries the private link to the order.
 * The estimate is worked out again here from the stored price table.
 */

async function sessionUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient({ getAll: () => cookieStore.getAll(), setAll: () => {} });
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null;
  } catch {
    return null;
  }
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(request, "customSubmit");
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  if (!isServiceSupabaseConfigured()) return bad("Custom orders are not available right now", 503);

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid request");
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if ((await verifyTurnstile(text(b.turnstile_token, 4000) || null, ip)) === "failed") {
    return bad("Security check failed. Reload the page and try again.", 403);
  }

  const name = text(b.customer_name, 120);
  const phone = normalizeBdPhone(text(b.customer_phone, 30));
  const email = text(b.customer_email, 200) || null;
  if (name.length < 2) return bad("Please give your name");
  if (!phone) return bad("Please give a valid mobile number (01XXXXXXXXX)");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email address does not look right");

  const source = b.source === "template" ? "template" : "upload";
  const sport = SPORTS.find((s) => s === b.sport);
  if (!sport) return bad("Choose a sport");
  const sleeve: Sleeve = b.sleeve === "full" ? "full" : "short";
  const collar: Collar = b.collar === "v" || b.collar === "polo" ? b.collar : "round";

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Could not load prices", 503);
  }
  const fabric = config.fabrics.find((f) => f.id === b.fabric_id);
  if (!fabric) return bad("Choose a fabric");

  // Files: only paths this site generated are accepted.
  const files: UploadedFile[] = [];
  for (const f of Array.isArray(b.files) ? b.files.slice(0, 10) : []) {
    const file = f as Partial<UploadedFile>;
    if (!isDesignPath(file.path)) continue;
    files.push({
      path: file.path,
      name: text(file.name, 120) || "file",
      mime: text(file.mime, 80),
      size: Number(file.size) || 0,
      kind: file.kind === "reference" ? "reference" : "design",
    });
  }
  const notes = text(b.notes, 4000) || null;

  let templateId: string | null = null;
  let design: Record<string, unknown> = {};
  if (source === "template") {
    const template = config.templates.find((t) => t.id === b.template_id);
    if (!template) return bad("Choose a design");
    templateId = template.id;
    const d = (b.design ?? {}) as Record<string, unknown>;
    const colors = (Array.isArray(d.colors) ? d.colors : []).filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3);
    design = {
      pattern: PATTERNS.includes(template.pattern) ? template.pattern : "plain",
      colors: colors.length === 3 ? colors : template.default_colors,
      team_name: text(d.team_name, 24),
      name: text(d.name, 14),
      number: text(d.number, 3),
      logo_path: isPreviewPath(d.logo_path) ? d.logo_path : null,
      preview_path: isPreviewPath(d.preview_path) ? d.preview_path : null,
    };
  } else if (files.length === 0 && !notes) {
    return bad("Upload your design, or describe what you want");
  }

  const roster: RosterRow[] = [];
  for (const r of Array.isArray(b.roster) ? b.roster.slice(0, MAX_ROSTER) : []) {
    const row = r as Partial<RosterRow>;
    const size = text(row.size, 12).toUpperCase();
    if (!size) continue;
    roster.push({
      player_name: text(row.player_name, 40),
      player_number: text(row.player_number, 4),
      size,
      sleeve: row.sleeve === "full" ? "full" : row.sleeve === "short" ? "short" : sleeve,
    });
  }

  const quantity = roster.length || Math.floor(Number(b.quantity));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 2000) return bad("Quantity must be between 1 and 2000");

  const neededBy = /^\d{4}-\d{2}-\d{2}$/.test(text(b.needed_by, 10)) ? text(b.needed_by, 10) : null;
  const withNames = b.with_names === true;
  const withNumbers = b.with_numbers === true;
  const result = estimate(
    {
      fabricPrice: fabric.price_per_piece,
      quantity,
      sleeve,
      collar,
      withShorts: b.with_shorts === true,
      withNames,
      withNumbers,
      withLogo: b.with_logo === true,
      roster: roster.length ? roster : undefined,
      neededBy,
    },
    config.pricing
  );
  if (result.tooSoon) return bad(`We cannot make it that fast. The earliest is ${config.pricing.rush.min_days} days from today.`);

  const pickup = b.delivery_method === "pickup";
  const zone = pickup ? null : b.delivery_zone === "dhaka" ? "dhaka" : "outside";
  const address = pickup ? null : text(b.delivery_address, 500);
  if (!pickup && (address ?? "").length < 5) return bad("Please give the delivery address");

  const user = await sessionUser();
  const cookieStore = await cookies();
  const locale = resolveLocale(b.locale ?? cookieStore.get(LOCALE_COOKIE)?.value);

  const db = getServiceSupabase();
  const { data: customerId } = await db.rpc("upsert_customer", {
    p_phone: phone,
    p_name: name,
    p_email: email,
    p_user_id: user?.id ?? null,
    p_channel: "online",
  });

  const { data: created, error } = await db
    .from("custom_orders")
    .insert({
      user_id: user?.id ?? null,
      customer_id: typeof customerId === "string" ? customerId : null,
      customer_name: name,
      customer_phone: phone,
      customer_email: email ?? user?.email ?? null,
      locale,
      source,
      sport,
      template_id: templateId,
      design,
      files,
      notes,
      fabric_id: fabric.id,
      fabric_name: fabric.name_en,
      sleeve,
      collar,
      with_shorts: b.with_shorts === true,
      with_names: withNames,
      with_numbers: withNumbers,
      with_logo: b.with_logo === true,
      quantity: result.quantity,
      needed_by: neededBy,
      is_rush: result.isRush,
      delivery_method: pickup ? "pickup" : "delivery",
      delivery_zone: zone,
      delivery_address: address,
      delivery_charge: pickup ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside,
      estimated_price: result.total,
      estimate_breakdown: { ...result, fabric_price: fabric.price_per_piece },
      gallery_consent: b.gallery_consent === true,
    })
    .select("id")
    .single();
  if (error || !created) return bad(explainDbError(error?.message ?? "Could not save the request"), 500);

  if (roster.length) {
    const { error: rosterError } = await db
      .from("custom_order_roster")
      .insert(roster.map((r, position) => ({ custom_order_id: created.id, position, ...r, player_name: r.player_name || null, player_number: r.player_number || null })));
    if (rosterError) console.error("Could not save the roster:", rosterError.message);
  }
  await db.from("custom_order_events").insert({ custom_order_id: created.id, to_status: "submitted", actor: "customer", actor_id: user?.id ?? null });

  const order = await findOrder({ id: created.id });
  if (!order) return bad("Could not load the saved request", 500);
  await notifyCustomOrder(order, "custom_submitted");

  return NextResponse.json({ order_number: order.order_number, token: order.access_token, estimated_price: result.total });
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isServiceSupabaseConfigured()) return NextResponse.json({ orders: [] });
  const { data, error } = await getServiceSupabase()
    .from("custom_orders")
    .select("order_number, access_token, status, sport, quantity, estimated_price, final_price, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  // Before the migration is applied there is simply nothing to list.
  if (error) return NextResponse.json({ orders: [] });
  return NextResponse.json({ orders: data ?? [] });
}
