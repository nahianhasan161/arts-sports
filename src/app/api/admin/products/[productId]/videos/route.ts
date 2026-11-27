import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/service";
import { putObject, deleteObjects, publicUrlFor, isStorageConfigured } from "@/lib/media/storage";
import { sniffImage, sniffVideo } from "@/lib/media/validate";
import { MAX_VIDEOS, MAX_VIDEO_BYTES, parseVideoLink, readVideos, type ProductVideo } from "@/lib/media/video";

/**
 * Product videos (`products.videos`, migration 20261126100000).
 *
 *   GET    -> { videos }
 *   PUT    { videos }            new order / links added / entries removed
 *   POST   multipart file+poster upload one clip (already shrunk in the browser)
 *
 * Links are re-read on the server and stored as the host's id, so a saved
 * entry can only frame a known host. File entries can only come from POST:
 * PUT keeps a file only when it is already in the stored list, and deletes the
 * stored objects of files that were taken out.
 */
type Params = { params: Promise<{ productId: string }> };

const MIGRATION_MISSING = "Videos need the database update 20261126100000_product_videos.sql. Ask to apply it.";
const MAX_POSTER_BYTES = 1024 * 1024;

function isMissingColumn(error: { message?: string; code?: string } | null) {
  return !!error && (error.code === "42703" || /column .*videos/i.test(error.message ?? ""));
}

async function load(db: ReturnType<typeof getServiceSupabase>, productId: string) {
  const { data, error } = await db.from("products").select("id, videos").eq("id", productId).maybeSingle();
  if (isMissingColumn(error)) return { error: NextResponse.json({ error: MIGRATION_MISSING }, { status: 409 }) };
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "Product not found" }, { status: 404 }) };
  return { videos: readVideos((data as { videos: unknown }).videos) };
}

function filePaths(v: ProductVideo): string[] {
  return [v.storage_path, v.poster_path].filter((p): p is string => typeof p === "string" && p.length > 0);
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { user } = await requirePermission("products.manage");
    const { productId } = await params;
    const got = await load(getServiceSupabase(user), productId);
    if (got.error) return got.error;
    return NextResponse.json({ videos: got.videos });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { user } = await requirePermission("products.manage");
    const { productId } = await params;
    const db = getServiceSupabase(user);
    const got = await load(db, productId);
    if (got.error) return got.error;
    const stored = got.videos;

    const body = (await request.json().catch(() => ({}))) as { videos?: unknown };
    if (!Array.isArray(body.videos)) return NextResponse.json({ error: "videos must be a list" }, { status: 400 });

    const next: ProductVideo[] = [];
    const seen = new Set<string>();
    for (const raw of body.videos as Partial<ProductVideo>[]) {
      if (!raw || typeof raw !== "object") continue;
      let entry: ProductVideo | null = null;
      if (raw.kind === "file") {
        entry = stored.find((v) => v.kind === "file" && v.storage_path === raw.storage_path) ?? null;
      } else if (typeof raw.url === "string") {
        entry = parseVideoLink(raw.url);
        if (!entry) return NextResponse.json({ error: `Not a video link we can show: ${raw.url.slice(0, 120)}` }, { status: 400 });
      }
      if (!entry) continue;
      const key = entry.kind === "file" ? `file:${entry.storage_path}` : `${entry.kind}:${entry.id ?? entry.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(entry);
    }
    if (next.length > MAX_VIDEOS) return NextResponse.json({ error: `At most ${MAX_VIDEOS} videos per product` }, { status: 400 });

    const { error } = await db.from("products").update({ videos: next }).eq("id", productId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Row first, files after: a failed delete leaves a stray file, not a broken video.
    const keep = new Set(next.flatMap(filePaths));
    const gone = stored.flatMap(filePaths).filter((p) => !keep.has(p));
    if (gone.length > 0 && isStorageConfigured()) await deleteObjects(gone).catch(() => null);

    return NextResponse.json({ videos: next });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { user } = await requirePermission("products.manage");
    const { productId } = await params;
    if (!isStorageConfigured()) return NextResponse.json({ error: "File storage is not set up on this server" }, { status: 503 });
    const db = getServiceSupabase(user);
    const got = await load(db, productId);
    if (got.error) return got.error;
    if (got.videos.length >= MAX_VIDEOS) {
      return NextResponse.json({ error: `At most ${MAX_VIDEOS} videos per product` }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No video file" }, { status: 400 });
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: `Video is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB` }, { status: 413 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniff = sniffVideo(bytes);
    if (!sniff.ok || !sniff.mime || !sniff.ext) return NextResponse.json({ error: sniff.reason ?? "Not a video" }, { status: 400 });

    const storage_path = `${productId}/${crypto.randomUUID()}.${sniff.ext}`;
    const put = await putObject(storage_path, bytes, sniff.mime);
    if (!put.ok) return NextResponse.json({ error: put.message }, { status: 502 });

    let poster_path: string | null = null;
    const poster = form.get("poster");
    if (poster instanceof File && poster.size > 0 && poster.size <= MAX_POSTER_BYTES) {
      const pb = new Uint8Array(await poster.arrayBuffer());
      const ps = sniffImage(pb);
      if (ps.ok && ps.mime && ps.ext) {
        const path = `${productId}/${crypto.randomUUID()}.${ps.ext}`;
        if ((await putObject(path, pb, ps.mime)).ok) poster_path = path;
      }
    }

    const width = Number(form.get("width")) || 0;
    const height = Number(form.get("height")) || 0;
    const seconds = Number(form.get("seconds")) || undefined;
    const entry: ProductVideo = {
      kind: "file",
      url: publicUrlFor(storage_path),
      storage_path,
      poster_path,
      poster: poster_path ? publicUrlFor(poster_path) : null,
      mime: sniff.mime,
      bytes: bytes.length,
      seconds: seconds ? Math.round(seconds) : undefined,
      vertical: height > width,
    };

    const videos = [...got.videos, entry];
    const { error } = await db.from("products").update({ videos }).eq("id", productId);
    if (error) {
      await deleteObjects(filePaths(entry)).catch(() => null);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ videos, video: entry });
  } catch (error) {
    return handleAdminError(error);
  }
}
