import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consume } from "@/lib/rate-limit";

/** POST /api/questions { product_id, question } — shown after staff answer it. */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({ getAll: () => cookieStore.getAll(), setAll: () => {} });
  if (!supabase) return NextResponse.json({ error: "Service not configured" }, { status: 500 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to ask a question." }, { status: 401 });
  if (!consume("reviewSubmit", user.id).allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { product_id?: string; question?: string };
  const question = (body.question ?? "").trim();
  if (!body.product_id || question.length < 3 || question.length > 1000) {
    return NextResponse.json({ error: "Write your question (3 to 1000 characters)." }, { status: 400 });
  }
  const { error } = await supabase.rpc("ask_question", { p_product_id: body.product_id, p_question: question });
  if (error) {
    return NextResponse.json(
      { error: error.message.includes("too_many_questions") ? "You have asked a lot of questions. Try again later." : "Could not send your question." },
      { status: error.message.includes("too_many_questions") ? 429 : 500 }
    );
  }
  return NextResponse.json({ ok: true, message: "Thanks! We will answer soon and it will show here." });
}
