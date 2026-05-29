import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";
import { fetchEntitlement, hasChannelAccess } from "../lib/entitlements";
import { completeDesktopActivation, type ActivationParams } from "../lib/licenseApi";

export function ActivationPage() {
  const [searchParams] = useSearchParams();
  const { user, session, loading, configured } = useAuth();
  const { openPurchase } = usePurchaseOutlet();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activationParams = useMemo<ActivationParams | null>(() => {
    const state = searchParams.get("state");
    const deviceId = searchParams.get("device_id");
    if (!state || !deviceId) {
      return null;
    }

    return {
      state,
      device_id: deviceId,
      device_name: searchParams.get("device_name") || undefined,
      platform: searchParams.get("platform") || undefined,
      app_version: searchParams.get("app_version") || undefined,
      channel: searchParams.get("channel") === "beta" ? "beta" : "stable",
      redirect_uri: searchParams.get("redirect_uri") || "kanvas://activate",
    };
  }, [searchParams]);

  const handleActivate = async () => {
    if (!user || !session || !activationParams) return;
    setError(null);
    setStatus("Checking entitlement...");

    try {
      const entitlement = await fetchEntitlement(user.id);
      if (!hasChannelAccess(entitlement, activationParams.channel)) {
        setStatus(null);
        openPurchase();
        return;
      }

      setStatus("Approving this desktop device...");
      const result = await completeDesktopActivation(session.access_token, activationParams);
      const redirectUri = result.redirect_uri || activationParams.redirect_uri;
      const state = result.state || activationParams.state;
      if (!result.code) {
        throw new Error("Activation backend did not return an activation code.");
      }

      window.location.assign(`${redirectUri}?code=${encodeURIComponent(result.code)}&state=${encodeURIComponent(state)}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Unable to complete desktop activation.");
    }
  };

  if (loading) {
    return <main className="page narrow"><section className="panel">Loading activation...</section></main>;
  }

  if (!activationParams) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h1>Invalid activation link</h1>
          <p className="muted">Open activation from the KANVAS desktop app so device parameters are included.</p>
        </section>
      </main>
    );
  }

  if (!configured) {
    return <main className="page narrow"><section className="panel notice error">Supabase is not configured for activation.</section></main>;
  }

  if (!user) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h1>Log in to activate desktop</h1>
          <p className="muted">After login, return to this activation link to approve the device.</p>
          <Link className="button primary" to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Log in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Desktop activation</p>
        <h1>Approve this device</h1>
        <div className="device-row">
          <strong>{activationParams.device_name || activationParams.device_id}</strong>
          <span>{activationParams.platform || "unknown"} · {activationParams.channel}</span>
          <small>App version: {activationParams.app_version || "unknown"}</small>
        </div>
        {status ? <div className="notice">{status}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        <button className="button primary" type="button" onClick={handleActivate}>Activate desktop app</button>
      </section>
    </main>
  );
}
