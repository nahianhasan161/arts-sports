import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { explainPosError, listShowrooms, numericSetting, staffNames } from "@/lib/pos/server";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET  /api/admin/pos/session   my open cash drawer, what should be in it,
 *                               and (with pos.manage) the recent days of everyone
 * POST /api/admin/pos/session   { action: "open", showroom_id, opening_float }
 *                               { action: "close", counted_cash, note }
 *                               { action: "cash_move", amount, reason }
 */
export async function GET() {
  try {
    const { user, supabase } = await requirePermission("pos.use");
    const db = getServiceSupabase();
    const { data: canManage } = await supabase.rpc("has_permission", { p_code: "pos.manage" });

    const [showrooms, open, maxDiscount] = await Promise.all([
      listShowrooms(db),
      db.from("pos_sessions").select("*").eq("opened_by", user.id).eq("status", "open").maybeSingle(),
      numericSetting(db, "pos_max_discount_percent", 10),
    ]);
    if (open.error) return bad(explainPosError(open.error.message), 500);

    let summary = null;
    let moves: unknown[] = [];
    if (open.data) {
      const [s, m] = await Promise.all([
        db.rpc("pos_session_summary", { p_session_id: open.data.id }),
        db.from("pos_cash_moves").select("id, amount, reason, created_at").eq("session_id", open.data.id).order("created_at"),
      ]);
      summary = s.data ?? null;
      moves = m.data ?? [];
    }

    let history = db.from("pos_sessions").select("*").eq("status", "closed").order("closed_at", { ascending: false }).limit(30);
    if (canManage !== true) history = history.eq("opened_by", user.id);
    const { data: closed } = await history;
    const names = await staffNames(db, (closed ?? []).map((c) => c.opened_by));

    return NextResponse.json({
      showrooms,
      session: open.data ?? null,
      summary,
      moves,
      history: (closed ?? []).map((c) => ({ ...c, staff: names.get(c.opened_by) ?? "Staff" })),
      can_manage: canManage === true,
      max_discount_percent: maxDiscount,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("pos.use");
    const db = getServiceSupabase();
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const { data: open } = await db.from("pos_sessions").select("id").eq("opened_by", user.id).eq("status", "open").maybeSingle();

    if (b.action === "open") {
      if (open) return bad("Your drawer is already open");
      const float = Number(b.opening_float ?? 0);
      if (!Number.isFinite(float) || float < 0) return bad("Enter the cash you are starting with");
      const showrooms = await listShowrooms(db);
      const showroom = showrooms.find((s) => s.id === b.showroom_id) ?? showrooms[0];
      if (!showroom) return bad("No shop is set up. Add a showroom first.");
      const { error } = await db.from("pos_sessions").insert({ showroom_id: showroom.id, opened_by: user.id, opening_float: float });
      if (error) return bad(explainPosError(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (!open) return bad("Open the cash drawer first");

    if (b.action === "cash_move") {
      const amount = Number(b.amount);
      const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "";
      if (!Number.isFinite(amount) || amount === 0) return bad("Enter the amount");
      if (!reason) return bad("Write what the cash was for");
      const { error } = await db.from("pos_cash_moves").insert({ session_id: open.id, amount, reason, created_by: user.id });
      if (error) return bad(explainPosError(error.message), 500);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "close") {
      const counted = Number(b.counted_cash);
      if (b.counted_cash === "" || b.counted_cash === null || !Number.isFinite(counted) || counted < 0) return bad("Count the cash and enter the amount");
      const { data, error } = await db.rpc("pos_close_session", {
        p_session_id: open.id,
        p_actor: user.id,
        p_counted: counted,
        p_note: typeof b.note === "string" ? b.note.slice(0, 500) : null,
      });
      if (error) return bad(explainPosError(error.message), 400);
      return NextResponse.json({ ok: true, summary: data });
    }

    return bad("Unknown action");
  } catch (error) {
    return handleAdminError(error);
  }
}
