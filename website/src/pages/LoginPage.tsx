import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";

export function LoginPage() {
  const { signIn, signInWithGoogle, signUp, configured, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedNext = searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        navigate(nextPath);
      } else {
        await signUp(email, password);
        setMessage("Check your email if confirmation is enabled, then return to sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await signInWithGoogle(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setLoading(false);
    }
  };

  if (user) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h1>You are signed in</h1>
          <p className="muted">{user.email}</p>
          <Link className="button primary" to={nextPath}>
            Continue
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Account</p>
        <h1>{mode === "login" ? "Log in" : "Create account"}</h1>
        <p className="muted">Use your KANVAS account for purchase status, download access, and desktop activation.</p>

        {!configured ? <div className="notice error">Supabase is not configured. Add website environment variables before using auth.</div> : null}
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <button className="button primary full" type="button" onClick={handleGoogle} disabled={!configured || loading}>
          Continue with Google
        </button>

        <div className="auth-divider">or use email</div>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} required />
          </label>
          <button className="button primary" type="submit" disabled={!configured || loading}>
            {loading ? "Working..." : mode === "login" ? "Log in" : "Create account"}
          </button>
          <label className="checkbox-row">
            <input type="checkbox" defaultChecked />
            Keep me signed in
          </label>
        </form>

        <button className="link-button" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}
