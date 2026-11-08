import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * GET   /api/admin/leads?status=open|new|no_answer|call_later|sold|not_interested|all
 * PATCH /api/admin/leads { id, status?, notes?, next_call_at?, called? }
 *
 * Unfinished checkouts for staff to call. "open" (the default) is every
 * lead not yet sold or closed.
 */
const STATUSES = ["new", "no_answer", "call_later", "sold", "not_interested"] as const;

export async function GET(request: Request) {
  try {
    const { supabase } = await requirePermission("leads.manage");
    const status = new URL(request.url).searchParams.get("status") ?? "open";
    let query = supabase
      .from("checkout_leads")
      .select("id, phone, name, email, address, items, subtotal, attribution, status, next_call_at, notes, call_count, last_called_at, order_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (status === "open") query = query.in("status", ["new", "no_answer", "call_later"]);
    else if ((STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ leads: data ?? [] });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await requirePermission("leads.manage");
    const body = (await request.json()) as {
      id?: string;
      status?: string;
      notes?: string;
      next_call_at?: string | null;
      called?: boolean;
    };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), handled_by: user.id };
    if (body.status) {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: "Unknown status" }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);
    if (body.next_call_at !== undefined) patch.next_call_at = body.next_call_at || null;
    if (body.called) {
      const { data: current } = await supabase.from("checkout_leads").select("call_count").eq("id", body.id).maybeSingle();
      patch.call_count = (current?.call_count ?? 0) + 1;
      patch.last_called_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from("checkout_leads").update(patch).eq("id", body.id).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ lead: data });
  } catch (error) {
    return handleAdminError(error);
  }
}
