import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata = {
  title: "Privacy Policy",
  description:
    "What personal data Arts Fashion collects, why we collect it, who we share it with, how long we keep it, and the rights you have over your own data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what we collect when you shop with us, why we collect it, and what you can ask us to do with it. It applies to this website and to any order you place with us by phone."
    >
      <LegalSection title="1. Who we are">
        <p>
          Arts Fashion is the business that operates this store. For any
          question about your data, contact us at{" "}
          <strong>support@artsfashion.com</strong> or on{" "}
          <strong>+880 9677 666 888</strong>.
        </p>
      </LegalSection>

      <LegalSection title="2. What we collect">
        <p>
          We collect only what is needed to take your money, send your parcel,
          and help you afterwards:
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Order details</strong> — your name, mobile number, email
            address if you give one, the delivery address, and any instructions
            you leave for the rider.
          </li>
          <li>
            <strong>Order contents</strong> — the items, sizes, quantities and
            prices, including any coupon applied.
          </li>
          <li>
            <strong>Account details</strong> — if you create an account, your
            email address, name and role on the store.
          </li>
          <li>
            <strong>Usage data</strong> — which pages were viewed and which
            items were added to a bag, collected in aggregate by Google
            Analytics so we can improve the store.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Why we collect it">
        <p>We use your information to:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Accept, confirm, pack and deliver your order.</li>
          <li>Process payments, refunds and returns.</li>
          <li>Contact you about an order — including the confirmation call we make before dispatch.</li>
          <li>Answer support questions and resolve complaints.</li>
          <li>Understand which products and pages matter, so we can stock and design better.</li>
        </ul>
        <p>
          We do not use your data for automated decision-making or profiling,
          and we do not sell it to anyone.
        </p>
      </LegalSection>

      <LegalSection title="4. Who we share it with">
        <p>
          Only the parties needed to complete your order, and only the data each
          one needs:
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            <strong>Courier partners</strong> — your name, address and phone
            number, so a driver can find you.
          </li>
          <li>
            <strong>Payment providers</strong> — bKash and Nagad, to settle a
            mobile-wallet payment or refund.
          </li>
          <li>
            <strong>Our database and storage providers</strong> — Supabase and
            Tigris, which host the order records and product photography.
          </li>
          <li>
            <strong>Analytics</strong> — Google Analytics, which receives
            page-level usage data and no contact details.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. How long we keep it">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Order records and invoices</span>
            <span className="font-semibold">7 years</span>
          </div>
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Support call notes and emails</span>
            <span className="font-semibold">2 years</span>
          </div>
          <div className="flex justify-between border-b border-border-light pb-2">
            <span className="text-text-muted">Account data</span>
            <span className="font-semibold">Until you ask us to close it</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Analytics data</span>
            <span className="font-semibold">14 months</span>
          </div>
        </div>
        <p className="mt-2">
          Order records are kept for seven years because Bangladeshi tax and
          commercial law requires business records to be retained for that
          period.
        </p>
      </LegalSection>

      <LegalSection title="6. How we protect it">
        <p>
          Every page on this site is served over HTTPS, so data in transit is
          encrypted. Access to order records is restricted by role, and only
          staff who need a record to fulfil an order can read it. Passwords are
          not stored by us — authentication is handled by Supabase Auth.
        </p>
        <p>
          Do not send card numbers or your bKash PIN to anyone claiming to be
          us, by phone or message. We never ask for them.
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>You can ask us to:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Give you a copy of the personal data we hold about you.</li>
          <li>Correct anything in it that is wrong.</li>
          <li>Delete your account data, subject to our record-keeping obligations above.</li>
          <li>Stop sending you marketing messages, at any time.</li>
        </ul>
        <p>
          Make any of these requests by emailing{" "}
          <strong>support@artsfashion.com</strong> from the address on your
          order, or calling us with your order reference. We will respond within
          14 days and will not charge you for it.
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies">
        <p>
          This site stores a small amount of data in your browser: your sign-in
          session and the contents of your shopping bag, so both survive a
          reload or a closed tab. We also use Google Analytics cookies to
          measure traffic. You can clear these at any time from your browser
          settings, though clearing the bag cookie will empty your basket.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>
          If this policy changes, the date at the top of this page changes with
          it. Where a change affects how we use data you have already given us,
          we will contact you before the change takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
