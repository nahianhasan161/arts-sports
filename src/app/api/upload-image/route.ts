import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { putObject, publicUrlFor, isStorageConfigured } from "@/lib/media/storage";
import { optimizeImage } from "@/lib/media/optimize";
import { sniffImage } from "@/lib/media/validate";

/**
 * Landing-page image upload, called by the FAB editor.
 *
 * Three writes, in the order that leaves the fewest half-finished states:
 *
 *   1. the bytes go to Tigris as WebP;
 *   2. a media_attachments row is recorded, which is what makes the file
 *      appear in the admin media library;
 *   3. site_content.image_url is upserted, which is what makes the landing
 *      page render the new file after a reload.
 *
 * Step 3 is an upsert rather than an update: the image keys (`hero-image`,
 * `spotlight-image`, ...) have no row until an admin first replaces that
 * image, so an update would match zero rows and silently store nothing.
 * That was why a preview worked in the editor but the picture reverted on
 * the next page load.
 */
export async function POST(request: NextRequest) {
  let admin: { user: { id: string; email?: string } };
  try {
    admin = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const contentId = formData.get("id") as string | null;
  const area = (formData.get("area") as string) || "landing-page";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The file is checked before the storage config: a bad file is a 400 the
  // admin can act on either way, and arriving there through a "storage is
  // not configured" 500 sends them looking in the wrong place.
  const sniff = sniffImage(buffer);
  if (!sniff.ok || !sniff.mime || !sniff.ext) {
    return NextResponse.json({ error: sniff.reason ?? "Unsupported image format" }, { status: 400 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Object storage is not configured" }, { status: 500 });
  }

  const optimized = await optimizeImage(buffer);

  let finalBuffer: Buffer;
  let storageExt: string;
  let contentType: string;

  if (optimized.ok) {
    finalBuffer = optimized.buffer;
    storageExt = "webp";
    contentType = "image/webp";
  } else {
    finalBuffer = buffer;
    storageExt = sniff.ext;
    contentType = sniff.mime;
  }

  const uniqueId = crypto.randomUUID();
  const storagePath = `${area}/${uniqueId}.${storageExt}`;

  const result = await putObject(storagePath, finalBuffer, contentType);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  const fileUrl = publicUrlFor(storagePath);

  // Recorded so the library lists it. The client's filename is kept as the
  // display name, matching what the product-media upload does.
  if (contentId) {
    const { error: attachError } = await supabase
      .from("media_attachments")
      .insert({
        storage_path: storagePath,
        file_name: (file.name || "landing-image").replace(/[/\\]/g, "_").slice(0, 200),
        mime_type: contentType,
        byte_size: finalBuffer.length,
        alt_text: null,
        folder_id: null,
      });

    // A row that already exists is not worth failing the upload over; the
    // object is stored and the URL is what the caller needs.
    if (attachError) {
      console.error("Failed to register landing image in the media library:", attachError.message);
    }

    const { error: contentError } = await supabase
      .from("site_content")
      .upsert(
        {
          key: contentId,
          area,
          image_url: fileUrl,
          updated_by: admin.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (contentError) {
      console.error("Failed to persist landing image URL:", contentError.message);
      return NextResponse.json(
        { error: "Image uploaded, but the landing page could not be updated" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ url: fileUrl });
}
