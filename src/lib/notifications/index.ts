import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { formatMoney, resolveLocale, translate, type Locale, type MessageKey, type Vars } from "@/i18n";
import { providers, type SendResult } from "./providers";

/**
 * One function for every customer message, whatever the channel.
 *
 *   await notify({ template: "payment_received", locale: "bn",
 *                  to: { email, phone }, vars: { id, name, amount } })
 *
 * Text comes from the i18n dictionaries (notify.<template>.subject/body), so
 * each message exists in Bangla and English. Every attempt is written to the
 * notifications table, including skipped ones and the WhatsApp links staff
 * still have to send.
 */

export type Channel = keyof typeof providers;

export type Template =
  | "order_placed"
  | "payment_received"
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered";

export interface NotifyInput {
  template: Template;
  locale?: Locale;
  to: { email?: string | null; phone?: string | null };
  vars: Vars;
  /** Defaults to every channel the recipient has an address for. */
  channels?: Channel[];
  orderId?: string | null;
  customerId?: string | null;
}

export interface NotifyOutcome {
  channel: Channel;
  result: SendResult;
}

export async function notify(input: NotifyInput): Promise<NotifyOutcome[]> {
  const locale = input.locale ?? "bn";
  const subject = translate(locale, `notify.${input.template}.subject` as MessageKey, input.vars);
  const body = translate(locale, `notify.${input.template}.body` as MessageKey, input.vars);

  const wanted: Channel[] = input.channels ?? ["email", "sms", "whatsapp"];
  const outcomes: NotifyOutcome[] = [];

  for (const channel of wanted) {
    const to = channel === "email" ? input.to.email : input.to.phone;
    if (!to) continue;

    const provider = providers[channel];
    let result: SendResult;
    if (!provider.isConfigured()) {
      result = { status: "skipped", provider: provider.name, error: "Not configured" };
    } else {
      try {
        result = await provider.send({ to, subject, body });
      } catch (err) {
        result = { status: "failed", provider: provider.name, error: err instanceof Error ? err.message : String(err) };
      }
    }
    outcomes.push({ channel, result });

    try {
      await getServiceSupabase().from("notifications").insert({
        channel,
        template: input.template,
        locale,
        recipient: to,
        order_id: input.orderId ?? null,
        customer_id: input.customerId ?? null,
        subject: channel === "email" ? subject : null,
        body,
        action_url: result.actionUrl ?? null,
        status: result.status,
        provider: result.provider,
        provider_message_id: result.messageId ?? null,
        error: result.error?.slice(0, 500) ?? null,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      });
    } catch (err) {
      console.error("Could not log notification:", err);
    }
  }
  return outcomes;
}

/**
 * Message about an order: looks up the customer, their language and the
 * amounts, then calls notify(). Extra vars (courier, tracking) are merged in.
 */
export async function notifyOrderEvent(
  orderId: string,
  template: Template,
  extra: Vars = {},
  channels?: Channel[]
): Promise<NotifyOutcome[]> {
  const db = getServiceSupabase();
  const { data: order } = await db
    .from("orders")
    .select("id, customer_name, customer_phone, customer_email, total_amount, customer_id, customers(preferred_locale, email)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return [];

  const customer = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as
    | { preferred_locale?: string; email?: string | null }
    | null;
  const locale = resolveLocale(customer?.preferred_locale ?? "bn");

  // Amount paid so far, for payment messages.
  const { data: paid } = await db
    .from("payments")
    .select("amount")
    .eq("order_id", orderId)
    .eq("type", "charge")
    .eq("status", "successful");
  const paidTotal = (paid ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  return notify({
    template,
    locale,
    to: { email: order.customer_email ?? customer?.email ?? null, phone: order.customer_phone },
    vars: {
      id: order.id,
      name: order.customer_name,
      total: formatMoney(Number(order.total_amount), locale),
      amount: formatMoney(paidTotal, locale),
      ...extra,
    },
    channels,
    orderId: order.id,
    customerId: order.customer_id,
  });
}
