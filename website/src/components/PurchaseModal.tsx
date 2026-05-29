import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { centsToRand, formatRandPrice, PAYSTACK_PRODUCTS, type PaystackProductKey } from "../lib/config";
import { fetchEntitlement } from "../lib/entitlements";
import { startPurchase } from "../lib/paymentClient";
import { useAuth } from "./AuthProvider";

type PurchaseModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PurchaseModal({ open, onClose }: PurchaseModalProps) {
  const { user, configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingProduct, setLoadingProduct] = useState<PaystackProductKey | null>(null);
  const [stableUpgradeEligible, setStableUpgradeEligible] = useState(false);
  const [stableAccess, setStableAccess] = useState(false);
  const [checkingEntitlement, setCheckingEntitlement] = useState(false);

  useEffect(() => {
    if (!open || !user || !configured) {
      setStableUpgradeEligible(false);
      setStableAccess(false);
      return;
    }

    setCheckingEntitlement(true);
    fetchEntitlement(user.id)
      .then((state) => {
        setStableUpgradeEligible(state.stableUpgradeEligible);
        setStableAccess(state.stableAccess);
      })
      .catch(() => {
        setStableUpgradeEligible(false);
        setStableAccess(false);
      })
      .finally(() => setCheckingEntitlement(false));
  }, [configured, open, user]);

  if (!open) {
    return null;
  }

  const betaProduct = PAYSTACK_PRODUCTS.BETA_ACCESS;
  const upgradeProduct = PAYSTACK_PRODUCTS.BETA_TO_STABLE_UPGRADE;
  const stableProduct = PAYSTACK_PRODUCTS.STABLE_FULL;
  const betaPrice = formatRandPrice(centsToRand(betaProduct.amount));
  const upgradePrice = formatRandPrice(centsToRand(upgradeProduct.amount));
  const stablePrice = formatRandPrice(centsToRand(stableProduct.amount));

  const handlePurchase = async (key: PaystackProductKey) => {
    setError(null);
    setLoadingProduct(key);
    try {
      await startPurchase(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start purchase.");
      setLoadingProduct(null);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close purchase modal">
          <X size={18} />
        </button>
        <p className="eyebrow">Beta desktop license</p>
        <h2 id="purchase-title">Purchase KANVAS beta</h2>
        <p className="muted">
          KANVAS is a one-time purchase app currently in beta. This checkout unlocks beta desktop access for your account.
        </p>

        {!configured ? <div className="notice error">Supabase is not configured yet, so purchases cannot start.</div> : null}
        {configured && !user ? (
          <div className="notice">
            Sign in or create an account before purchasing. <Link className="inline-link" to="/login?next=/download" onClick={onClose}>Open login</Link>
          </div>
        ) : null}
        {error ? <div className="notice error">{error}</div> : null}

        <div className="pricing-grid beta-pricing-grid">
          <article className="price-card beta-price-card">
            <h3>{betaProduct.name}</h3>
            <strong>{betaPrice} once</strong>
            <p>{betaProduct.description} Pay once now with no recurring billing.</p>
            <button
              className="button primary full"
              type="button"
              disabled={!configured || !user || loadingProduct !== null}
              onClick={() => handlePurchase(betaProduct.key)}
            >
              {loadingProduct === betaProduct.key ? "Starting..." : `Buy beta access - ${betaPrice}`}
            </button>
          </article>

          <article className="price-card beta-price-card">
            <h3>{upgradeProduct.name}</h3>
            <strong>{upgradePrice} once</strong>
            <p>{upgradeProduct.description}</p>
            {!checkingEntitlement && user && stableAccess ? (
              <p className="muted">Your account already has stable access.</p>
            ) : null}
            {!checkingEntitlement && user && !stableAccess && !stableUpgradeEligible ? (
              <p className="muted">Available after your account has bought beta access.</p>
            ) : null}
            <button
              className="button primary full"
              type="button"
              disabled={!configured || !user || stableAccess || !stableUpgradeEligible || loadingProduct !== null}
              onClick={() => handlePurchase(upgradeProduct.key)}
            >
              {loadingProduct === upgradeProduct.key ? "Starting..." : `Upgrade to stable - ${upgradePrice}`}
            </button>
          </article>

          <article className="price-card beta-price-card">
            <h3>{stableProduct.name}</h3>
            <strong>{stablePrice} once</strong>
            <p>{stableProduct.description} This is not a subscription.</p>
            <button
              className="button primary full"
              type="button"
              disabled={!configured || !user || stableAccess || loadingProduct !== null}
              onClick={() => handlePurchase(stableProduct.key)}
            >
              {stableAccess ? "Stable access active" : loadingProduct === stableProduct.key ? "Starting..." : `Buy stable - ${stablePrice}`}
            </button>
          </article>

          <aside className="beta-purchase-note" aria-label="Beta purchase terms">
            <h3>One-time licensing</h3>
            <p>
              Buy beta access now for {betaPrice}. When the stable full app is released, your account will be eligible to upgrade for {upgradePrice}.
            </p>
            <p>
              The stable release price for new buyers is {stablePrice}, so beta buyers pay {formatRandPrice(centsToRand(betaProduct.amount + upgradeProduct.amount))} total instead.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
