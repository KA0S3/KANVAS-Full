import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatProductPrice, formatProductPriceDisplay, PAYSTACK_PRODUCTS, type PaystackProductKey } from "../lib/config";
import { startPurchase } from "../lib/paymentClient";
import { getApproximatePricing, type ApproximatePricing } from "../lib/pricingClient";
import { useAuth } from "./AuthProvider";

type PurchaseModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PurchaseModal({ open, onClose }: PurchaseModalProps) {
  const { user, configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingProduct, setLoadingProduct] = useState<PaystackProductKey | null>(null);
  const [approximatePricing, setApproximatePricing] = useState<ApproximatePricing | null>(null);
  const [showOriginalCurrency, setShowOriginalCurrency] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    void getApproximatePricing().then((pricing) => {
      if (active) {
        setApproximatePricing(pricing);
        setShowOriginalCurrency(false);
      }
    });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const betaProduct = PAYSTACK_PRODUCTS.BETA_ACCESS;
  const upgradeProduct = PAYSTACK_PRODUCTS.BETA_TO_STABLE_UPGRADE;
  const stableProduct = PAYSTACK_PRODUCTS.STABLE_FULL;
  const betaPrice = formatProductPrice(betaProduct.amount, betaProduct.currency);
  const upgradePrice = formatProductPrice(upgradeProduct.amount, upgradeProduct.currency);
  const betaSupporterTotal = formatProductPrice(betaProduct.amount + upgradeProduct.amount, betaProduct.currency);
  const betaPriceDisplay = formatProductPriceDisplay(betaProduct.amount, betaProduct.currency);
  const upgradePriceDisplay = formatProductPriceDisplay(upgradeProduct.amount, upgradeProduct.currency);
  const stablePriceDisplay = formatProductPriceDisplay(stableProduct.amount, stableProduct.currency);
  const betaSupporterTotalDisplay = formatProductPriceDisplay(betaProduct.amount + upgradeProduct.amount, betaProduct.currency);
  const approximateBetaPrice = approximatePricing?.products.BETA_ACCESS;
  const approximateUpgradePrice = approximatePricing?.products.BETA_TO_STABLE_UPGRADE;
  const approximateStablePrice = approximatePricing?.products.STABLE_FULL;
  const approximateBetaSupporterTotal = approximatePricing?.betaSupporterTotal;
  const approximateCurrency = approximatePricing?.currency;
  const showEstimate = !showOriginalCurrency
    && Boolean(approximateCurrency && approximateBetaPrice && approximateUpgradePrice && approximateStablePrice && approximateBetaSupporterTotal);
  const shownBetaText = showEstimate && approximateBetaPrice ? approximateBetaPrice : betaPriceDisplay.text;
  const shownUpgradeText = showEstimate && approximateUpgradePrice ? approximateUpgradePrice : upgradePriceDisplay.text;
  const shownStableText = showEstimate && approximateStablePrice ? approximateStablePrice : stablePriceDisplay.text;
  const shownBetaSupporterTotalText = showEstimate && approximateBetaSupporterTotal ? approximateBetaSupporterTotal : betaSupporterTotalDisplay.text;
  const shownCurrency = showEstimate && approximateCurrency ? approximateCurrency : betaPriceDisplay.currency;

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
      <section className="modal purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close purchase modal">
          <X size={18} />
        </button>
        <header className="purchase-modal-header">
          <p className="eyebrow">Beta desktop license</p>
          <h2 id="purchase-title">KANVAS beta access</h2>
        </header>

        {!configured ? <div className="notice error">Supabase is not configured yet, so purchases cannot start.</div> : null}
        {configured && !user ? (
          <div className="notice">
            Sign in or create an account before purchasing. <Link className="inline-link" to="/login?next=/download" onClick={onClose}>Open login</Link>
          </div>
        ) : null}
        {error ? <div className="notice error">{error}</div> : null}
        {approximatePricing ? (
          <div className="purchase-currency-note">
            <span>Approximate {approximatePricing.currency} prices shown for reference. Checkout is charged in ZAR.</span>
            <button type="button" onClick={() => setShowOriginalCurrency((current) => !current)}>
              {showOriginalCurrency ? "Show estimate" : "Show ZAR"}
            </button>
          </div>
        ) : null}

        <div className="pricing-grid beta-pricing-grid">
          <article className="price-card beta-price-card">
            <p className="purchase-kicker">Buy during beta</p>
            <strong className="purchase-price">
              {shownBetaText}
              <span>{shownCurrency}</span>
            </strong>
            {showEstimate ? <p className="purchase-original-price">Charged as {betaPrice}</p> : null}
            <h3>ONE TIME PURCHASE</h3>
            <p className="purchase-once-line">Price once. No subscription. No recurring billing.</p>
            <p className="purchase-upgrade-line">+ {shownUpgradeText} {showEstimate ? approximateCurrency : upgradeProduct.currency} once for the stable release upgrade later.</p>
            <button
              className="button primary full"
              type="button"
              disabled={!configured || !user || loadingProduct !== null}
              onClick={() => handlePurchase(betaProduct.key)}
            >
              {loadingProduct === betaProduct.key ? "Starting..." : `Buy beta access - ${betaPrice}`}
            </button>
          </article>

          <aside className="beta-purchase-note" aria-label="Beta purchase terms">
            <div className="purchase-total">
              <div className="purchase-equation" aria-label={`${betaPrice} plus ${upgradePrice} equals ${betaSupporterTotal}`}>
                <span>{shownBetaText} <small>{shownCurrency}</small></span>
                <span>+</span>
                <span>{shownUpgradeText} <small>{shownCurrency}</small></span>
              </div>
              <div className="purchase-result">
                <span className="purchase-equals">=</span>
                <strong>
                  {shownBetaSupporterTotalText}
                  <span>{shownCurrency}</span>
                </strong>
              </div>
              <small className="purchase-total-label">Beta supporter total</small>
            </div>
            <div className="purchase-vs">
              <p><span>Full version price</span> <s>{shownStableText} <small>{shownCurrency}</small></s></p>
              <strong>SAVE 30%</strong>
              <small>by supporting us in beta</small>
            </div>
          </aside>
        </div>

        <div className="purchase-legal">
          <p>
            Review the{" "}
            <Link to="/terms-of-service" onClick={onClose}>Terms & Conditions</Link>,{" "}
            <Link to="/privacy-policy" onClick={onClose}>Privacy Policy</Link>, and{" "}
            <Link to="/refund-policy" onClick={onClose}>Refund Policy</Link> before purchase.
          </p>
        </div>
      </section>
    </div>
  );
}
