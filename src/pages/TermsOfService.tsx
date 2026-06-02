import { ArrowLeft, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const lastUpdated = "May 29, 2026";

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-md border border-glass-border/40 bg-glass/20 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-glass/30 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-[0.2em]">Legal</span>
          </div>
        </div>

        <Card className="glass cosmic-glow border-glass-border/40">
          <CardContent className="space-y-8 p-6 md:p-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground md:text-4xl">KANVAS Terms of Service</h1>
              <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
            </header>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">1. Acceptance and scope</h2>
              <p className="leading-relaxed text-muted-foreground">
                These Terms apply to the KANVAS desktop app, the companion website, account services, payment flows,
                activation flows, downloads, and any related content or support pages. By using KANVAS, you agree to
                these Terms and our Privacy Policy.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">2. Accounts and eligibility</h2>
              <p className="leading-relaxed text-muted-foreground">
                You must provide accurate account information and keep your login credentials secure. You are
                responsible for activity on your account and for any device authorized through your license.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">3. Purchase and license terms</h2>
              <p className="leading-relaxed text-muted-foreground">
                KANVAS is sold as a one-time purchase, not a subscription. Payment is processed through Paystack in
                ZAR. Once payment is confirmed and the license is delivered or activated, access is granted under the
                purchased license terms for the current desktop build or the stated upgrade path.
              </p>
              <div className="space-y-2 pl-4">
                <p className="text-muted-foreground">
                  Beta access is a discounted one-time purchase for the current desktop release.
                </p>
                <p className="text-muted-foreground">
                  If a later stable upgrade is advertised, it may require a separate one-time payment.
                </p>
                <p className="text-muted-foreground">
                  Chargebacks, fraud, or unauthorized payment reversals may suspend or revoke access.
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">4. User content and local data</h2>
              <p className="leading-relaxed text-muted-foreground">
                You keep ownership of your original content. KANVAS may store account, entitlement, and activation
                metadata for service operation. Project files, assets, and other local work remain your responsibility
                and may be stored on your device or through your chosen backup flow.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">5. Acceptable use</h2>
              <p className="leading-relaxed text-muted-foreground">
                You may not use KANVAS to break the law, interfere with service operation, reverse engineer the
                software, abuse payment or activation systems, or attempt unauthorized access to accounts or data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">6. Disclaimers</h2>
              <p className="leading-relaxed text-muted-foreground">
                KANVAS is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted service,
                error-free operation, or that every feature will meet every use case.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">7. Liability</h2>
              <p className="leading-relaxed text-muted-foreground">
                To the fullest extent allowed by law, KANVAS is not liable for indirect, incidental, special, or
                consequential damages. Where liability cannot be excluded, it is limited to the amount paid for the
                applicable product or service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">8. Contact</h2>
              <p className="leading-relaxed text-muted-foreground">
                Questions about these Terms can be sent to{" "}
                <a className="text-primary underline underline-offset-4" href="mailto:shadek392@gmail.com">
                  shadek392@gmail.com
                </a>
                .
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TermsOfService;
