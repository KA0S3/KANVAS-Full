export type LicenseChannel = "beta" | "stable";

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

export type LicenseTokenPayload = {
  user_id: string;
  license_id: string;
  device_id: string;
  device_activation_id: string;
  status: "active" | "past_due" | "cancelled" | "revoked" | "device_deactivated";
  allowed_channels: LicenseChannel[];
  issued_at: string;
  expires_at: string;
  refresh_after: string;
  last_validated_at: string;
  app_version: string;
  channel: LicenseChannel;
  stable_available?: boolean;
  stable_upgrade_eligible?: boolean;
};

export type PublicLicenseStatus = {
  state: LicenseState;
  isLicensed: boolean;
  canUseApp: boolean;
  message: string;
  userId?: string;
  licenseId?: string;
  deviceId?: string;
  deviceActivationId?: string;
  status?: LicenseTokenPayload["status"];
  channel: LicenseChannel;
  allowedChannels?: LicenseChannel[];
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

export type ActivationStartResult = {
  status: PublicLicenseStatus;
  activationUrl?: string;
  state?: string;
};

export type ActivationCompleteInput = {
  code: string;
  state: string;
};

export type ActivationSession = {
  state: string;
  createdAt: string;
  deviceId: string;
};

export type LicenseStoreSnapshot = {
  token?: string;
  deviceId?: string;
  activationSession?: ActivationSession;
  lastHeartbeatAttemptAt?: string;
};
