import { Link, NavLink, Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { MonitorDown, User } from "lucide-react";
import { useState } from "react";
import { PurchaseModal } from "./PurchaseModal";
import { useAuth } from "./AuthProvider";

export function Layout() {
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const { user, loading } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isDemo = location.pathname === "/demo";
  const showWebsiteChrome = !isHome && !isDemo;

  return (
    <>
      {showWebsiteChrome ? (
        <div className="demo-warning">
          <span>KANVAS is currently in beta. Beta supporters get a 30% discount on the full app.</span>
        </div>
      ) : null}

      {showWebsiteChrome ? (
        <header className="site-header">
          <Link to="/" className="brand" aria-label="KANVAS home">
            <img className="brand-mark" src="/KANVAS-LOGO-F3.png" alt="" aria-hidden="true" />
            <span>KANVAS</span>
          </Link>
          <nav aria-label="Primary navigation">
            <NavLink to="/demo">Demo</NavLink>
            <NavLink to="/download">Download</NavLink>
            <NavLink to="/account">
              <User size={16} />
              {loading ? "Account" : user ? "Account" : "Login"}
            </NavLink>
          </nav>
          <button className="button compact" type="button" onClick={() => setPurchaseOpen(true)}>
            <MonitorDown size={16} />
            Purchase
          </button>
        </header>
      ) : null}

      <Outlet context={{ openPurchase: () => setPurchaseOpen(true) }} />
      <footer className="legal-banner" aria-label="Legal notices">
        <p>
          By using KANVAS or starting checkout, you agree to the{" "}
          <Link to="/terms-of-service">Terms & Conditions</Link>,{" "}
          <Link to="/privacy-policy">Privacy Policy</Link>, and{" "}
          <Link to="/refund-policy">Refund Policy</Link>.
        </p>
      </footer>
      <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    </>
  );
}
