import { create } from "zustand";

export type LicenseState =
  | "licensed"
  | "development"
  | "needs_activation"
  | "activation_pending"
  | "offline_grace"
  | "expired"
  | "revoked"
  | "device_deactivated"
  | "channel_denied"
  | "backend_unavailable"
  | "invalid";

export type LicenseStatus = {
  state: LicenseState;
  isLicensed: boolean;
  canUseApp: boolean;
  message: string;
  userId?: string;
  licenseId?: string;
  deviceId?: string;
  deviceActivationId?: string;
  status?: string;
  channel: "beta" | "stable";
  allowedChannels?: Array<"beta" | "stable">;
  stableAvailable?: boolean;
  stableUpgradeEligible?: boolean;
  issuedAt?: string;
  expiresAt?: string;
  refreshAfter?: string;
  lastValidatedAt?: string;
  graceDaysRemaining?: number;
  activationUrl?: string;
  backendConfigured: boolean;
};

type LicenseStoreState = {
  status: LicenseStatus | null;
  loading: boolean;
  activating: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  startActivation: () => Promise<void>;
  heartbeat: (force?: boolean) => Promise<void>;
  clearLocalLicense: () => Promise<void>;
};

export const useLicenseStore = create<LicenseStoreState>((set, get) => ({
  status: null,
  loading: false,
  activating: false,
  error: null,

  initialize: async () => {
    if (!window.kanvasLicense || get().loading) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const status = await window.kanvasLicense.getStatus();
      set({ status, loading: false });

      window.kanvasLicense.onStatus((nextStatus) => {
        set({ status: nextStatus, activating: false, loading: false, error: null });
      });
      window.kanvasLicense.onError((error) => {
        set({ error: error.message, activating: false, loading: false });
      });

      if (status.canUseApp) {
        void get().heartbeat(false);
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to read license status",
      });
    }
  },

  refresh: async () => {
    if (!window.kanvasLicense) {
      return;
    }

    const status = await window.kanvasLicense.getStatus();
    set({ status });
  },

  startActivation: async () => {
    if (!window.kanvasLicense) {
      return;
    }

    set({ activating: true, error: null });
    try {
      const result = await window.kanvasLicense.startActivation();
      set({ status: result.status, activating: result.status.state === "activation_pending" });
    } catch (error) {
      set({
        activating: false,
        error: error instanceof Error ? error.message : "Unable to start activation",
      });
    }
  },

  heartbeat: async (force = false) => {
    if (!window.kanvasLicense) {
      return;
    }

    try {
      const status = await window.kanvasLicense.heartbeat({ force });
      set({ status });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "License validation failed" });
    }
  },

  clearLocalLicense: async () => {
    if (!window.kanvasLicense) {
      return;
    }

    const status = await window.kanvasLicense.clearLocalLicense();
    set({ status, activating: false });
  },
}));
