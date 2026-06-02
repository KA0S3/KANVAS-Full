import { app } from "electron";
import { randomUUID } from "node:crypto";
import os from "node:os";

import type { LicenseStore } from "./licenseStore";

export const getDeviceName = (): string => {
  const hostname = os.hostname().trim();
  return hostname || `${process.platform} device`;
};

export const getOrCreateDeviceId = async (store: LicenseStore): Promise<string> => {
  const existing = await store.getDeviceId();
  if (existing) {
    return existing;
  }

  const deviceId = `dev_${randomUUID()}`;
  await store.setDeviceId(deviceId);
  return deviceId;
};

export const getDeviceMetadata = (deviceId: string) => ({
  device_id: deviceId,
  device_name: getDeviceName(),
  platform: process.platform,
  app_version: app.getVersion(),
});
