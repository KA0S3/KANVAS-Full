import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { ConflictResolutionProvider } from "@/components/ConflictResolutionProvider";
import { useEffect, useState } from "react";
import { emergencySaveService } from "@/services/emergencySaveService";
import { useSyncStore } from "@/stores/syncStore";
import { syncProcessor } from "@/sync/processor";
import { USE_SUPABASE } from "@/config/features";
import { timedAssetSaver } from "@/services/TimedAssetSaver";
import { desktopAutosaveService } from "@/services/desktopAutosaveService";
import { useUndoKeyboard } from "@/hooks/useUndoKeyboard";
import { ProjectCacheLoadingIndicator } from "@/components/ProjectCacheLoadingIndicator";
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
  
  // Get sync store for new architecture
  const { setSyncStatus, initialize } = useSyncStore();
  
  // Initialize services on app mount
  useEffect(() => {
    // Clear broken sync entries and initialize sync store
    initialize();
    
    emergencySaveService.initialize();
    desktopAutosaveService.initialize();
    // NOTE: connectivityService heartbeat NOT started to prevent idle DB requests
    // It will be started on-demand when user interacts with the app

    // Initialize sync processor (replaces documentMutationService.setupAuthListener)
    if (USE_SUPABASE) {
      syncProcessor.start();
    }

    // Setup browser close warning for unsaved changes using sync processor
    const beforeUnloadHandler = () => {
      timedAssetSaver.flushAll().finally(() => {
        desktopAutosaveService.flush();
        if (USE_SUPABASE) {
          syncProcessor.forceProcess();
        }
      });
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    const visibilityChangeHandler = () => {
      if (document.visibilityState === 'hidden') {
        timedAssetSaver.flushAll().finally(() => {
          desktopAutosaveService.flush();
          if (USE_SUPABASE) {
            syncProcessor.forceProcess();
          }
        });
      }
    };
    document.addEventListener('visibilitychange', visibilityChangeHandler);

    return () => {
      // connectivityService.stopHeartbeat(); // Not started, no need to stop
      // Cleanup browser close warning on unmount
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
      if (USE_SUPABASE) {
        syncProcessor.stop();
      }
      desktopAutosaveService.dispose();
    };
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ConflictResolutionProvider>
        <Toaster />
        <Sonner />
        {/* Project cache loading indicator - global cache refresh status */}
        <div className="fixed top-4 right-4 z-50">
          <ProjectCacheLoadingIndicator />
        </div>
        {typeof window !== 'undefined' && (window.kanvasDesktop || window.location.protocol === 'file:') ? (
          <HashRouter>
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
          </HashRouter>
        ) : (
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
        )}
      </ConflictResolutionProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
