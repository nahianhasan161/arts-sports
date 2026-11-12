import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/custom-jersey/server";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";

/**
 * GET /api/custom-jersey/config
 * Active fabrics, design templates, the pricing table and delivery fees:
 * everything the order form needs to show a live estimate.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isServiceSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  try {
    return NextResponse.json(await loadConfig(), { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load" }, { status: 503 });
  }
}
