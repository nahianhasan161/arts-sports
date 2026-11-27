import { NextResponse } from "next/server";
import { handleAdminError } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Helpers for the product import (components/admin/products/ProductImport.tsx).
 *
 *   GET ?sheet=<Google Sheets link>  -> the sheet tab as CSV text
 *   GET ?image=<picture link>        -> the picture's bytes
 *
 * Both exist because the browser cannot read those links itself (Google and
 * most image hosts send no CORS headers). Nothing is stored here: the browser
 * parses the sheet, shrinks each picture and uploads it through the normal
 * media API, so the import follows the same rules as the product form.
 */

const MAX_SHEET_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Google Sheets link -> its CSV export URL, or null. */
function sheetCsvUrl(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.hostname !== "docs.google.com") return null;
  const gid = u.searchParams.get("gid") ?? u.hash.match(/gid=(\d+)/)?.[1] ?? null;
  // "Publish to the web" link: /spreadsheets/d/e/<id>/pubhtml
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ""}`;
  const id = u.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,})/);
  if (id) return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  return null;
}

/** Share links that point at a page rather than the picture, turned into the picture link. */
function directImageUrl(link: string): URL | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  // No addresses, no local names: only public host names.
  if (/^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;

  if (host === "drive.google.com" || host === "docs.google.com") {
    const id = u.pathname.match(/\/d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get("id");
    if (id) return new URL(`https://drive.google.com/uc?export=download&id=${id}`);
  }
  if (host.endsWith("dropbox.com")) {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
  }
  return u;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  try {
    await requirePermission("products.manage");
  } catch (error) {
    return handleAdminError(error);
  }

  const params = new URL(request.url).searchParams;
  const sheet = params.get("sheet");
  const image = params.get("image");

  if (sheet) {
    const url = sheetCsvUrl(sheet);
    if (!url) return fail("That is not a Google Sheets link. Copy the link from the browser address bar of the sheet.");
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    } catch {
      return fail("Google Sheets did not answer. Try again.", 502);
    }
    const type = res.headers.get("content-type") ?? "";
    // A private sheet answers with a sign-in page (HTML), not CSV.
    if (!res.ok || type.includes("text/html")) {
      return fail(
        'The sheet is not open to links. In Google Sheets: Share → General access → "Anyone with the link" (Viewer), then try again.',
        res.status === 404 ? 404 : 403,
      );
    }
    const bytes = await readCapped(res, MAX_SHEET_BYTES);
    if (!bytes) return fail("The sheet is over 3 MB. Split it into smaller tabs.");
    return new NextResponse(new TextDecoder().decode(bytes), {
      headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (image) {
    const url = directImageUrl(image);
    if (!url) return fail("Not a picture link");
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
      });
    } catch {
      return fail("The picture link did not answer", 502);
    }
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok) return fail(`The picture link answered ${res.status}`, 502);
    if (!type.startsWith("image/")) {
      return fail(
        url.hostname.includes("google.com")
          ? 'The Google Drive picture is not shared. Share it as "Anyone with the link".'
          : "The link is a web page, not a picture. Use the picture's own link (right click → Copy image address).",
        415,
      );
    }
    const bytes = await readCapped(res, MAX_IMAGE_BYTES);
    if (!bytes) return fail("The picture is over 15 MB", 413);
    return new NextResponse(bytes as unknown as BodyInit, { headers: { "content-type": type, "cache-control": "no-store" } });
  }

  return fail("Send ?sheet= or ?image=");
}
