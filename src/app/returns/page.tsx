import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

/**
 * Return & Exchange policy.
 *
 * The footer banner has promised "7 Days Easy Return" since the storefront
 * was built, while the trust-badge strip on collections pages promised
 * "14-Day Returns". Two published windows is a consumer-protection exposure,
 * not a copy nit, so the single number is defined here and both sites link
 * to this page.
 */

export const metadata = {
  title: "Return & Exchange Policy",
  description:
    "Arts Fashion's 7-day return and size-exchange policy: what qualifies, how to request a return, who pays return shipping, and how long a refund takes.",
};

export default function ReturnsPolicyPage() {
  return (
    <LegalPage
      title="Return & Exchange Policy"
      intro="You have 7 days from delivery to return or exchange an item. This page explains exactly what qualifies, how to start a request, and what to expect at each step."
    >
      <LegalSection title="1. The 7-day window">
        <p>
          You may return or exchange any item within <strong>7 days</strong> of
          the date it was delivered. The window is counted in calendar days from
          the delivery date shown against your order reference, not from the
          date you placed the order or the date you first opened the parcel.
        </p>
        <p>
          Requests filed after the 7th day cannot be accepted, because a
          returned item can no longer be re-sold to another customer.
        </p>
      </LegalSection>

      <LegalSection title="2. What qualifies">
        <p>An item is eligible for return or exchange when all of the following are true:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>It is unworn, unwashed and unaltered, with all original tags still attached.</li>
          <li>
            It is returned in its original packaging, including any sealed poly
            bag, size stickers or hang tags it arrived with.
          </li>
          <li>The request is made within the 7-day window.</li>
          <li>
            It was bought at full price or on a promotion that is still running.
            Items bought during a clearance or final-sale event cannot be
            returned.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. What does not qualify">
        <p>
          To keep the stock resaleable for every customer, the following cannot
          be returned or exchanged:
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Innerwear, socks and any item sold as a multi-pack set.</li>
          <li>Items showing wear, odour, stains, cigarette smoke or pet hair.</li>
          <li>Items where tags have been removed or the size sticker has been replaced.</li>
          <li>
            Custom-embroidered, personalised or made-to-order items, including
            custom name and number printing on jersey editions.
          </li>
          <li>Gift cards and promotional accessories.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Size exchange — the fastest option">
        <p>
          A size exchange is free and is usually the quickest fix. Tell us the
          size you received and the size you need, and we will dispatch the
          replacement as soon as your parcel reaches us. Exchange stock is
          subject to availability; if the size you want has sold out in the
          meantime, we will issue a full refund instead.
        </p>
      </LegalSection>

      <LegalSection title="5. How to start a return">
        <p>
          Call <strong>+880 9677 666 888</strong> between 9 AM and 10 PM, or
          email <strong>support@artsfashion.com</strong>, with your order
          reference and the item you want to return. Our team will confirm the
          return and arrange collection with a courier partner.
        </p>
        <p>
          You do not need to pay the courier when the reason for the return is
          our error — a wrong item, a damaged item, or a manufacturing defect.
          For a change of mind or a size exchange, return shipping is covered by
          the customer and is deducted from the refund.
        </p>
      </LegalSection>

      <LegalSection title="6. Refunds">
        <p>
          Approved refunds are issued to the original payment method, or to the
          mobile wallet number you nominate for a cash-on-delivery order. See
          the <a href="/refund-policy" className="text-primary font-semibold hover:underline">
          Refund Policy</a> for timelines and the exact method.
        </p>
      </LegalSection>

      <LegalSection title="7. Damaged or incorrect items">
        <p>
          If your parcel arrives damaged, or contains an item that is not what
          you ordered, contact us within <strong>48 hours</strong> of delivery
          with a photograph of the item and its packaging. We will arrange a
          free replacement or a full refund including the original delivery
          charge, and we do not require the item to be returned in these cases.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
