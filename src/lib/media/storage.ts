import "server-only";

/**
 * Object storage, on Cloudflare R2.
 *
 * R2 is S3-compatible, so this speaks the S3 API through @aws-sdk/client-s3
 * against the account's R2 endpoint. Credentials come from the environment
 * and are never exposed: this module is server-only, so the secret access key
 * cannot reach a client bundle even if something imports it by mistake.
 *
 * ## Environment
 *
 *   R2_ACCOUNT_ID          Cloudflare account id (builds the S3 endpoint)
 *   R2_ACCESS_KEY_ID       R2 API token access key
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name, default `artssports-media`
 *   R2_PUBLIC_URL          optional public base URL of the bucket
 *
 * ## Public URL vs proxy
 *
 * A storefront image has to be readable by a browser with no credentials.
 * The shape of a new object's URL is decided by R2_PUBLIC_URL:
 *
 *   set    -> <R2_PUBLIC_URL>/<path>
 *             e.g. https://pub-<hash>.r2.dev/<path> before launch, then
 *             https://media.artssports.com/<path> once the domain is on
 *             Cloudflare. Served by Cloudflare's edge, no app bandwidth.
 *
 *   unset  -> /api/media/<path>
 *             streamed by this app from R2 with signed requests. Works with a
 *             private bucket.
 *
 * Changing the public domain later is an env change here plus the matching
 * `media_url_prefix` row in app_settings (see the R2 migration); stored rows
 * hold only object paths.
 */

import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";

export const BUCKET = process.env.R2_BUCKET || "artssports-media";

/**
 * Extensions the app will ever store, as decided by sniffImage().
 *
 * The object path is generated server-side, so this is not a security control
 * on upload. It is the allow-list the read route enforces, because that route
 * is anonymous and must never be turned into a general-purpose reader for
 * whatever else lands in the bucket.
 */
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

export class StorageNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Object storage is not configured; missing ${missing.join(", ")}`);
    this.name = "StorageNotConfiguredError";
  }
}

let cached: S3Client | null = null;

/**
 * The names of the required environment variables that are absent or empty.
 *
 * Returned rather than thrown from a single place so the setup script, the
 * read route and the write routes can all report the same list. A missing key
 * that quietly becomes an unsigned or wrong-signed request would surface as a
 * 403 from the provider with nothing useful in the logs.
 */
export function missingStorageConfig(): string[] {
  const required = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ];
  return required.filter((name) => {
    const v = process.env[name];
    return typeof v !== "string" || v.trim() === "";
  });
}

export function isStorageConfigured(): boolean {
  return missingStorageConfig().length === 0;
}

/**
 * The S3 client, built once per process.
 *
 * `region: "auto"` is what R2 expects. Path-style addressing keeps the bucket
 * in the path rather than the host, which is the form R2 documents. Checksums
 * are only sent when an operation requires them, because newer SDK defaults
 * add CRC headers that S3-compatible providers do not all accept.
 */
export function storageClient(): S3Client {
  if (cached) return cached;

  const missing = missingStorageConfig();
  if (missing.length > 0) throw new StorageNotConfiguredError(missing);

  cached = new S3Client({
    region: "auto",
    endpoint: endpoint(),
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cached;
}

export function endpoint(): string {
  return `https://${(process.env.R2_ACCOUNT_ID ?? "").trim()}.r2.cloudflarestorage.com`;
}

/** The bucket's public base URL, without a trailing slash, or "" when private. */
export function publicBaseUrl(): string {
  return (process.env.R2_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

/**
 * Whether objects are served by R2 directly.
 *
 * Unset means false, so a deployment that forgets the variable gets the
 * working proxy path rather than links to a host that was never configured.
 */
export function isPublicBucket(): boolean {
  return publicBaseUrl() !== "";
}

/** The route that streams an object when the bucket is not public. */
const PROXY_PREFIX = "/api/media";

export function publicUrlFor(path: string): string {
  return isPublicBucket() ? `${publicBaseUrl()}/${encodePath(path)}` : `${PROXY_PREFIX}/${path}`;
}

/**
 * Percent-encodes each path segment while leaving the separators alone.
 *
 * encodeURIComponent on the whole path would turn every "/" into %2F, which
 * changes the object's key. Segments are encoded individually so a file name
 * with a space or a "#" resolves to the same key it was stored under.
 */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Whether a path is one this app is allowed to read.
 *
 * The read route is anonymous, so this is the only thing standing between a
 * crafted URL and every object in the bucket. The rule is the *shape*:
 *
 *   - The path is `<folder>/<file>.<ext>`, which is what uploadMediaFile()
 *     generates, with exactly one folder and one dot.
 *   - The folder and the file match a strict allow-list, so neither can
 *     carry separators, traversal, or anything that resolves to a second
 *     object.
 *
 * `unattached/` is deliberately allowed. It holds the staged uploads, whose
 * names are server-generated UUIDs, so an object there is unguessable and
 * can only be reached by someone who was already handed the URL — which is
 * what the library does to draw the preview. Refusing it made every staged
 * card in the admin media library render a broken image instead of the file
 * the admin had just uploaded.
 */
export function isReadablePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  // A traversal attempt is refused outright rather than normalised. A path
  // that needed normalising is a path that was not generated here.
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  const [folder, file] = parts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(folder)) return false;
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  return /^[A-Za-z0-9-]+\.[A-Za-z0-9]+$/.test(file);
}

export type PutResult = { ok: true } | { ok: false; message: string };

/**
 * Stores one object.
 *
 * There is no upsert option on purpose. Every generated path contains a fresh
 * uuid, so an existing key at that path means the uuid collided rather than
 * that an admin is replacing a file, and overwriting a live product's image
 * would be worse than failing the upload and reporting it.
 */
export async function putObject(
  path: string,
  body: Buffer | Uint8Array | Readable,
  contentType: string,
): Promise<PutResult> {
  try {
    await storageClient().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: path,
        Body: body,
        ContentType: contentType,
        // Object paths are uuid-based and never reused, so the bytes at a
        // given path never change. A one-year immutable cache is therefore
        // correct and is what keeps the storefront off the origin.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Deletes objects, reporting rather than throwing.
 *
 * Callers delete the database row first, so a failure here leaves an
 * unreferenced file, which is recoverable, rather than a row pointing at a
 * missing object, which is a broken image on a live product page.
 *
 * DeleteObjects takes at most 1000 keys, so the list is chunked. S3 caps a
 * single delete request; sending more in one call fails the whole batch and
 * would leave every file in the overflow behind.
 */
export async function deleteObjects(paths: string[]): Promise<string | null> {
  if (paths.length === 0) return null;
  const client = storageClient();
  const errors: string[] = [];

  for (let i = 0; i < paths.length; i += 1000) {
    const chunk = paths.slice(i, i + 1000);
    try {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      // With Quiet, failures come back in Errors rather than as a thrown
      // error, so a partial delete has to be read off the result.
      for (const err of result.Errors ?? []) {
        errors.push(`${err.Key}: ${err.Code ?? "unknown"}`);
      }
    } catch (error) {
      return errorMessage(error);
    }
  }

  return errors.length > 0 ? `Some objects were not removed: ${errors.slice(0, 5).join("; ")}` : null;
}

/**
 * Copies an object within the bucket.
 *
 * This is how a staged upload becomes a product image: the file moves from
 * `unattached/<uuid>.png` to `<productId>/<uuid>.png`, and the copy runs before
 * the row is re-pointed so that a failure at any later step leaves a file that
 * is genuinely there under the name the row still holds. The caller deletes the
 * old key only once the row has moved, which is the point at which it becomes
 * unreferenced.
 *
 * S3 has no rename, so this is a server-side copy followed by the caller's
 * delete. The copy happens inside R2, so nothing is re-transferred.
 */
export async function copyObject(fromPath: string, toPath: string): Promise<string | null> {
  try {
    await storageClient().send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        Key: toPath,
        // CopySource is a single "bucket/key" string, not a bucket and a key
        // as separate fields, and the key has to be percent-encoded. Without
        // the encoding a path containing a space is silently sent as a
        // different key, and the copy appears to have succeeded while writing
        // an object nothing will ever read.
        CopySource: encodeURIComponent(`${BUCKET}/${fromPath}`),
        // Carried over so the copy is served exactly like the original.
        MetadataDirective: "COPY",
      }),
    );
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

export interface FetchedObject {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
  etag: string | null;
}

/**
 * Reads one object for streaming.
 *
 * Returns null when the object does not exist, so the caller can answer 404
 * rather than surfacing a provider error as a 500. A missing object is an
 * expected state here: a row can outlive its file if a previous delete failed,
 * and the read route has to render that as a broken image, not a server fault.
 */
export async function getObjectStream(path: string): Promise<FetchedObject | null> {
  try {
    const result = await storageClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: path }));
    return {
      body: result.Body as Readable,
      contentType: result.ContentType ?? null,
      contentLength: result.ContentLength ?? null,
      etag: result.ETag ?? null,
    };
  } catch (error) {
    const name = (error as { name?: string }).name ?? "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

/** True when the object is absent. */
export async function objectExists(path: string): Promise<boolean> {
  try {
    await storageClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: path, Range: "bytes=0-0" }));
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (error as { name?: string }).name === "NoSuchKey") return false;
    throw error;
  }
}

function errorMessage(error: unknown): string {
  const e = error as { message?: string; name?: string };
  // A provider error names itself, which is what makes it diagnosable in a
  // log. The raw message is returned rather than a generic sentence so the
  // cause -- AccessDenied, an invalid token, a missing bucket -- is
  // visible in the route response the admin sees.
  return e?.message ? `${e.name ?? "StorageError"}: ${e.message}` : "Object storage request failed";
}
