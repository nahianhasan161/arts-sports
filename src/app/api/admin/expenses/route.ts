import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { bad, failed } from "@/lib/pos/http";
import { dhakaDayKey } from "@/lib/admin/overview";
import { isCategory, isMethod, isMissingTable, isPlace } from "@/lib/admin/expenses";

/**
 * Spendings (table `expenses`, SQL 20261128100000_expenses.sql). The list is
 * read with the business report (GET /api/admin/reports).
 *
 * POST  { spent_on, category, amount, method, place, showroom_id?, note? }  add one
 * PATCH { id, reason }                                                      void one (kept, struck out)
 *
 * Owner / managers: "reports.financial" or "pos.manage".
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_READY = "Spendings are not set up yet: the database update (20261128100000_expenses.sql) has to be applied first.";

export async function POST(request: Request) {
  try {
    const { user: actor } = await requireAnyPermission("reports.financial", "pos.manage");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const today = dhakaDayKey(new Date());
    const spentOn = typeof body.spent_on === "string" && DAY_RE.test(body.spent_on) ? body.spent_on : today;
    if (spentOn > today) return bad("The date cannot be in the future.");
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return bad("Enter an amount above 0.");
    if (!isCategory(body.category)) return bad("Pick what the money was spent on.");
    const method = isMethod(body.method) ? body.method : "cash";
    const place = isPlace(body.place) ? body.place : "both";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (body.category === "other" && !note) return bad("For \"Other\", write what it was for.");
    const showroomId = typeof body.showroom_id === "string" && body.showroom_id ? body.showroom_id : null;

    const db = getServiceSupabase(actor);
    const { data, error } = await db
      .from("expenses")
      .insert({ spent_on: spentOn, category: body.category, amount, method, place, showroom_id: showroomId, note: note || null, created_by: actor.id })
      .select("id")
      .single();
    if (error) return isMissingTable(error) ? bad(NOT_READY, 503) : bad(error.message, 500);
    return NextResponse.json({ id: data.id });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user: actor } = await requireAnyPermission("reports.financial", "pos.manage");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!id) return bad("Which spending?");
    if (!reason) return bad("Write why it is being removed.");
    const db = getServiceSupabase(actor);
    const { data, error } = await db
      .from("expenses")
      .update({ voided_at: new Date().toISOString(), voided_by: actor.id, void_reason: reason })
      .eq("id", id)
      .is("voided_at", null)
      .select("id");
    if (error) return isMissingTable(error) ? bad(NOT_READY, 503) : bad(error.message, 500);
    if (!data?.length) return bad("Not found, or already removed.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
