import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { supabase } from "../lib/supabaseClient";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

function urlAuthError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return hash.get("error_description") || query.get("error_description") || hash.get("error") || query.get("error");
}

export function AuthCallbackPage() {
  const { configured, loading, user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [processingCallback, setProcessingCallback] = useState(false);
  const nextPath = useMemo(() => safeNextPath(searchParams.get("next")), [searchParams]);
  const authError = callbackError || urlAuthError();

  useEffect(() => {
    if (!loading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [loading, navigate, nextPath, user]);

  useEffect(() => {
    if (!configured || !supabase || loading || user || authError || processingCallback) {
      return;
    }

    const code = searchParams.get("code");
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (!code && (!accessToken || !refreshToken)) {
      return;
    }

    setProcessingCallback(true);
    const finishAuth = code
      ? supabase.auth.exchangeCodeForSession(code)
      : supabase.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });

    finishAuth
      .then(({ error }) => {
        if (error) {
          setCallbackError(error.message);
          return;
        }
        navigate(nextPath, { replace: true });
      })
      .catch((err) => setCallbackError(err instanceof Error ? err.message : "Unable to confirm this sign-in link."))
      .finally(() => setProcessingCallback(false));
  }, [authError, configured, loading, navigate, nextPath, processingCallback, searchParams, user]);

  if (!configured) {
    return (
      <main className="page narrow">
        <section className="panel notice error">Supabase is not configured for this website.</section>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="page narrow">
        <section className="panel">
          <p className="eyebrow">Account</p>
          <h1>Confirmation failed</h1>
          <div className="notice error">{authError}</div>
          <Link className="button primary" to="/login">
            Return to login
          </Link>
        </section>
      </main>
    );
  }

  if (loading || user || processingCallback) {
    return (
      <main className="page narrow">
        <section className="panel">
          <p className="eyebrow">Account</p>
          <h1>Confirming account</h1>
          <p className="muted">Completing your KANVAS sign-in...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Account</p>
        <h1>Confirmation link expired</h1>
        <p className="muted">Please log in again or request a fresh confirmation email.</p>
        <Link className="button primary" to="/login">
          Return to login
        </Link>
      </section>
    </main>
  );
}
