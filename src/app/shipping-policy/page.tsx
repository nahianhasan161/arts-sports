import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Shipping Policy",
  description:
    "Arts Fashion delivery charges and timelines: ৳60 inside Dhaka, ৳120 nationwide, free over ৳1,500, dispatch times and how to track an order.",
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Shipping Policy"
      intro="Where we deliver, what it costs, and how long it takes. The delivery charge is always shown to you before you confirm an order — there are no charges added afterwards."
    >
      <LegalSection title="1. Delivery charges">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Inside Dhaka Metro</span>
            <span className="font-semibold">৳ 60</span>
          </div>
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Outside Dhaka (all 64 districts)</span>
            <span className="font-semibold">৳ 120</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Orders of ৳ 1,500 or more</span>
            <span className="font-bold text-emerald-700">FREE</span>
          </div>
        </div>
        <p className="mt-2">
          The free-delivery threshold is judged on the value of the merchandise
          after any promotion or coupon has been applied, which is the same
          figure the order total is built from.
        </p>
      </LegalSection>

      <LegalSection title="2. Delivery timelines">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Inside Dhaka Metro</span>
            <span className="font-semibold">24–48 hours</span>
          </div>
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">All other districts</span>
            <span className="font-semibold">3–5 days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Custom name &amp; number printing</span>
            <span className="font-semibold">+2–3 days</span>
          </div>
        </div>
        <p className="mt-2">
          Timelines start from the moment your order is confirmed by phone, not
          from the moment it is placed. Orders placed after 6 PM are treated as
          the next day&apos;s dispatch.
        </p>
      </LegalSection>

      <LegalSection title="3. Dispatch and courier">
        <p>
          Orders are dispatched through national courier partners from our
          Dhaka and Chattogram showrooms. You will receive a call from our team
          before dispatch to confirm the item, the size and the address.
        </p>
      </LegalSection>

      <LegalSection title="4. Tracking your order">
        <p>
          A tracking link is sent to the phone number on the order once the
          parcel is collected by the courier. You can also call us with your
          order reference at any point and we will tell you exactly where the
          parcel is.
        </p>
        <p>
          Your order reference is shown on the confirmation page immediately
          after checkout, so keep it — it is the number we ask for on every
          support call.
        </p>
      </LegalSection>

      <LegalSection title="5. Failed delivery and re-delivery">
        <p>
          If the courier cannot reach you after two delivery attempts, the
          parcel is held at the nearest hub for 5 days before being returned to
          us. A return to sender means the order is cancelled and the refund, if
          any, is handled under the Refund Policy.
        </p>
        <p>
          A second delivery attempt to the same address after a failed first
          attempt is free. Re-dispatching to a new address is charged at the
          normal rate for that zone.
        </p>
      </LegalSection>

      <LegalSection title="6. Delivery outside Bangladesh">
        <p>
          We do not currently ship outside Bangladesh. International orders can
          be arranged in writing through our corporate desk; contact us before
          ordering so we can quote the freight and the duties for your country.
        </p>
      </LegalSection>

      <LegalSection title="7. Wrong or incomplete addresses">
        <p>
          We are not able to refund the delivery charge when an order cannot be
          delivered because the address, phone number or recipient name on it was
          wrong or incomplete. Please check these carefully before confirming.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
