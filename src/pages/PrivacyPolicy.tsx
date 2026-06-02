import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const lastUpdated = "May 29, 2026";

const PrivacyPolicy = () => {
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
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-[0.2em]">Privacy</span>
          </div>
        </div>

        <Card className="glass cosmic-glow border-glass-border/40">
          <CardContent className="space-y-8 p-6 md:p-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground md:text-4xl">KANVAS Privacy Policy</h1>
              <p className="text-sm text-muted-foreground">Effective date: {lastUpdated}</p>
            </header>

            <section className="space-y-3">
              <p className="leading-relaxed text-muted-foreground">
                This policy explains what KANVAS collects, why we collect it, and how it is used across the desktop
                app, website, purchase flow, and activation flow.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">1. Information we collect</h2>
              <div className="space-y-2 pl-4 text-muted-foreground">
                <p>Account details such as name, email address, and login identifiers.</p>
                <p>Payment and entitlement metadata, while payment card details are handled by Paystack.</p>
                <p>Activation and device data needed to confirm licensed desktop access.</p>
                <p>Basic usage and diagnostic data that help us support and improve the service.</p>
                <p>Local project and asset files you create or store on your own device.</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">2. How we use it</h2>
              <div className="space-y-2 pl-4 text-muted-foreground">
                <p>Provide account access, purchase processing, activation, downloads, and support.</p>
                <p>Detect fraud, prevent abuse, and enforce license and device limits.</p>
                <p>Maintain records required for billing, refunds, and service administration.</p>
                <p>Improve reliability, features, and security.</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">3. Sharing and processors</h2>
              <p className="leading-relaxed text-muted-foreground">
                We do not sell personal information. We share data only with service providers that help run KANVAS,
                such as payment processors, authentication and hosting providers, and infrastructure used to deliver
                downloads, license checks, and support workflows.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">4. Retention and security</h2>
              <p className="leading-relaxed text-muted-foreground">
                We keep information for as long as needed to operate the service, meet legal obligations, resolve
                disputes, and enforce agreements. We use reasonable safeguards, but no online system or local device
                storage can be guaranteed to be perfectly secure.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">5. Your choices</h2>
              <div className="space-y-2 pl-4 text-muted-foreground">
                <p>You can request access, correction, or deletion of your account data where applicable.</p>
                <p>You can stop using the service and remove locally stored content from your device at any time.</p>
                <p>Some records may still be retained if required for legal, security, or billing reasons.</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">6. Children</h2>
              <p className="leading-relaxed text-muted-foreground">
                KANVAS is not intended for children under 13, and we do not knowingly collect personal information
                from them.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">7. Contact</h2>
              <p className="leading-relaxed text-muted-foreground">
                Privacy questions can be sent to{" "}
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

export default PrivacyPolicy;
