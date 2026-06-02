import { AlertTriangle, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LicenseStatus } from "@/stores/licenseStore";
import { DeviceLimitNotice } from "./DeviceLimitNotice";

type LicenseLockedViewProps = {
  status: LicenseStatus | null;
  activating: boolean;
  error: string | null;
  onActivate: () => void;
  onRefresh: () => void;
};

export function LicenseLockedView({ status, activating, error, onActivate, onRefresh }: LicenseLockedViewProps) {
  const isDeviceLimit = status?.state === "device_deactivated";
  const message = status?.message || "KANVAS needs activation before use. Sign in with the account used to purchase the desktop app.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl space-y-6">
        <div className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-200">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-normal">Activate KANVAS</h1>
            <p className="text-base leading-7 text-slate-300">{message}</p>
          </div>
        </div>

        {status?.state === "backend_unavailable" && (
          <div className="rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            The desktop licensing shell is installed, but the website/backend activation endpoints are not configured yet.
          </div>
        )}

        {status?.state === "expired" && (
          <div className="rounded-md border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            Internet validation is required. This lock does not delete or modify local project folders.
          </div>
        )}

        <DeviceLimitNotice visible={isDeviceLimit} />

        {error && (
          <div className="flex items-start gap-3 rounded-md border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={onActivate} disabled={activating} className="gap-2">
            {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {activating ? "Waiting for browser" : "Sign in to activate"}
          </Button>
          <Button type="button" variant="outline" onClick={onRefresh} className="gap-2 border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" />
            Check again
          </Button>
        </div>
      </section>
    </main>
  );
}
