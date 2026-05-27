import { Link } from "react-router-dom";
import { MonitorDown, Play } from "lucide-react";
import { usePurchaseOutlet } from "../components/usePurchaseOutlet";

export function HomePage() {
  const { openPurchase } = usePurchaseOutlet();

  return (
    <main className="hero-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">kanvas-it.com</p>
          <h1>KANVAS</h1>
          <p className="hero-subtitle">A local-first visual campaign manager for the desktop, with a tiny browser demo for testing the feel.</p>
          <div className="hero-actions">
            <Link className="button primary large" to="/demo">
              <Play size={18} />
              Test online demo
            </Link>
            <button className="button large" type="button" onClick={openPurchase}>
              <MonitorDown size={18} />
              Purchase desktop app
            </button>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="summary-grid">
          <article>
            <h2>Local-first desktop</h2>
            <p>Projects, assets, editor state, and autosaves belong on the user’s machine in the desktop app.</p>
          </article>
          <article>
            <h2>Website account portal</h2>
            <p>Supabase handles login, entitlement display, device activation, and download access.</p>
          </article>
          <article>
            <h2>Small online demo</h2>
            <p>The browser demo stores only limited trial data in IndexedDB and never syncs project content to Supabase.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
