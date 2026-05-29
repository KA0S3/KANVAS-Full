import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/AccountPage";
import { ActivationPage } from "./pages/ActivationPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { DemoPage } from "./pages/DemoPage";
import { DownloadPage } from "./pages/DownloadPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PaymentCancelledPage, PaymentSuccessPage } from "./pages/PaymentPages";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/oauth/consent" element={<AuthCallbackPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/payment-success" element={<PaymentSuccessPage />} />
          <Route path="/payment/cancelled" element={<PaymentCancelledPage />} />
          <Route path="/desktop/activate" element={<ActivationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
