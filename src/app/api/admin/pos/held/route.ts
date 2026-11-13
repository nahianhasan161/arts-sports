import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError } from "@/lib/pos/server";
import { bad, failed } from "@/lib/pos/http";

/**
 * Bills put aside while another customer is served.
 * GET lists them, POST { label, payload } parks one, DELETE ?id= drops one.
 */
export async function GET() {
  try {
    await requirePermission("pos.use");
    const { data, error } = await getServiceSupabase().from("pos_held_bills").select("id, label, payload, created_at").order("created_at", { ascending: false }).limit(30);
    if (error) return bad(explainPosError(error.message), 500);
    return NextResponse.json({ held: data ?? [] });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("pos.use");
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = b.payload;
    if (!payload || typeof payload !== "object" || JSON.stringify(payload).length > 60000) return bad("Nothing to hold");
    const label = (typeof b.label === "string" && b.label.trim().slice(0, 60)) || new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });
    const { error } = await getServiceSupabase().from("pos_held_bills").insert({ label, payload, created_by: user.id });
    if (error) return bad(explainPosError(error.message), 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermission("pos.use");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return bad("Missing id");
    const { error } = await getServiceSupabase().from("pos_held_bills").delete().eq("id", id);
    if (error) return bad(explainPosError(error.message), 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
