import { useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";

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
  const nextPath = useMemo(() => safeNextPath(searchParams.get("next")), [searchParams]);
  const authError = urlAuthError();

  useEffect(() => {
    if (!loading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [loading, navigate, nextPath, user]);

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

  if (loading || user) {
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
