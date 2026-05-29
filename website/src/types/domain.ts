export type LicenseStatus = "active" | "past_due" | "cancelled" | "revoked" | "refunded" | "trial";
export type LicensePlan = "beta" | "stable" | "lifetime" | "subscription" | "admin_grant";
export type DownloadChannel = "stable" | "beta";

export type Entitlement = {
  id: string;
  user_id: string;
  status: LicenseStatus;
  plan: LicensePlan;
  allowed_channels: DownloadChannel[];
  product_key: string | null;
  stable_upgrade_eligible: boolean;
  expires_at: string | null;
  created_at: string;
};

export type DeviceActivation = {
  id: string;
  user_id: string;
  entitlement_id: string;
  device_id: string;
  device_name: string | null;
  platform: string | null;
  app_version: string | null;
  channel: DownloadChannel;
  first_activated_at: string;
  last_seen_at: string | null;
  deactivated_at: string | null;
};

export type DemoBook = {
  id: string;
  title: string;
  backgroundFileId?: string;
  backgroundMimeType?: string;
  backgroundSizeBytes?: number;
  createdAt: string;
  updatedAt: string;
};

export type DemoAsset = {
  id: string;
  bookId: string;
  parentId?: string;
  title: string;
  x: number;
  y: number;
  backgroundFileId?: string;
  backgroundMimeType?: string;
  backgroundSizeBytes?: number;
  fileId?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
};

export type DemoFile = {
  id: string;
  assetId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt: string;
};

export type EntitlementState = {
  license: Entitlement | null;
  licenses: Entitlement[];
  devices: DeviceActivation[];
  paid: boolean;
  betaAccess: boolean;
  stableAccess: boolean;
  stableUpgradeEligible: boolean;
};
