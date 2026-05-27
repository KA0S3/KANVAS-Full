export type LicenseStatus = "active" | "past_due" | "cancelled" | "revoked" | "refunded" | "trial";
export type LicensePlan = "beta" | "stable" | "lifetime" | "subscription" | "admin_grant";
export type DownloadChannel = "stable" | "beta";

export type Entitlement = {
  id: string;
  user_id: string;
  status: LicenseStatus;
  plan: LicensePlan;
  allowed_channels: DownloadChannel[];
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
  createdAt: string;
  updatedAt: string;
};

export type DemoAsset = {
  id: string;
  bookId: string;
  title: string;
  fileId?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
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
  devices: DeviceActivation[];
  paid: boolean;
};
