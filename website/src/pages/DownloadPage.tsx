import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";
import { fetchEntitlement } from "../lib/entitlements";
import { fetchDownloadAccess } from "../lib/licenseApi";
import type { EntitlementState } from "../types/domain";

type DownloadLinks = {
  expires_at?: string;
  channels?: {
    stable?: string;
    beta?: string;
  };
};

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

  useEffect(() => {
    if (!user || !session || !configured) return;

    setChecking(true);
    setError(null);
    fetchEntitlement(user.id)
      .then(setEntitlement)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to check download access."))
      .finally(() => setChecking(false));
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

  if (loading || checking) {
    return <main className="page narrow"><section className="panel">Checking download access...</section></main>;
  }

  if (!configured) {
    return <main className="page narrow"><section className="panel notice error">Supabase is not configured for download access.</section></main>;
  }

  if (!user) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h1>Log in to download</h1>
          <p className="muted">Installer links are visible only to accounts with an active entitlement.</p>
          <Link className="button primary" to="/login?next=/download">Log in or create account</Link>
        </section>
      </main>
    );
  }

  if (!entitlement?.paid) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h1>Purchase required</h1>
          <p className="muted">Download links are gated for paid users. The desktop app still enforces activation after download.</p>
          {error ? <div className="notice error">{error}</div> : null}
          <button className="button primary" type="button" onClick={openPurchase}>Purchase desktop app</button>
        </section>
      </main>
    );
  }

  const stableUrl = links?.channels?.stable || "";
  const betaUrl = links?.channels?.beta || "";
  const canDownloadStable = entitlement.stableAccess;
  const canDownloadBeta = entitlement.betaAccess;

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Desktop installer</p>
        <h1>Download KANVAS</h1>
        <p className="muted">Request installer links from your account backend. Available channels follow your paid entitlement.</p>
        {entitlement.stableUpgradeEligible && !entitlement.stableAccess ? (
          <div className="notice">
            Your beta purchase is eligible for the R100 stable upgrade.
            <button className="link-button" type="button" onClick={openPurchase}>Open upgrade checkout</button>
          </div>
        ) : null}
        {error ? <div className="notice error">{error}</div> : null}
        <button className="button primary full" type="button" onClick={requestLinks} disabled={requesting}>
          {requesting ? "Requesting..." : links ? "Refresh download links" : "Request download links"}
        </button>
        {expiresAt ? <div className="notice success">Download links expire in {secondsLeft}s.</div> : null}
        <div className="download-list">
          {canDownloadStable ? (
            <a className={`button primary ${stableUrl ? "" : "disabled"}`} href={stableUrl || undefined} aria-disabled={!stableUrl}>
              <Download size={16} />
              Stable installer
            </a>
          ) : null}
          {canDownloadBeta ? (
            <a className={`button ${betaUrl ? "" : "disabled"}`} href={betaUrl || undefined} aria-disabled={!betaUrl}>
              <Download size={16} />
              Beta installer
            </a>
          ) : null}
        </div>
        {links && !stableUrl && !betaUrl ? <div className="notice">Download URLs are not configured yet.</div> : null}
      </section>
    </main>
  );
}
