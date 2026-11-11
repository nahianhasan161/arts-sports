import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/admin/auth";
import { consume } from "@/lib/rate-limit";
import { putObject, publicUrlFor, isStorageConfigured } from "@/lib/media/storage";
import { sniffImage } from "@/lib/media/validate";

/**
 * POST /api/reviews/photo (multipart, field "file")
 * A signed-in shopper uploads one review photo (max 5 MB). The picture is
 * only shown after staff approve the review it is attached to.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const limit = consume("reviewUpload", user.id);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many uploads. Try again in a minute." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    }

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Photo is over 5 MB" }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniff = sniffImage(buffer);
    if (!sniff.ok || !sniff.mime || !sniff.ext) {
      return NextResponse.json({ error: sniff.reason ?? "Unsupported image format" }, { status: 400 });
    }
    if (!isStorageConfigured()) return NextResponse.json({ error: "Photo upload is not available right now" }, { status: 503 });

    const path = `review-photos/${crypto.randomUUID()}.${sniff.ext}`;
    const result = await putObject(path, buffer, sniff.mime);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });
    return NextResponse.json({ url: publicUrlFor(path) });
  } catch (error) {
    return handleAuthError(error);
  }
}
