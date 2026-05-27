import { BETA_DOWNLOAD_URL, LICENSE_API_URL, STABLE_DOWNLOAD_URL } from "./config";
import type { DownloadChannel } from "../types/domain";

export type ActivationParams = {
  state: string;
  device_id: string;
  device_name?: string;
  platform?: string;
  app_version?: string;
  channel: DownloadChannel;
  redirect_uri: string;
};

export async function fetchDownloadAccess(accessToken: string) {
  const response = await fetch(`${LICENSE_API_URL}/desktop/download-access`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.ok) {
    return response.json();
  }

  if (response.status === 404 && (STABLE_DOWNLOAD_URL || BETA_DOWNLOAD_URL)) {
    return {
      channels: {
        stable: STABLE_DOWNLOAD_URL,
        beta: BETA_DOWNLOAD_URL,
      },
    };
  }

  throw new Error(`Download access failed with ${response.status}`);
}

export async function completeDesktopActivation(accessToken: string, params: ActivationParams) {
  const response = await fetch(`${LICENSE_API_URL}/desktop/activation/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Activation failed with ${response.status}`);
  }

  return response.json() as Promise<{ code: string; state?: string; redirect_uri?: string }>;
}
