import { HttpError } from "./common.ts";

export type LicensePayload = {
  user_id: string;
  license_id: string;
  entitlement_id: string;
  device_id: string;
  device_activation_id: string;
  status: string;
  allowed_channels: string[];
  issued_at: string;
  expires_at: string;
  refresh_after: string;
  last_validated_at: string;
  app_version: string;
  channel: string;
  stable_available?: boolean;
  stable_upgrade_eligible?: boolean;
};

const stableDownloadConfigured = (): boolean => {
  return String(Deno.env.get("STABLE_DESKTOP_AVAILABLE") ?? "false").toLowerCase() === "true";
};

const base64Url = (input: Uint8Array | string): string => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const addHours = (date: Date, hours: number): Date => new Date(date.getTime() + hours * 60 * 60 * 1000);

export const buildLicensePayload = (
  entitlement: any,
  activation: any,
  appVersion: string,
  channel: string,
): LicensePayload => {
  const now = new Date();
  return {
    user_id: entitlement.user_id,
    license_id: entitlement.id,
    entitlement_id: entitlement.id,
    device_id: activation.device_id,
    device_activation_id: activation.id,
    status: entitlement.status,
    allowed_channels: entitlement.allowed_channels ?? ["stable"],
    issued_at: now.toISOString(),
    expires_at: addDays(now, 14).toISOString(),
    refresh_after: addHours(now, 24).toISOString(),
    last_validated_at: now.toISOString(),
    app_version: appVersion || activation.app_version || "unknown",
    channel,
    stable_available: stableDownloadConfigured(),
    stable_upgrade_eligible: Boolean(entitlement.stable_upgrade_eligible),
  };
};

export const signLicenseToken = async (payload: LicensePayload): Promise<string> => {
  const jwkText = Deno.env.get("KANVAS_LICENSE_PRIVATE_JWK");
  if (!jwkText) throw new HttpError(500, "license_private_key_missing");

  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(jwkText),
    { name: "Ed25519" },
    false,
    ["sign"],
  );

  const header = { typ: "KANVAS_LICENSE", alg: "EdDSA" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signedData = `${encodedHeader}.${encodedPayload}`;
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(signedData)));
  return `${signedData}.${base64Url(signature)}`;
};
