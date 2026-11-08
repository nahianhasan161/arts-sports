/**
 * English text. bn.ts must have exactly the same keys (it is typed against
 * this file), so a missing translation is a build error, not a blank label.
 *
 * {name} placeholders are filled by t(key, { name: ... }).
 */
export const en = {
  common: {
    currency: "৳{amount}",
    orderNumber: "Order #{id}",
    language: "Language",
    bangla: "বাংলা",
    english: "English",
  },
  payment: {
    received: "Payment of {amount} received",
    verifying: "Payment is being verified",
    notCompleted: "Payment not completed yet",
    failed: "Payment was not completed",
    finish: "Finish payment",
  },
  notify: {
    order_placed: {
      subject: "We received your order #{id}",
      body: "Hi {name}, thank you for your order #{id} of {total} at Arts Sports. We will confirm it shortly.",
    },
    payment_received: {
      subject: "Payment received for order #{id}",
      body: "Hi {name}, we received {amount} for order #{id}. Your order is confirmed. — Arts Sports",
    },
    order_confirmed: {
      subject: "Order #{id} is confirmed",
      body: "Hi {name}, your order #{id} is confirmed and is being packed. — Arts Sports",
    },
    order_shipped: {
      subject: "Order #{id} is on its way",
      body: "Hi {name}, your order #{id} has been handed to {courier}. Tracking: {tracking}. — Arts Sports",
    },
    order_delivered: {
      subject: "Order #{id} delivered",
      body: "Hi {name}, your order #{id} was delivered. Thank you for shopping with Arts Sports!",
    },
  },
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof en>;
