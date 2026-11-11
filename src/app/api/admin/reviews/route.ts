import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * GET    /api/admin/reviews?kind=reviews|questions&status=pending|approved|rejected|all
 * PATCH  /api/admin/reviews { kind, id, status?, staff_reply? | answer? }
 * DELETE /api/admin/reviews?kind=...&id=...
 * Moderation of customer reviews and product questions.
 */
const STATUSES = ["pending", "approved", "rejected"];
const table = (kind: string | null) => (kind === "questions" ? "product_questions" : "product_reviews");

export async function GET(request: Request) {
  try {
    await requirePermission("products.manage");
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const status = url.searchParams.get("status") ?? "pending";
    const db = getServiceSupabase();
    let query = db.from(table(kind)).select("*, products(title, slug)").order("created_at", { ascending: false }).limit(200);
    if (STATUSES.includes(status)) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermission("products.manage");
    const b = (await request.json()) as { kind?: string; id?: string; status?: string; staff_reply?: string; answer?: string };
    if (!b.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (b.status) {
      if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
      patch.status = b.status;
      if (b.kind !== "questions") patch.reviewed_at = new Date().toISOString();
    }
    if (b.kind === "questions" && typeof b.answer === "string") {
      const answer = b.answer.trim();
      patch.answer = answer || null;
      patch.answered_at = answer ? new Date().toISOString() : null;
      // Answering a question publishes it.
      if (answer && !b.status) patch.status = "approved";
    }
    if (b.kind !== "questions" && typeof b.staff_reply === "string") patch.staff_reply = b.staff_reply.trim().slice(0, 1000) || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    const { error } = await getServiceSupabase().from(table(b.kind ?? null)).update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermission("products.manage");
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await getServiceSupabase().from(table(url.searchParams.get("kind"))).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
