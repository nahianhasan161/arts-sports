import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * GET /api/admin/audit-log?entity_type=orders&entity_id=...&actor=<email>&before=<id>
 *
 * Newest first, 50 per page. `before` is the smallest id from the previous
 * page (keyset pagination, so a busy log does not shift pages under you).
 */
const PAGE = 50;

export async function GET(request: Request) {
  try {
    const { supabase } = await requirePermission("audit.view");
    const params = new URL(request.url).searchParams;

    let query = supabase
      .from("audit_log")
      .select("id, occurred_at, actor_id, actor_email, actor_kind, action, entity_type, entity_id, changes")
      .order("id", { ascending: false })
      .limit(PAGE);

    const entityType = params.get("entity_type");
    const entityId = params.get("entity_id");
    const actor = params.get("actor");
    const before = Number(params.get("before"));
    if (entityType) query = query.eq("entity_type", entityType);
    if (entityId) query = query.eq("entity_id", entityId);
    if (actor) query = query.ilike("actor_email", `%${actor.replace(/[%_]/g, "")}%`);
    if (Number.isFinite(before) && before > 0) query = query.lt("id", before);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      entries: data ?? [],
      next_before: data && data.length === PAGE ? data[data.length - 1].id : null,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
