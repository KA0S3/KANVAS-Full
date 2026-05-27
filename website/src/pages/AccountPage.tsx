import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";
import { fetchEntitlement } from "../lib/entitlements";
import type { EntitlementState } from "../types/domain";

export function AccountPage() {
  const { user, loading, configured, signOut } = useAuth();
  const { openPurchase } = usePurchaseOutlet();
  const [entitlement, setEntitlement] = useState<EntitlementState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user || !configured) {
      setEntitlement(null);
      return;
    }

    setChecking(true);
    setError(null);
    fetchEntitlement(user.id)
      .then(setEntitlement)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load account entitlement."))
      .finally(() => setChecking(false));
  }, [configured, user]);

  if (loading) {
    return <main className="page narrow"><section className="panel">Loading account...</section></main>;
  }

  if (!configured) {
    return <main className="page narrow"><section className="panel notice error">Supabase is not configured for this website.</section></main>;
  }

  if (!user) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h1>Log in to view your account</h1>
          <p className="muted">Your account controls purchase status, installer access, and desktop activation.</p>
          <Link className="button primary" to="/login">Log in or register</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-heading">
        <p className="eyebrow">Account</p>
        <h1>{user.email}</h1>
        <button className="link-button" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>

      <section className="account-grid">
        <article className="panel">
          <h2>License status</h2>
          {checking ? <p className="muted">Checking entitlement...</p> : null}
          {error ? <div className="notice error">{error}</div> : null}
          {!checking && entitlement?.paid ? (
            <>
              <div className="status paid">Paid</div>
              <p>Plan: {entitlement.license?.plan}</p>
              <p>Channels: {entitlement.license?.allowed_channels?.join(", ") || "stable"}</p>
              <Link className="button primary" to="/download">Open downloads</Link>
            </>
          ) : null}
          {!checking && entitlement && !entitlement.paid ? (
            <>
              <div className="status unpaid">Unpaid</div>
              <p className="muted">Purchase the desktop app to unlock installer download and activation.</p>
              <button className="button primary" type="button" onClick={openPurchase}>Purchase desktop app</button>
            </>
          ) : null}
        </article>

        <article className="panel">
          <h2>Active devices</h2>
          {entitlement?.devices.length ? (
            <div className="device-list">
              {entitlement.devices.map((device) => (
                <div key={device.id} className="device-row">
                  <strong>{device.device_name || device.device_id}</strong>
                  <span>{device.platform || "unknown"} · {device.channel}</span>
                  <small>Last seen: {device.last_seen_at || "not yet"}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No active desktop devices yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
