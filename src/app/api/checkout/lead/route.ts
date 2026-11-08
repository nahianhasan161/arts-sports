import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBdPhone } from "@/lib/phone";
import { getServiceSupabase, isServiceSupabaseConfigured } from "@/lib/supabase/service";

/**
 * POST /api/checkout/lead
 *
 * Saves an unfinished checkout as soon as the phone number is typed, so
 * staff can call people who stopped before paying (Admin -> Leads).
 * One row per checkout session; a lead that already became an order is
 * left alone. The privacy policy says why the number is kept.
 */
const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  if (!isServiceSupabaseConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  if (!checkRateLimit(request as NextRequest, "lead").allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessionId = s(body.session_id, 64);
  const phone = normalizeBdPhone(s(body.phone, 30));
  if (!sessionId || !phone) return NextResponse.json({ ok: false }, { status: 400 });

  const address = (body.address && typeof body.address === "object" ? body.address : {}) as Record<string, unknown>;
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 30).map((raw) => {
        const it = raw as Record<string, unknown>;
        return {
          product_id: s(it.product_id, 64),
          title: s(it.title, 150),
          size: s(it.size, 40),
          color: s(it.color, 40),
          quantity: Math.max(1, Math.min(99, Number(it.quantity) || 1)),
          price: Number(it.price) || 0,
        };
      })
    : [];

  const db = getServiceSupabase();
  const { data: existing } = await db
    .from("checkout_leads")
    .select("id, status")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing?.status === "sold") return NextResponse.json({ ok: true });

  const row = {
    session_id: sessionId,
    phone,
    name: s(body.name, 120) || null,
    email: s(body.email, 160) || null,
    address: {
      division: s(address.division, 60),
      district: s(address.district, 60),
      thana: s(address.thana, 80),
      line: s(address.line, 300),
    },
    items,
    subtotal: Number(body.subtotal) || null,
    attribution: body.attribution && typeof body.attribution === "object" ? body.attribution : {},
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await db.from("checkout_leads").update(row).eq("id", existing.id)
    : await db.from("checkout_leads").insert(row);
  if (error) {
    console.error("Lead could not be saved:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
