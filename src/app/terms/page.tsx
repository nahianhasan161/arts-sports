import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Terms of Service",
  description:
    "The terms that apply when you shop at Arts Fashion: orders and acceptance, pricing, payment, delivery, returns, liability limits, and how complaints are escalated.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms are the agreement between you and Arts Fashion when you place an order. Please read them before ordering — using this site to buy something means you accept them."
    >
      <LegalSection title="1. Who may order">
        <p>
          You must be at least 18 years old, or have the permission of a parent
          or guardian, to place an order. By ordering you confirm that the name,
          address and phone number you give are yours or that you are authorised
          to use them.
        </p>
      </LegalSection>

      <LegalSection title="2. Placing an order">
        <p>
          Adding an item to your bag is not a contract. Your order becomes
          binding when we confirm it — normally by the phone call our team makes
          before dispatch, and in every case by dispatching the parcel.
        </p>
        <p>
          We may decline an order at our discretion, for example where the item
          is out of stock, the price was listed in error, the address cannot be
          served, or we suspect the order is fraudulent. If we decline an order
          you have already paid for, we refund it in full.
        </p>
      </LegalSection>

      <LegalSection title="3. Prices and payment">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>All prices are in Bangladeshi Taka (BDT) and include VAT.</li>
          <li>
            The price, any promotion and any coupon are applied at the moment
            the order is accepted, and that is the price you pay.
          </li>
          <li>
            We accept Cash on Delivery, bKash and Nagad. No card details are
            taken on this site.
          </li>
          <li>
            Your bank or wallet provider may apply its own charges; those are
            between you and them.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Pricing errors">
        <p>
          If an item is listed at a price that is obviously wrong — for example
          a price that is a fraction of the correct one — we may cancel the
          order and refund any payment in full, even after we have accepted it.
        </p>
      </LegalSection>

      <LegalSection title="5. Delivery, returns and refunds">
        <p>
          Delivery is governed by the{" "}
          <a href="/shipping-policy" className="text-primary font-semibold hover:underline">
            Shipping Policy
          </a>
          . Returns, exchanges and refunds are governed by the{" "}
          <a href="/returns" className="text-primary font-semibold hover:underline">
            Return &amp; Exchange Policy
          </a>{" "}
          and the{" "}
          <a href="/refund-policy" className="text-primary font-semibold hover:underline">
            Refund Policy
          </a>
          , each of which forms part of these terms.
        </p>
      </LegalSection>

      <LegalSection title="6. Your account">
        <p>
          If you create an account, you are responsible for keeping your
          password confidential and for everything done through your account.
          Tell us immediately if you believe someone else has used it.
        </p>
      </LegalSection>

      <LegalSection title="7. Product information and colour">
        <p>
          We describe our fabrics, fits and colourways as accurately as we can,
          and we publish the measurements on every size chart. Colours on screen
          depend on your display and may differ from the garment, which is why
          the size chart and the fabric weight are always listed.
        </p>
        <p>
          A difference in shade between the photograph and the garment is not a
          defect, provided the garment matches the colourway you ordered.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <p>
          Nothing in these terms limits our liability for death or personal
          injury caused by our negligence, for fraud, or for anything else that
          cannot legally be limited.
        </p>
        <p>
          Subject to that, our total liability for any order is limited to the
          amount you paid for it. We are not liable for indirect or
          consequential loss, including loss of profit, business or goodwill,
          however it arises.
        </p>
      </LegalSection>

      <LegalSection title="9. Intellectual property">
        <p>
          All photography, copy, design and code on this site belongs to Arts
          Fashion or its licensors. You may not copy, reproduce or use any of it
          for commercial purposes without written permission. You may share links
          to our pages freely.
        </p>
      </LegalSection>

      <LegalSection title="10. Complaints and escalation">
        <p>
          Contact us first on <strong>+880 9677 666 888</strong> or{" "}
          <strong>support@artsfashion.com</strong>. We aim to answer within two
          working days and to resolve most complaints on the first contact.
        </p>
        <p>
          If a complaint is not resolved to your satisfaction, ask for it to be
          escalated to the store manager, in writing. If it still remains
          unresolved, either party may refer the dispute to mediation or to the
          courts of Bangladesh, under whose law these terms are governed.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to these terms">
        <p>
          We may update these terms. The version shown on this page at the time
          you place an order is the one that applies to that order, and the date
          at the top tells you which version you are reading.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
