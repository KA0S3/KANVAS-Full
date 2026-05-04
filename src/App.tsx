import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConflictResolutionProvider } from "@/components/ConflictResolutionProvider";
import { RateLimitWarning } from "@/components/ui/rate-limit-warning";
import { useEffect, useState } from "react";
import { emergencySaveService } from "@/services/emergencySaveService";
import { connectivityService } from "@/services/connectivityService";
import { documentMutationService } from "@/services/DocumentMutationService";
import { useUndoKeyboard } from "@/hooks/useUndoKeyboard";
import { useAuthStore } from "@/stores/authStore";
import Index from "./pages/Index";
import AuthConfirm from "./pages/AuthConfirm";
import AuthCallback from "./pages/AuthCallback";
import AuthResetPassword from "./pages/AuthResetPassword";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import RefundPolicy from "./pages/RefundPolicy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Initialize undo keyboard shortcuts
  useUndoKeyboard();
  
  // Get auth state for rate limiting
  const { user } = useAuthStore();
  
  // Initialize services on app mount
  useEffect(() => {
    emergencySaveService.initialize();
    // NOTE: connectivityService heartbeat NOT started to prevent idle DB requests
    // It will be started on-demand when user interacts with the app

    // Phase 3: Setup auth listener for token refresh and sign-out handling
    documentMutationService.setupAuthListener();

    // Phase 3: Setup browser close warning for unsaved changes
    documentMutationService.setupBeforeUnloadHandler();

    return () => {
      // connectivityService.stopHeartbeat(); // Not started, no need to stop
      // Cleanup browser close warning on unmount
      documentMutationService.removeBeforeUnloadHandler();
    };
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ConflictResolutionProvider>
        <Toaster />
        <Sonner />
        {/* Rate limit warning component - only show when user is authenticated */}
        {user && <RateLimitWarning userId={user.id} />}
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<AuthResetPassword />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ConflictResolutionProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
