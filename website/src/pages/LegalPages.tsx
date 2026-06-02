import { Link } from "react-router-dom";

type LegalPageProps = {
  title: string;
  iconLabel: string;
  updatedLabel: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
};

function LegalPageShell({ title, iconLabel, updatedLabel, sections }: LegalPageProps) {
  return (
    <main className="page narrow legal-page">
      <section className="panel legal-page-panel">
        <div className="legal-page-header">
          <p className="eyebrow">{iconLabel}</p>
          <h1>{title}</h1>
          <p className="muted">{updatedLabel}</p>
        </div>

        <div className="legal-page-body">
          {sections.map((section) => (
            <section key={section.heading} className="legal-section">
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="legal-page-footer">
          <Link className="button" to="/">Return home</Link>
        </div>
      </section>
    </main>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalPageShell
      title="KANVAS Terms of Service"
      iconLabel="Legal"
      updatedLabel="Last updated: May 29, 2026"
      sections={[
        {
          heading: "1. Acceptance and scope",
          paragraphs: [
            "These Terms apply to the KANVAS desktop app, companion website, purchase flow, activation flow, downloads, and related support pages. By using KANVAS, you agree to these Terms and our Privacy Policy.",
          ],
        },
        {
          heading: "2. Accounts and eligibility",
          paragraphs: [
            "You must provide accurate account information and keep your login credentials secure. You are responsible for activity on your account and for any device authorized through your license.",
          ],
        },
        {
          heading: "3. Purchase and license terms",
          paragraphs: [
            "KANVAS is sold as a one-time purchase, not a subscription. Payment is processed through Paystack in ZAR. Once payment is confirmed and the license is delivered or activated, access is granted under the purchased license terms for the current desktop build or the stated upgrade path.",
          ],
          bullets: [
            "Beta access is a discounted one-time purchase for the current desktop release.",
            "If a later stable upgrade is advertised, it may require a separate one-time payment.",
            "Chargebacks, fraud, or unauthorized payment reversals may suspend or revoke access.",
          ],
        },
        {
          heading: "4. User content and local data",
          paragraphs: [
            "You keep ownership of your original content. KANVAS may store account, entitlement, and activation metadata for service operation. Project files, assets, and other local work remain your responsibility and may be stored on your device or through your chosen backup flow.",
          ],
        },
        {
          heading: "5. Acceptable use",
          paragraphs: [
            "You may not use KANVAS to break the law, interfere with service operation, reverse engineer the software, abuse payment or activation systems, or attempt unauthorized access to accounts or data.",
          ],
        },
        {
          heading: "6. Disclaimers",
          paragraphs: [
            'KANVAS is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted service, error-free operation, or that every feature will meet every use case.',
          ],
        },
        {
          heading: "7. Liability",
          paragraphs: [
            "To the fullest extent allowed by law, KANVAS is not liable for indirect, incidental, special, or consequential damages. Where liability cannot be excluded, it is limited to the amount paid for the applicable product or service.",
          ],
        },
        {
          heading: "8. Contact",
          paragraphs: [
            'Questions about these Terms can be sent to shadek392@gmail.com.',
          ],
        },
      ]}
    />
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="KANVAS Privacy Policy"
      iconLabel="Privacy"
      updatedLabel="Effective date: May 29, 2026"
      sections={[
        {
          heading: "Overview",
          paragraphs: [
            "This policy explains what KANVAS collects, why we collect it, and how it is used across the desktop app, website, purchase flow, and activation flow.",
          ],
        },
        {
          heading: "1. Information we collect",
          paragraphs: [],
          bullets: [
            "Account details such as name, email address, and login identifiers.",
            "Payment and entitlement metadata, while payment card details are handled by Paystack.",
            "Activation and device data needed to confirm licensed desktop access.",
            "Basic usage and diagnostic data that help us support and improve the service.",
            "Local project and asset files you create or store on your own device.",
          ],
        },
        {
          heading: "2. How we use it",
          paragraphs: [],
          bullets: [
            "Provide account access, purchase processing, activation, downloads, and support.",
            "Detect fraud, prevent abuse, and enforce license and device limits.",
            "Maintain records required for billing, refunds, and service administration.",
            "Improve reliability, features, and security.",
          ],
        },
        {
          heading: "3. Sharing and processors",
          paragraphs: [
            "We do not sell personal information. We share data only with service providers that help run KANVAS, such as payment processors, authentication and hosting providers, and infrastructure used to deliver downloads, license checks, and support workflows.",
          ],
        },
        {
          heading: "4. Retention and security",
          paragraphs: [
            "We keep information for as long as needed to operate the service, meet legal obligations, resolve disputes, and enforce agreements. We use reasonable safeguards, but no online system or local device storage can be guaranteed to be perfectly secure.",
          ],
        },
        {
          heading: "5. Your choices",
          paragraphs: [],
          bullets: [
            "You can request access, correction, or deletion of your account data where applicable.",
            "You can stop using the service and remove locally stored content from your device at any time.",
            "Some records may still be retained if required for legal, security, or billing reasons.",
          ],
        },
        {
          heading: "6. Children",
          paragraphs: [
            "KANVAS is not intended for children under 13, and we do not knowingly collect personal information from them.",
          ],
        },
        {
          heading: "7. Contact",
          paragraphs: [
            "Privacy questions can be sent to shadek392@gmail.com.",
          ],
        },
      ]}
    />
  );
}

export function RefundPolicyPage() {
  return (
    <LegalPageShell
      title="KANVAS Refund Policy"
      iconLabel="Refunds"
      updatedLabel="Effective date: May 29, 2026"
      sections={[
        {
          heading: "Overview",
          paragraphs: [
            "KANVAS sells digital desktop software and related license access. Because delivery is immediate, most purchases are final once the license is delivered, activated, or made available for download.",
          ],
        },
        {
          heading: "1. Review window",
          paragraphs: [
            "You may contact us within 7 days of purchase if you believe there is a problem with the transaction or license delivery. That request will be reviewed against the exception cases below.",
          ],
        },
        {
          heading: "2. General rule",
          paragraphs: [
            "Refunds are generally not provided for change of mind, accidental purchase, or not needing the product after delivery. Once a license is issued or activated, the purchase is ordinarily non-refundable.",
          ],
        },
        {
          heading: "3. Limited exceptions",
          paragraphs: [],
          bullets: [
            "Duplicate charge or other payment processor error.",
            "Verified failed delivery of the license or access that support cannot resolve in a reasonable time.",
            "Unauthorized payment, fraud, or a chargeback that must be reversed.",
            "Any refund right that cannot be excluded under applicable law.",
          ],
        },
        {
          heading: "4. How to request a review",
          paragraphs: [],
          bullets: [
            "Email shadek392@gmail.com.",
            "Include the purchase email, transaction reference, and a short description of the issue.",
            "If relevant, include screenshots or other evidence of the problem.",
          ],
        },
        {
          heading: "5. Outcome",
          paragraphs: [
            "If a refund is approved, access may be revoked and the refund will be processed back through the original payment method when possible. Processing times depend on the payment provider and banking rails.",
          ],
        },
      ]}
    />
  );
}
