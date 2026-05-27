import { Link } from "react-router-dom";

export function PaymentSuccessPage() {
  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Payment</p>
        <h1>Payment received</h1>
        <p className="muted">Your entitlement may take a moment to appear while the payment webhook finishes processing.</p>
        <div className="actions-row">
          <Link className="button primary" to="/account">
            Check account
          </Link>
          <Link className="button" to="/download">
            Download
          </Link>
        </div>
      </section>
    </main>
  );
}

export function PaymentCancelledPage() {
  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">Payment</p>
        <h1>Payment cancelled</h1>
        <p className="muted">No license changes were made. You can restart checkout from the purchase button.</p>
        <Link className="button primary" to="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
