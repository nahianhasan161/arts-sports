import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { putObject, publicUrlFor, isStorageConfigured } from "@/lib/media/storage";
import { sniffImage } from "@/lib/media/validate";
import { sniffDesignFile, MAX_DESIGN_BYTES, MAX_IMAGE_BYTES } from "@/lib/custom-jersey/files";
import { requirePermission } from "@/lib/auth/permissions";
import { handleAdminError } from "@/lib/admin/auth";

/**
 * POST /api/custom-jersey/upload (multipart: file, kind)
 *
 *   design | reference   the customer's artwork: image, PDF or AI/EPS, up to 15 MB.
 *                        Stored privately; only staff and the order's owner can open it.
 *   logo | preview       images used by the design preview, up to 5 MB.
 *   mockup | gallery     staff only (custom_orders.manage).
 *
 * No sign-in is needed for the customer kinds, as with checkout. The file
 * is checked by its bytes, not its name, and the stored name is a new UUID.
 */
export const runtime = "nodejs";

const CUSTOMER_KINDS = ["design", "reference", "logo", "preview"];
const STAFF_KINDS = ["mockup", "gallery", "fabric"];

export async function POST(request: NextRequest) {
  try {
    const limit = checkRateLimit(request, "customUpload");
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many uploads. Try again in a minute." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    }
    if (!isStorageConfigured()) return NextResponse.json({ error: "File upload is not available right now" }, { status: 503 });

    const form = await request.formData();
    const kind = String(form.get("kind") ?? "design");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!CUSTOMER_KINDS.includes(kind) && !STAFF_KINDS.includes(kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    if (STAFF_KINDS.includes(kind)) await requirePermission("custom_orders.manage");

    const privateFile = kind === "design" || kind === "reference";
    const max = privateFile ? MAX_DESIGN_BYTES : MAX_IMAGE_BYTES;
    if (file.size > max) return NextResponse.json({ error: `File is over ${Math.round(max / 1024 / 1024)} MB` }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniff = privateFile ? sniffDesignFile(buffer) : sniffImage(buffer);
    if (!sniff.ok || !sniff.mime || !sniff.ext) {
      return NextResponse.json({ error: sniff.reason ?? "Unsupported file" }, { status: 400 });
    }

    const folder = privateFile ? "custom-designs" : kind === "mockup" ? "custom-mockups" : kind === "gallery" ? "custom-gallery" : "custom-previews";
    const path = `${folder}/${crypto.randomUUID()}.${sniff.ext}`;
    const result = await putObject(path, buffer, sniff.mime);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });

    return NextResponse.json({
      path,
      name: file.name.replace(/[^\w.\- ()ঀ-৿]/g, "_").slice(0, 120) || `file.${sniff.ext}`,
      mime: sniff.mime,
      size: file.size,
      kind,
      // Private design files have no public URL; they are read through /api/custom-jersey/file.
      url: privateFile ? null : publicUrlFor(path),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
