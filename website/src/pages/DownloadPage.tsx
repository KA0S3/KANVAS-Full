import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Download, LinkIcon, ShieldCheck, Ticket } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";
import { fetchEntitlement } from "../lib/entitlements";
import { fetchDownloadAccess, redeemAccessCode } from "../lib/licenseApi";
import type { EntitlementState } from "../types/domain";

type DownloadLinks = {
  expires_at?: string;
  stable_available?: boolean;
  channels?: {
    stable?: string;
    beta?: string;
  };
};

function DownloadLogo() {
  return <img className="download-logo" src="/KANVAS-LOGO-F3.png" alt="KANVAS logo" />;
}

export function DownloadPage() {
  const { user, session, loading, configured } = useAuth();
  const { openPurchase } = usePurchaseOutlet();
  const [entitlement, setEntitlement] = useState<EntitlementState | null>(null);
  const [links, setLinks] = useState<DownloadLinks | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  const refreshEntitlement = async () => {
    if (!user) return;
    setChecking(true);
    setError(null);
    try {
      setEntitlement(await fetchEntitlement(user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to check download access.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!user || !session || !configured) return;
    void refreshEntitlement();
  }, [configured, session, user]);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const nextSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(nextSeconds);
      if (nextSeconds === 0) {
        setLinks(null);
        setExpiresAt(null);
      }
    };

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const requestLinks = async () => {
    if (!session) return;

    setRequesting(true);
    setError(null);
    setLinks(null);
    setExpiresAt(null);

    try {
      const access = await fetchDownloadAccess(session.access_token);
      setLinks(access);
      setExpiresAt(access.expires_at ? new Date(access.expires_at).getTime() : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request download links.");
    } finally {
      setRequesting(false);
    }
  };

  const redeemPromoCode = async () => {
    if (!session || !promoCode.trim()) return;

    setRedeeming(true);
    setPromoError(null);
    setPromoMessage(null);
    try {
      await redeemAccessCode(session.access_token, promoCode.trim());
      setPromoCode("");
      setPromoMessage("Promo code applied. Download access has been refreshed.");
      await refreshEntitlement();
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : "Unable to apply promo code.");
    } finally {
      setRedeeming(false);
    }
  };

  const promoRedeemPanel = (
    <div className="notice promo-redeem-panel">
      <div className="download-panel-heading">
        <Ticket size={18} />
        <div>
          <h2>Have a promo code?</h2>
          <p className="muted">Apply it to this account to unlock the matching desktop entitlement.</p>
        </div>
      </div>
      <div className="actions-row">
        <input
          aria-label="Promo or access code"
          placeholder="Promo or access code"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void redeemPromoCode();
            }
          }}
        />
        <button className="button" type="button" onClick={redeemPromoCode} disabled={redeeming || !promoCode.trim()}>
          {redeeming ? "Applying..." : "Apply code"}
        </button>
      </div>
      {promoMessage ? <div className="notice success">{promoMessage}</div> : null}
      {promoError ? <div className="notice error">{promoError}</div> : null}
    </div>
  );

  if (loading || checking) {
    return <main className="page narrow download-page"><section className="panel">Checking download access...</section></main>;
  }

  if (!configured) {
    return <main className="page narrow download-page"><section className="panel notice error">Supabase is not configured for download access.</section></main>;
  }

  if (!user) {
    return (
      <main className="page narrow download-page">
        <section className="panel download-access-panel">
          <DownloadLogo />
          <h1>Log in to download</h1>
          <p className="muted">Installer links are visible only to accounts with an active entitlement.</p>
          <Link className="button primary" to="/login?next=/download">Log in or create account</Link>
        </section>
      </main>
    );
  }

  if (!entitlement?.paid) {
    return (
      <main className="page narrow download-page">
        <section className="panel download-access-panel">
          <DownloadLogo />
          <h1>Purchase required</h1>
          <p className="muted">Purchase beta access to unlock the desktop installer. The desktop app still verifies your account during activation.</p>
          {error ? <div className="notice error">{error}</div> : null}
          {promoRedeemPanel}
          <button className="button primary" type="button" onClick={openPurchase}>Purchase desktop app</button>
        </section>
      </main>
    );
  }

  const stableUrl = links?.channels?.stable || "";
  const betaUrl = links?.channels?.beta || "";
  const canDownloadStable = entitlement.stableAccess;
  const canDownloadBeta = entitlement.betaAccess;
  const activeChannels = [canDownloadBeta ? "Beta" : "", canDownloadStable ? "Stable" : ""].filter(Boolean).join(" + ");
  const downloadUrl = stableUrl || betaUrl;
  const downloadLabel = stableUrl ? "Stable installer" : "Beta installer";
  const stableBuildAvailable = Boolean(links?.stable_available || stableUrl);
  const visibleDownloadUrl = downloadUrl;

  return (
    <main className="page download-page">
      <section className="download-hero-panel">
        <div className="download-hero-copy">
          <p className="eyebrow">Desktop installer</p>
          <h1>Download KANVAS</h1>
          <p>
            KANVAS is currently in beta testing. Your valued support helps shape the app and qualifies your account for a discounted full release upgrade.
          </p>
        </div>
        <DownloadLogo />
      </section>

      <section className="download-grid">
        <article className="panel download-control-panel">
          <div className="download-panel-heading">
            <ShieldCheck size={20} />
            <div>
              <h2>Secure account links</h2>
              <p className="muted">Request a fresh installer link for this account. It appears here and expires quickly to protect paid access.</p>
            </div>
          </div>

          <div className="download-status-row">
            <span className="download-status-pill">
              <CheckCircle2 size={15} />
              {activeChannels || "Paid"}
            </span>
            {expiresAt ? (
              <span className="download-status-pill muted-pill">
                <Clock3 size={15} />
                Expires in {secondsLeft}s
              </span>
            ) : null}
          </div>

          {entitlement.stableUpgradeEligible && !entitlement.stableAccess && stableBuildAvailable ? (
            <div className="notice download-upgrade-note">
              Your beta purchase is eligible for the R100 stable upgrade.
              <button className="link-button" type="button" onClick={openPurchase}>Open upgrade checkout</button>
            </div>
          ) : null}
          {error ? <div className="notice error">{error}</div> : null}
          {promoRedeemPanel}
          <button className="button primary full" type="button" onClick={requestLinks} disabled={requesting}>
            {requesting ? "Generating..." : links ? "Request a fresh link" : "Request download link"}
          </button>
          {expiresAt ? <div className="notice success">Download links expire in {secondsLeft}s.</div> : null}
          {links && !stableUrl && !betaUrl ? <div className="notice">Download URLs are not configured yet.</div> : null}
        </article>

        <aside className="download-link-panel" aria-live="polite">
          <div className="download-link-icon">
            {visibleDownloadUrl ? <Download size={22} /> : <LinkIcon size={22} />}
          </div>
          <div>
            <h2>{visibleDownloadUrl ? "Your download link is ready" : "Your link will appear here"}</h2>
            <p className="muted">
              {visibleDownloadUrl
                ? `${downloadLabel} requested for ${activeChannels || "your account"}.`
                : "Request a link when you are ready to install. Old links are not kept on this page."}
            </p>
          </div>
          {visibleDownloadUrl ? (
            <a className="button primary full" href={visibleDownloadUrl}>
              Download {downloadLabel}
            </a>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
