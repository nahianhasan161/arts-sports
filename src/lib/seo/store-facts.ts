import "server-only";
import { cache } from "react";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerUrl } from "@/lib/config";
import { RETURN_DAYS, SOCIAL_LINKS, STORE_EMAIL, STORE_PHONE } from "@/lib/nav";

/**
 * Facts about the shop that structured data, llms.txt and feeds state.
 * Delivery fees are the admin settings the order RPC charges (checkout_settings,
 * readable without login); delivery times and returns are the policy pages'.
 * Change a policy page and the matching line here together.
 */
export interface StoreFacts {
  name: string;
  url: string;
  phone: string;
  email: string;
  deliveryDhaka: number;
  deliveryOutside: number;
  freeDeliveryOver: number;
  /** Days after handover: Dhaka 24-48 h, elsewhere 3-5 days (shipping policy). */
  transitDays: { dhaka: [number, number]; outside: [number, number] };
  returnDays: number;
  social: string[];
}

export const getStoreFacts = cache(async (): Promise<StoreFacts> => {
  let fees = { delivery_fee_dhaka: 70, delivery_fee_outside: 120, free_delivery_over: 1500 };
  const db = getPublicSupabase();
  if (db) {
    const { data } = await db.rpc("checkout_settings");
    if (data && typeof data === "object") fees = { ...fees, ...(data as Partial<typeof fees>) };
  }
  return {
    name: "Arts Sports",
    url: getServerUrl().replace(/\/+$/, ""),
    phone: STORE_PHONE,
    email: STORE_EMAIL,
    deliveryDhaka: Number(fees.delivery_fee_dhaka) || 70,
    deliveryOutside: Number(fees.delivery_fee_outside) || 120,
    freeDeliveryOver: Number(fees.free_delivery_over) || 0,
    transitDays: { dhaka: [1, 2], outside: [3, 5] },
    returnDays: RETURN_DAYS,
    social: SOCIAL_LINKS.map((l) => l.href),
  };
});

/** schema.org shipping details for an offer: one rate inside Dhaka, one for the rest of Bangladesh. */
export function shippingDetails(f: StoreFacts) {
  const rate = (value: number, region: string | null, days: [number, number]) => ({
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value, currency: "BDT" },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "BD",
      ...(region ? { addressRegion: region } : {}),
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: days[0], maxValue: days[1], unitCode: "DAY" },
    },
  });
  return [rate(f.deliveryDhaka, "Dhaka", f.transitDays.dhaka), rate(f.deliveryOutside, null, f.transitDays.outside)];
}

export function returnPolicy(f: StoreFacts) {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "BD",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: f.returnDays,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
    merchantReturnLink: `${f.url}/returns`,
  };
}
