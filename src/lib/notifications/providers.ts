import "server-only";
import { toInternational } from "@/lib/phone";

/**
 * Channel providers. Each one either sends, or reports "skipped" when it is
 * not configured, so adding an SMS gateway later is one new provider here
 * and an env var, with no change for callers.
 */

export interface SendResult {
  status: "sent" | "failed" | "skipped" | "manual";
  provider: string;
  messageId?: string;
  actionUrl?: string;
  error?: string;
}

export interface OutgoingMessage {
  to: string;
  subject?: string;
  body: string;
}

export interface ChannelProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(message: OutgoingMessage): Promise<SendResult>;
}

const env = (name: string) => process.env[name]?.trim() ?? "";

/**
 * Email through Resend (free tier: 3,000 emails/month).
 * Env: RESEND_API_KEY, NOTIFY_EMAIL_FROM (e.g. "Arts Sports <orders@artssports.com>").
 */
export const resendEmail: ChannelProvider = {
  name: "resend",
  isConfigured: () => Boolean(env("RESEND_API_KEY") && env("NOTIFY_EMAIL_FROM")),
  async send(message) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env("NOTIFY_EMAIL_FROM"),
        to: [message.to],
        subject: message.subject ?? "Arts Sports",
        text: message.body,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok
      ? { status: "sent", provider: "resend", messageId: json.id }
      : { status: "failed", provider: "resend", error: json.message ?? `HTTP ${res.status}` };
  },
};

/**
 * SMS: no gateway chosen yet (roadmap: a BD SMS gateway later). Until then
 * every SMS is logged as skipped, so nothing is lost silently.
 */
export const smsNotConfigured: ChannelProvider = {
  name: "none",
  isConfigured: () => false,
  async send() {
    return { status: "skipped", provider: "none", error: "No SMS gateway configured" };
  },
};

/**
 * WhatsApp without the paid Business API: build a click-to-chat link to the
 * customer's number with the message filled in. Staff open it from the admin
 * and press send in the WhatsApp Business app.
 */
export const whatsappLink: ChannelProvider = {
  name: "wa.me",
  isConfigured: () => true,
  async send(message) {
    const number = toInternational(message.to);
    if (!number) return { status: "failed", provider: "wa.me", error: "Not a BD mobile number" };
    return {
      status: "manual",
      provider: "wa.me",
      actionUrl: `https://wa.me/${number}?text=${encodeURIComponent(message.body)}`,
    };
  },
};

/** Link a customer taps to message the store, e.g. "I confirm order #1234". */
export function whatsappToStore(text: string): string | null {
  const store = toInternational(env("NEXT_PUBLIC_STORE_WHATSAPP"));
  return store ? `https://wa.me/${store}?text=${encodeURIComponent(text)}` : null;
}

export const providers = {
  email: resendEmail,
  sms: smsNotConfigured,
  whatsapp: whatsappLink,
} as const;
