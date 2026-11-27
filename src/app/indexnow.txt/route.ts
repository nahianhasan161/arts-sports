import { indexNowKey } from "@/lib/seo/indexnow";

/** The IndexNow key file (see lib/seo/indexnow.ts). 404 while INDEXNOW_KEY is not set. */
export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
