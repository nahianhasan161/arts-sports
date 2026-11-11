import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consume } from "@/lib/rate-limit";
import { publicBaseUrl } from "@/lib/media/storage";

/**
 * POST /api/reviews { product_id, rating, title?, body, photos?: string[] }
 * Only someone with a delivered order for the product can review it (the
 * submit_review function checks). The review waits for staff approval.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: () => {},
  });
  if (!supabase) return NextResponse.json({ error: "Service not configured" }, { status: 500 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to write a review." }, { status: 401 });

  const limit = consume("reviewSubmit", user.id);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    product_id?: string;
    rating?: number;
    title?: string;
    body?: string;
    photos?: string[];
  };
  const rating = Number(body.rating);
  if (!body.product_id || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  if (text.length < 3 || text.length > 3000) {
    return NextResponse.json({ error: "Write a few words about the product." }, { status: 400 });
  }
  // Only pictures uploaded through /api/reviews/photo.
  const base = publicBaseUrl();
  const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, 4);
  if (photos.some((p) => typeof p !== "string" || !p.startsWith(base) || !p.includes("/review-photos/"))) {
    return NextResponse.json({ error: "Invalid photo." }, { status: 400 });
  }

  const { error } = await supabase.rpc("submit_review", {
    p_product_id: body.product_id,
    p_rating: rating,
    p_title: body.title ?? null,
    p_body: text,
    p_photos: photos,
  });
  if (error) {
    if (error.message.includes("not_a_buyer")) {
      return NextResponse.json({ error: "Only customers who received this product can review it." }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not save your review." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: "Thank you! Your review will appear after we check it." });
}
