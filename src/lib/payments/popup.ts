"use client";

/**
 * UnivaPayment popup checkout (their /js/checkout.js): the bKash / Nagad
 * page opens in a modal on our own site instead of a full-page redirect.
 *
 * The script is loaded from the checkout URL's own origin, so there is no
 * extra env var. If it cannot load, or the gateway refuses to be framed
 * (this domain is not in the dashboard's allowed domains), the customer
 * gets the full-page checkout instead, so payment always works.
 *
 * Never treat these browser events as proof of payment: the order page
 * re-checks the payment with the gateway API, and the webhook confirms it.
 */

type PopupOutcome = "completed" | "pending" | "closed" | "redirected";

interface UnivaPaymentSdk {
  open(
    checkoutUrl: string,
    options?: {
      onSuccess?: (e: { url: string }) => void;
      onPending?: (e: { url: string }) => void;
      onClose?: (e: { status: string | null }) => void;
      onEvent?: (e: { event: string; [k: string]: unknown }) => void;
    }
  ): void;
  close(): void;
}

declare global {
  interface Window {
    UnivaPayment?: UnivaPaymentSdk;
  }
}

const loading = new Map<string, Promise<UnivaPaymentSdk>>();

function loadSdk(origin: string): Promise<UnivaPaymentSdk> {
  if (window.UnivaPayment) return Promise.resolve(window.UnivaPayment);
  let promise = loading.get(origin);
  if (!promise) {
    promise = new Promise<UnivaPaymentSdk>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${origin}/js/checkout.js`;
      script.async = true;
      script.onload = () => (window.UnivaPayment ? resolve(window.UnivaPayment) : reject(new Error("SDK missing")));
      script.onerror = () => reject(new Error("SDK failed to load"));
      document.head.appendChild(script);
    });
    promise.catch(() => loading.delete(origin));
    loading.set(origin, promise);
  }
  return promise;
}

/**
 * Opens the payment popup. Resolves when the customer is done with it:
 * "completed" (paid), "pending" (sent, still being verified), "closed"
 * (closed without paying), or "redirected" (fell back to the full page;
 * the browser is already leaving).
 */
export async function openPaymentPopup(checkoutUrl: string): Promise<PopupOutcome> {
  let origin: string;
  try {
    origin = new URL(checkoutUrl).origin;
  } catch {
    window.location.assign(checkoutUrl);
    return "redirected";
  }

  let sdk: UnivaPaymentSdk;
  try {
    sdk = await loadSdk(origin);
  } catch {
    window.location.assign(checkoutUrl);
    return "redirected";
  }

  return new Promise<PopupOutcome>((resolve) => {
    try {
      sdk.open(checkoutUrl, {
        onSuccess: () => resolve("completed"),
        onPending: () => resolve("pending"),
        onClose: () => resolve("closed"),
        onEvent: (e) => {
          // The SDK navigates to the full page by itself on "fallback".
          if (e.event === "fallback") resolve("redirected");
        },
      });
    } catch {
      window.location.assign(checkoutUrl);
      resolve("redirected");
    }
  });
}
