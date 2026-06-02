import { ArrowLeft, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const lastUpdated = "May 29, 2026";

const RefundPolicy = () => {
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
            <RotateCcw className="h-6 w-6 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-[0.2em]">Refunds</span>
          </div>
        </div>

        <Card className="glass cosmic-glow border-glass-border/40">
          <CardContent className="space-y-8 p-6 md:p-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground md:text-4xl">KANVAS Refund Policy</h1>
              <p className="text-sm text-muted-foreground">Effective date: {lastUpdated}</p>
            </header>

            <section className="space-y-3">
              <p className="leading-relaxed text-muted-foreground">
                KANVAS sells digital desktop software and related license access. Because delivery is immediate, most
                purchases are final once the license is delivered, activated, or made available for download.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">1. Review window</h2>
              <p className="leading-relaxed text-muted-foreground">
                You may contact us within 7 days of purchase if you believe there is a problem with the transaction or
                license delivery. That request will be reviewed against the exception cases below.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">2. General rule</h2>
              <p className="leading-relaxed text-muted-foreground">
                Refunds are generally not provided for change of mind, accidental purchase, or not needing the product
                after delivery. Once a license is issued or activated, the purchase is ordinarily non-refundable.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">3. Limited exceptions</h2>
              <div className="space-y-2 pl-4 text-muted-foreground">
                <p>Duplicate charge or other payment processor error.</p>
                <p>Verified failed delivery of the license or access that support cannot resolve in a reasonable time.</p>
                <p>Unauthorized payment, fraud, or a chargeback that must be reversed.</p>
                <p>Any refund right that cannot be excluded under applicable law.</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">4. How to request a review</h2>
              <div className="space-y-2 pl-4 text-muted-foreground">
                <p>Email <a className="text-primary underline underline-offset-4" href="mailto:shadek392@gmail.com">shadek392@gmail.com</a>.</p>
                <p>Include the purchase email, transaction reference, and a short description of the issue.</p>
                <p>If relevant, include screenshots or other evidence of the problem.</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">5. Outcome</h2>
              <p className="leading-relaxed text-muted-foreground">
                If a refund is approved, access may be revoked and the refund will be processed back through the
                original payment method when possible. Processing times depend on the payment provider and banking
                rails.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RefundPolicy;
