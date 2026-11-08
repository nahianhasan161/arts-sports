import { NextResponse } from "next/server";
import { applyParcelUpdate, CourierAuthError, getCourier } from "@/lib/courier";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";

/**
 * POST /api/courier/webhooks/steadfast | pathao
 *
 * Parcel status from the courier. Each adapter checks its own shared secret
 * before anything is read. Set these URLs in the courier panels:
 *   https://<site>/api/courier/webhooks/steadfast
 *   https://<site>/api/courier/webhooks/pathao
 */
export async function POST(request: Request, { params }: { params: Promise<{ courier: string }> }) {
  const { courier: code } = await params;
  const courier = getCourier(code);
  if (!courier) return NextResponse.json({ error: "Unknown courier" }, { status: 404 });
  const replyHeaders = courier.webhookReplyHeaders?.() ?? {};
  if (!isServiceSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503, headers: replyHeaders });
  }

  const raw = await request.text();
  try {
    const update = await courier.parseWebhook(request.headers, raw);
    const result = await applyParcelUpdate(courier.code, update);
    // Pathao expects 202; Steadfast accepts any 2xx.
    return NextResponse.json({ ok: true, ...result }, { status: 202, headers: replyHeaders });
  } catch (err) {
    if (err instanceof CourierAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: replyHeaders });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Body is not JSON" }, { status: 400, headers: replyHeaders });
    }
    console.error(`${code} webhook failed:`, err);
    return NextResponse.json({ error: "Could not process" }, { status: 500, headers: replyHeaders });
  }
}
