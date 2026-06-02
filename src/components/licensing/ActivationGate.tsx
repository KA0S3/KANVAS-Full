import { useEffect } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useLicenseStore } from "@/stores/licenseStore";
import { LicenseLockedView } from "./LicenseLockedView";

type ActivationGateProps = {
  children: ReactNode;
};

const isDesktopRuntime = () => {
  return typeof window !== "undefined" && Boolean(window.kanvasDesktop || window.kanvasLicense || window.location.protocol === "file:");
};

export function ActivationGate({ children }: ActivationGateProps) {
  const { status, loading, activating, error, initialize, refresh, startActivation } = useLicenseStore();

  useEffect(() => {
    if (isDesktopRuntime()) {
      void initialize();
    }
  }, [initialize]);

  if (!isDesktopRuntime()) {
    return <>{children}</>;
  }

  if (loading && !status) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking desktop license
        </div>
      </main>
    );
  }

  if (status?.canUseApp) {
    return <>{children}</>;
  }

  return (
    <LicenseLockedView
      status={status}
      activating={activating}
      error={error}
      onActivate={startActivation}
      onRefresh={refresh}
    />
  );
}
