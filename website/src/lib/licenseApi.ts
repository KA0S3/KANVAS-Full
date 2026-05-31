import { LICENSE_API_URL } from "./config";
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
  throw new Error(`Download access failed with ${response.status}`);
}

export async function redeemAccessCode(accessToken: string, code: string) {
  const response = await fetch(`${LICENSE_API_URL}/redeem-key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key: code }),
  });

  if (response.ok) {
    return response.json();
  }

  const payload = await response.json().catch(() => ({}));
  const message = typeof payload.error === "string" ? payload.error : `Promo code failed with ${response.status}`;
  throw new Error(message.replace(/_/g, " "));
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
