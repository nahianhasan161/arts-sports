import "server-only";
import { getServerUrl } from "@/lib/config";

/**
 * IndexNow: tells Bing, Yandex, Seznam and Naver (and through Bing, Copilot
 * and ChatGPT search) that a page is new or changed, so they fetch it within
 * minutes instead of waiting to find it. Google does not take part; it reads
 * the sitemap.
 *
 * Env: INDEXNOW_KEY (any 8-128 letters/digits/dashes you make up). The key is
 * served at /indexnow.txt so the engines can check the site is ours.
 */

export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null;
}

export async function pingIndexNow(paths: string[]): Promise<void> {
  const key = indexNowKey();
  if (!key || paths.length === 0) return;
  const site = getServerUrl().replace(/\/+$/, "");
  const host = new URL(site).host;
  if (host.startsWith("localhost") || host.startsWith("127.")) return;
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${site}/indexnow.txt`,
        urlList: paths.slice(0, 10000).map((p) => (p.startsWith("http") ? p : `${site}${p}`)),
      }),
      signal: AbortSignal.timeout(8000),
    });
    // 200 = taken, 202 = taken, key check pending.
    if (res.status >= 300) console.error("IndexNow refused the ping:", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("IndexNow ping failed:", err instanceof Error ? err.message : err);
  }
}
