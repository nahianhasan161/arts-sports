import { NextRequest, NextResponse } from "next/server";
import { getObjectStream, isStorageConfigured } from "@/lib/media/storage";
import { requirePermission } from "@/lib/auth/permissions";
import { handleAdminError } from "@/lib/admin/auth";
import { findOrder } from "@/lib/custom-jersey/server";
import { isDesignPath } from "@/lib/custom-jersey/files";

/**
 * GET /api/custom-jersey/file?token=<access token>&i=<n>   the order's owner
 * GET /api/custom-jersey/file?id=<order id>&i=<n>          staff (custom_orders.manage)
 *
 * Streams the n-th design file of an order. The path is read from the order
 * row, never from the request, so this cannot be pointed at another object.
 * PDF and AI/EPS files are always sent as a download, never rendered inline.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const id = url.searchParams.get("id");
    const index = Number(url.searchParams.get("i"));
    if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    let order;
    if (token && /^[0-9a-f]{64}$/.test(token)) order = await findOrder({ token });
    else if (id) {
      await requirePermission("custom_orders.manage");
      order = await findOrder({ id });
    }
    const file = order?.files?.[index];
    if (!file || !isDesignPath(file.path)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isStorageConfigured()) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });

    const object = await getObjectStream(file.path);
    if (!object) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const isImage = /^image\/(jpeg|png|webp|avif)$/.test(object.contentType ?? "");
    const filename = file.name.replace(/[^\w.\- ]/g, "_") || "design";
    return new NextResponse(object.body as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": isImage ? object.contentType! : "application/octet-stream",
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        ...(object.contentLength !== null ? { "Content-Length": String(object.contentLength) } : {}),
      },
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
