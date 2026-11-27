import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { failed } from "@/lib/pos/http";
import { dhakaDayKey } from "@/lib/admin/overview";
import { buildReport, daysBetween, pickGroup } from "@/lib/admin/report";

/**
 * GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|month|year
 * The owner's business report: sales, cost, profit, spendings, supplier
 * purchases (lib/admin/report.ts). Bangladesh days, both ends included.
 * Default: this month. At most ~5 years. Needs "reports.financial".
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 5 * 366;

export async function GET(req: NextRequest) {
  try {
    const { user: actor } = await requirePermission("reports.financial");
    const db = getServiceSupabase(actor);
    const today = dhakaDayKey(new Date());
    let from = req.nextUrl.searchParams.get("from") ?? "";
    let to = req.nextUrl.searchParams.get("to") ?? "";
    if (!DAY_RE.test(to) || Number.isNaN(Date.parse(to)) || to > today) to = today;
    if (!DAY_RE.test(from) || Number.isNaN(Date.parse(from))) from = `${to.slice(0, 7)}-01`;
    if (from > to) from = to;
    if (daysBetween(from, to) > MAX_DAYS) from = new Date(Date.parse(`${to}T00:00:00Z`) - (MAX_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
    const group = pickGroup(from, to, req.nextUrl.searchParams.get("group"));
    return NextResponse.json(await buildReport(db, from, to, group));
  } catch (error) {
    return failed(error);
  }
}
