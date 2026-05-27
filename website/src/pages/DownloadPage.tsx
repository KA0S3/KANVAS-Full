import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { useAuth } from "../components/AuthProvider";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";
import { fetchEntitlement } from "../lib/entitlements";
import { BETA_DOWNLOAD_URL, STABLE_DOWNLOAD_URL } from "../lib/config";
import { fetchDownloadAccess } from "../lib/licenseApi";

type DownloadLinks = {
  channels?: {
    stable?: string;
    beta?: string;
  };
};

export function DownloadPage() {
  const { user, session, loading, configured } = useAuth();
  const { openPurchase } = usePurchaseOutlet();
  const [paid, setPaid] = useState(false);
  const [links, setLinks] = useState<DownloadLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user || !session || !configured) return;

    setChecking(true);
    setError(null);
    fetchEntitlement(user.id)
      .then(async (state) => {
        setPaid(state.paid);
        if (state.paid) {
          try {
            setLinks(await fetchDownloadAccess(session.access_token));
          } catch {
            setLinks({
              channels: {
                stable: STABLE_DOWNLOAD_URL,
                beta: BETA_DOWNLOAD_URL,
              },
            });
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to check download access."))
      .finally(() => setChecking(false));
  }, [configured, session, user]);

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
          <Link className="button primary" to="/login">Log in</Link>
        </section>
      </main>
    );
  }

  if (!paid) {
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

  const stableUrl = links?.channels?.stable || STABLE_DOWNLOAD_URL;
  const betaUrl = links?.channels?.beta || BETA_DOWNLOAD_URL;

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Desktop installer</p>
        <h1>Download KANVAS</h1>
        <p className="muted">Installer URLs are convenience links. Activation remains required in the desktop app.</p>
        {error ? <div className="notice error">{error}</div> : null}
        <div className="download-list">
          <a className={`button primary ${stableUrl ? "" : "disabled"}`} href={stableUrl || undefined} aria-disabled={!stableUrl}>
            <Download size={16} />
            Stable installer
          </a>
          <a className={`button ${betaUrl ? "" : "disabled"}`} href={betaUrl || undefined} aria-disabled={!betaUrl}>
            <Download size={16} />
            Beta installer
          </a>
        </div>
        {!stableUrl && !betaUrl ? <div className="notice">Download URLs are not configured yet.</div> : null}
      </section>
    </main>
  );
}
