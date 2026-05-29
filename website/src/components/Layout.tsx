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
          <span>KANVAS website demo: account, licensing, and a small browser trial only. Full projects stay in the desktop app.</span>
          <button className="warning-button" type="button" onClick={() => setPurchaseOpen(true)}>
            Purchase desktop
          </button>
        </div>
      ) : null}

      {showWebsiteChrome ? (
        <header className="site-header">
          <Link to="/" className="brand" aria-label="KANVAS home">
            <span className="brand-mark">K</span>
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
      <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    </>
  );
}
