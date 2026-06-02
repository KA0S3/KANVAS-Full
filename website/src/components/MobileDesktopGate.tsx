import { Link } from "react-router-dom";
import { MonitorDown, Smartphone, Wallet } from "lucide-react";

type MobileDesktopGateProps = {
  title?: string;
  description?: string;
};

const DEFAULT_TITLE = "KANVAS is built for desktop";
const DEFAULT_DESCRIPTION =
  "KANVAS currently runs as a desktop app. If you are here to purchase, manage your account, or access your installer, you can continue to downloads. Installation and the app itself still require a desktop device.";

export function MobileDesktopGate({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
}: MobileDesktopGateProps) {
  return (
    <main className="mobile-gate-page">
      <div className="splash-bg splash-bg-mono" />
      <div className="splash-bg splash-bg-color" />
      <div className="splash-bg splash-bg-halo" />

      <section className="mobile-gate-panel panel" aria-label="Desktop only notice">
        <div className="mobile-gate-badge">
          <Smartphone size={18} />
          <span>Mobile access limited</span>
        </div>

        <img className="mobile-gate-logo" src="/KANVAS-LOGO-F3.png" alt="KANVAS logo" />

        <div className="mobile-gate-copy">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="mobile-gate-notes">
          <div className="mobile-gate-note">
            <Wallet size={18} />
            <span>Payments, account access, and installer lookup can continue on this device.</span>
          </div>
          <div className="mobile-gate-note">
            <MonitorDown size={18} />
            <span>The web demo is unavailable on mobile, and the app itself can only be installed on desktop.</span>
          </div>
        </div>

        <Link className="button primary large mobile-gate-button" to="/download">
          <MonitorDown size={18} />
          Continue to downloads
        </Link>
      </section>
    </main>
  );
}
