import "server-only";

/**
 * Cloudflare Turnstile: free bot check with no puzzle for real people.
 * Env: NEXT_PUBLIC_TURNSTILE_SITE_KEY (browser), TURNSTILE_SECRET_KEY (server).
 * Without both keys the check is skipped, so checkout keeps working.
 */

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() && process.env.TURNSTILE_SECRET_KEY?.trim());
}

export type TurnstileResult = "passed" | "failed" | "skipped";

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<TurnstileResult> {
  if (!isTurnstileConfigured()) return "skipped";
  if (!token) return "failed";
  const form = new FormData();
  form.append("secret", process.env.TURNSTILE_SECRET_KEY!.trim());
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success ? "passed" : "failed";
  } catch (err) {
    // Cloudflare unreachable: don't block a real customer; the risk score
    // still applies.
    console.error("Turnstile verify failed:", err);
    return "skipped";
  }
}
