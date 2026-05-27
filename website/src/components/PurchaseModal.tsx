import { X } from "lucide-react";
import { useState } from "react";
import { PAYSTACK_PRODUCTS, type PaystackProductKey } from "../lib/config";
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

  if (!open) {
    return null;
  }

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
        <p className="eyebrow">Desktop license</p>
        <h2 id="purchase-title">Purchase KANVAS desktop</h2>
        <p className="muted">
          The website handles account and license access. The full app remains the local-first desktop download.
        </p>

        {!configured ? <div className="notice error">Supabase is not configured yet, so purchases cannot start.</div> : null}
        {configured && !user ? <div className="notice">Sign in or create an account before purchasing.</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <div className="pricing-grid">
          {Object.values(PAYSTACK_PRODUCTS).map((product) => (
            <article className="price-card" key={product.key}>
              <h3>{product.name}</h3>
              <strong>{product.priceLabel}</strong>
              <p>{product.description}</p>
              <button
                className="button primary"
                type="button"
                disabled={!configured || !user || loadingProduct !== null}
                onClick={() => handlePurchase(product.key)}
              >
                {loadingProduct === product.key ? "Starting..." : "Buy with Paystack"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
