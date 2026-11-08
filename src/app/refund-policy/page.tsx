import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Refund Policy",
  description:
    "How Arts Sports issues refunds: the 7-day return window, when a refund is full or partial, how cash-on-delivery and mobile-wallet refunds are paid, and how long each takes.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="When a return is approved, this page explains exactly how much you get back, how it is paid, and how long it takes."
    >
      <LegalSection title="1. What a refund covers">
        <p>
          An approved refund returns the price of the item or items you sent
          back. Whether the original delivery charge is included depends on why
          the return happened:
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Full refund including delivery</strong> — when we sent the
            wrong item, the item arrived damaged, or it has a manufacturing
            defect.
          </li>
          <li>
            <strong>Item price refund</strong> — for a change of mind or a size
            exchange. The original delivery charge is not refunded, and the
            return shipping cost is subtracted from the amount returned.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How the refund is paid">
        <p>Refunds go back the same way the order was paid:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>bKash or Nagad</strong> — refunded to the wallet number you
            give us when the return is arranged. If the number is different from
            the one used to pay, we confirm it by phone first.
          </li>
          <li>
            <strong>Cash on Delivery</strong> — paid to the bKash or Nagad
            wallet you nominate, because no card or wallet charge was ever
            taken.
          </li>
        </ul>
        <p>
          We do not refund to a third party, and we do not issue store credit
          unless you ask for it.
        </p>
      </LegalSection>

      <LegalSection title="3. How long it takes">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Return approved after inspection</span>
            <span className="font-semibold">1–2 working days</span>
          </div>
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Refund initiated after approval</span>
            <span className="font-semibold">Within 24 hours</span>
          </div>
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">bKash / Nagad credit received</span>
            <span className="font-semibold">1–3 working days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Total, end to end</span>
            <span className="font-bold text-primary">3–7 working days</span>
          </div>
        </div>
      </LegalSection>

      <LegalSection title="4. How the refund amount is calculated">
        <p>
          The amount returned is the price you actually paid for the item,
          including any promotion or coupon that was applied to it at the time
          of purchase. Coupons are not reissued on returned items, and a return
          never reduces the value of a coupon already applied to the rest of
          your order.
        </p>
        <p>
          If a returned item takes an order below the free-delivery threshold,
          the delivery charge for that order is added back to the amount you owe
          and is deducted from the refund.
        </p>
      </LegalSection>

      <LegalSection title="5. Order cancellation before dispatch">
        <p>
          An order can be cancelled free of charge at any point before it is
          dispatched for delivery. Call us with your order reference as soon as
          possible — once a courier has the parcel, the order can no longer be
          cancelled and must be returned under the Return &amp; Exchange Policy.
        </p>
        <p>
          A cancelled cash-on-delivery order needs no refund, since nothing was
          charged. An order paid by bKash or Nagad is refunded to the wallet
          used, within 1–3 working days.
        </p>
      </LegalSection>

      <LegalSection title="6. Disputes">
        <p>
          If you disagree with the outcome of a return, ask for it to be
          reviewed by a supervisor when you call. If it remains unresolved, see
          the Terms of Service for how complaints are escalated.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
