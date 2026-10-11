import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  let admin: { user: { id: string; email?: string } };
  try {
    admin = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { elements } = body;

    if (!elements || !Array.isArray(elements)) {
      return NextResponse.json({ error: "elements array is required" }, { status: 400 });
    }

    for (const el of elements) {
      const { error } = await supabase
        .from("site_content")
        .upsert({
          key: el.id,
          selector: el.selector,
          content: el.content,
          updated_by: admin.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) {
        console.error("Error saving content:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const area = searchParams.get("area") || "landing-page";

    const { data, error } = await supabase
      .from("site_content")
      .select("*")
      .eq("area", area)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleAdminError(error);
  }
}
