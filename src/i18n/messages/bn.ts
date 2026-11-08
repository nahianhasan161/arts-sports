import type { Messages } from "./en";

/** বাংলা লেখা। en.ts-এর সব key এখানে থাকতে হবে। */
export const bn: Messages = {
  common: {
    currency: "৳{amount}",
    orderNumber: "অর্ডার #{id}",
    language: "ভাষা",
    bangla: "বাংলা",
    english: "English",
  },
  payment: {
    received: "{amount} পেমেন্ট পাওয়া গেছে",
    verifying: "পেমেন্ট যাচাই চলছে",
    notCompleted: "পেমেন্ট এখনো সম্পূর্ণ হয়নি",
    failed: "পেমেন্ট সম্পূর্ণ হয়নি",
    finish: "পেমেন্ট সম্পূর্ণ করুন",
  },
  notify: {
    order_placed: {
      subject: "আপনার অর্ডার #{id} পেয়েছি",
      body: "{name}, Arts Sports-এ {total} টাকার অর্ডার #{id} দেওয়ার জন্য ধন্যবাদ। আমরা শিগগিরই confirm করব।",
    },
    payment_received: {
      subject: "অর্ডার #{id}-এর পেমেন্ট পাওয়া গেছে",
      body: "{name}, অর্ডার #{id}-এর জন্য {amount} পেয়েছি। আপনার অর্ডার confirm হয়েছে। — Arts Sports",
    },
    order_confirmed: {
      subject: "অর্ডার #{id} confirm হয়েছে",
      body: "{name}, আপনার অর্ডার #{id} confirm হয়েছে, প্যাক করা হচ্ছে। — Arts Sports",
    },
    order_shipped: {
      subject: "অর্ডার #{id} পাঠানো হয়েছে",
      body: "{name}, আপনার অর্ডার #{id} {courier}-এ দেওয়া হয়েছে। Tracking: {tracking}। — Arts Sports",
    },
    order_delivered: {
      subject: "অর্ডার #{id} পৌঁছেছে",
      body: "{name}, আপনার অর্ডার #{id} পৌঁছে গেছে। Arts Sports থেকে কেনার জন্য ধন্যবাদ!",
    },
  },
};
