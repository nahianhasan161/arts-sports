import type { User } from "@supabase/supabase-js";
import type { AddressValue } from "@/components/checkout/AddressPicker";

/**
 * The customer's saved delivery details. Kept in the auth user's
 * `user_metadata.delivery` (no table needed); the account page edits it and
 * checkout fills its form from it.
 */
export interface DeliveryDetails extends AddressValue {
  name: string;
  phone: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function readDelivery(user: User | null | undefined): DeliveryDetails | null {
  const d = user?.user_metadata?.delivery;
  if (!d || typeof d !== "object") return null;
  const out: DeliveryDetails = {
    name: str(d.name),
    phone: str(d.phone),
    division: str(d.division),
    district: str(d.district),
    thana: str(d.thana),
    line: str(d.line),
  };
  return out.district || out.phone ? out : null;
}
