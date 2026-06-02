import { createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";

import type { LicenseChannel, LicenseTokenPayload } from "./licenseTypes";

const LICENSE_GRACE_DAYS = 14;

const bundledPublicKeyPem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3jetBEwy5Q4LLNW6+ZE9PBtZtZhn+tXl5PYhoyijsjY=
-----END PUBLIC KEY-----`;

export type VerifiedLicenseToken = {
  payload: LicenseTokenPayload;
};

const base64UrlDecode = (value: string): Buffer => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

const parseToken = (token: string): { payload: LicenseTokenPayload; signedData: Buffer; signature: Buffer } => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("License token must use compact signed format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
  if (header?.typ !== "KANVAS_LICENSE" || header?.alg !== "EdDSA") {
    throw new Error("Unsupported license token header");
  }

  return {
    payload: JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")),
    signedData: Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
    signature: base64UrlDecode(encodedSignature),
  };
};

const getPublicKeyPem = (): string => {
  return process.env.KANVAS_LICENSE_PUBLIC_KEY_PEM || bundledPublicKeyPem;
};

export const verifyLicenseToken = (token: string): VerifiedLicenseToken => {
  const publicKeyPem = getPublicKeyPem();
  if (!publicKeyPem.trim()) {
    throw new Error("License public key is not configured");
  }

  const parsed = parseToken(token);
  const publicKey = createPublicKey(publicKeyPem);
  const ok = verifySignature(null, parsed.signedData, publicKey, parsed.signature);

  if (!ok || !timingSafeEqual(Buffer.from([1]), Buffer.from([ok ? 1 : 0]))) {
    throw new Error("License token signature is invalid");
  }

  validatePayloadShape(parsed.payload);
  return { payload: parsed.payload };
};

export const validatePayloadShape = (payload: LicenseTokenPayload): void => {
  const requiredStrings: Array<keyof LicenseTokenPayload> = [
    "user_id",
    "license_id",
    "device_id",
    "device_activation_id",
    "issued_at",
    "expires_at",
    "refresh_after",
    "last_validated_at",
    "app_version",
    "channel",
  ];

  for (const key of requiredStrings) {
    if (typeof payload[key] !== "string" || !payload[key]) {
      throw new Error(`License token is missing ${key}`);
    }
  }

  if (!["active", "past_due", "cancelled", "revoked", "device_deactivated"].includes(payload.status)) {
    throw new Error("License token status is invalid");
  }

  if (!Array.isArray(payload.allowed_channels) || payload.allowed_channels.length === 0) {
    throw new Error("License token must include allowed channels");
  }
};

export const getLicenseChannel = (version: string): LicenseChannel => {
  return /-beta\.\d+$/i.test(version) ? "beta" : "stable";
};

export const daysRemainingUntil = (iso: string, now = new Date()): number => {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) {
    return 0;
  }

  return Math.max(0, Math.ceil((target - now.getTime()) / 86_400_000));
};

export const getGraceDeadline = (payload: LicenseTokenPayload): Date => {
  const lastValidated = new Date(payload.last_validated_at);
  const baseTime = Number.isFinite(lastValidated.getTime()) ? lastValidated.getTime() : Date.now();
  return new Date(baseTime + LICENSE_GRACE_DAYS * 86_400_000);
};

export const isHeartbeatDue = (payload: LicenseTokenPayload, now = new Date()): boolean => {
  return new Date(payload.refresh_after).getTime() <= now.getTime();
};

export const channelAllowed = (payload: LicenseTokenPayload, channel: LicenseChannel): boolean => {
  return payload.allowed_channels.includes(channel) && payload.channel === channel;
};
