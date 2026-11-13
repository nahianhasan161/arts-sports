/** fetch + JSON for the admin screens: never throws, always gives an error line. */
export async function api<T = Record<string, unknown>>(url: string, body?: unknown, method?: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (json as { error?: string }).error ?? `Request failed (${res.status})` };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "No connection. Check the internet and try again." };
  }
}

export const field = "px-2.5 py-2 text-sm bg-surface-subtle rounded border border-border-light w-full";
export const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50";
export const btnPrimary = `${btn} bg-primary text-white hover:bg-primary-container`;
export const btnGhost = `${btn} border border-border-light bg-surface-card hover:bg-surface-subtle`;
export const card = "bg-surface-card rounded-lg border border-border-light";

export const dateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });
