import { app, shell } from "electron";
import { randomBytes } from "node:crypto";

import { getDeviceMetadata, getOrCreateDeviceId } from "./deviceIdentity";
import { getLicenseChannel, channelAllowed, daysRemainingUntil, getGraceDeadline, isHeartbeatDue, verifyLicenseToken } from "./licenseToken";
import type { ActivationCompleteInput, ActivationStartResult, LicenseChannel, LicenseTokenPayload, PublicLicenseStatus } from "./licenseTypes";
import { LicenseStore } from "./licenseStore";

const DEFAULT_ACTIVATION_URL = "https://www.kanvas-it.com/desktop/activate";
const DEFAULT_LICENSE_API_URL = "https://hzngfqebklzhnwkcmgto.supabase.co/functions/v1";

type BackendTokenResponse = {
  license_token?: string;
  token?: string;
  available?: boolean;
  feed_url?: string;
  expires_at?: string;
  channel?: string;
  version?: string;
  error?: string;
  message?: string;
  reason?: string;
};

export type UpdateFeedAccess = {
  available: boolean;
  feedUrl?: string;
  expiresAt?: string;
  channel?: string;
  version?: string;
};

class LicenseBackendError extends Error {
  readonly status: number;
  readonly data: BackendTokenResponse;

  constructor(status: number, data: BackendTokenResponse) {
    super(data.message || data.error || `License backend returned ${status}`);
    this.status = status;
    this.data = data;
  }
}

export class LicenseService {
  private readonly store: LicenseStore;
  private readonly channel: LicenseChannel;
  private readonly activationBaseUrl?: string;
  private readonly backendBaseUrl?: string;

  constructor(userDataPath: string) {
    this.store = new LicenseStore(userDataPath);
    this.channel = getLicenseChannel(app.getVersion());
    this.activationBaseUrl = process.env.KANVAS_ACTIVATION_URL || DEFAULT_ACTIVATION_URL;
    this.backendBaseUrl = process.env.KANVAS_LICENSE_API_URL || DEFAULT_LICENSE_API_URL;
  }

  async getStatus(): Promise<PublicLicenseStatus> {
    if (!app.isPackaged && process.env.KANVAS_REQUIRE_LICENSE_IN_DEV !== "true") {
      const deviceId = await getOrCreateDeviceId(this.store);
      return this.status({
        state: "development",
        isLicensed: true,
        canUseApp: true,
        message: "Development build: desktop licensing is bypassed. Packaged builds require activation.",
        deviceId,
      });
    }

    const token = await this.store.getToken();
    if (!token) {
      return this.status({
        state: "needs_activation",
        isLicensed: false,
        canUseApp: false,
        message: "KANVAS needs activation before use. Sign in with the account used to purchase the desktop app.",
      });
    }

    try {
      return this.statusFromPayload(verifyLicenseToken(token).payload);
    } catch (error) {
      return this.status({
        state: "invalid",
        isLicensed: false,
        canUseApp: false,
        message: error instanceof Error ? error.message : "The local license token is invalid.",
      });
    }
  }

  async startActivation(): Promise<ActivationStartResult> {
    const deviceId = await getOrCreateDeviceId(this.store);
    const state = randomBytes(24).toString("base64url");
    await this.store.setActivationSession({
      state,
      createdAt: new Date().toISOString(),
      deviceId,
    });

    if (!this.activationBaseUrl) {
      return {
        state,
        status: this.status({
          state: "backend_unavailable",
          isLicensed: false,
          canUseApp: false,
          message: "Desktop activation is not configured yet. Set KANVAS_ACTIVATION_URL after the website is ready.",
          deviceId,
        }),
      };
    }

    const url = new URL(this.activationBaseUrl);
    const metadata = getDeviceMetadata(deviceId);
    url.searchParams.set("state", state);
    url.searchParams.set("device_id", metadata.device_id);
    url.searchParams.set("device_name", metadata.device_name);
    url.searchParams.set("platform", metadata.platform);
    url.searchParams.set("app_version", metadata.app_version);
    url.searchParams.set("channel", this.channel);
    url.searchParams.set("redirect_uri", "kanvas://activate");

    await shell.openExternal(url.toString());

    return {
      activationUrl: url.toString(),
      state,
      status: this.status({
        state: "activation_pending",
        isLicensed: false,
        canUseApp: false,
        message: "Activation opened in your browser. Finish signing in there, then return to KANVAS.",
        deviceId,
        activationUrl: url.toString(),
      }),
    };
  }

  async completeActivation(input: ActivationCompleteInput): Promise<PublicLicenseStatus> {
    if (!input || typeof input.code !== "string" || typeof input.state !== "string") {
      throw new Error("Activation completion requires code and state");
    }

    const session = await this.store.getActivationSession();
    if (!session || session.state !== input.state) {
      return this.status({
        state: "invalid",
        isLicensed: false,
        canUseApp: false,
        message: "Activation session could not be verified. Start activation again.",
      });
    }

    if (!this.backendBaseUrl) {
      return this.status({
        state: "backend_unavailable",
        isLicensed: false,
        canUseApp: false,
        message: "Desktop activation backend is not configured. Set KANVAS_LICENSE_API_URL after the backend is deployed.",
        deviceId: session.deviceId,
      });
    }

    const data = await this.postBackend("/desktop/activation/complete", {
      code: input.code,
      state: input.state,
      device_id: session.deviceId,
      channel: this.channel,
      app_version: app.getVersion(),
    });

    const token = data.license_token || data.token;
    if (!token) {
      throw new Error(data.message || data.error || "Activation did not return a license token");
    }

    const payload = verifyLicenseToken(token).payload;
    await this.store.setToken(token);
    await this.store.clearActivationSession();
    return this.statusFromPayload(payload);
  }

  async heartbeat(force = false): Promise<PublicLicenseStatus> {
    const current = await this.getStatus();
    if (!current.canUseApp || current.state === "development") {
      return current;
    }

    const token = await this.store.getToken();
    if (!token) {
      return current;
    }

    const payload = verifyLicenseToken(token).payload;
    if (!force && !isHeartbeatDue(payload)) {
      return current;
    }

    await this.store.setLastHeartbeatAttemptAt(new Date().toISOString());

    if (!this.backendBaseUrl) {
      return this.offlineGraceStatus(payload, "Desktop license backend is not configured. KANVAS will keep working during the offline grace period.");
    }

    try {
      const data = await this.postBackend("/desktop/license/heartbeat", {
        license_id: payload.license_id,
        device_id: payload.device_id,
        device_activation_id: payload.device_activation_id,
        channel: this.channel,
        app_version: app.getVersion(),
      });

      const nextToken = data.license_token || data.token;
      if (!nextToken) {
        throw new Error(data.message || data.error || "Heartbeat did not return a refreshed token");
      }

      const nextPayload = verifyLicenseToken(nextToken).payload;
      await this.store.setToken(nextToken);
      return this.statusFromPayload(nextPayload);
    } catch (error) {
      if (error instanceof LicenseBackendError && [402, 403, 409].includes(error.status)) {
        if (error.data.reason === "device_deactivated" || error.status === 409) {
          return this.statusFromPayloadBase({ ...payload, status: "device_deactivated" }, {
            state: "device_deactivated",
            isLicensed: false,
            canUseApp: false,
            message: "This device was signed out because your account is active on two newer devices. Sign in again to reactivate this device.",
          });
        }

        return this.statusFromPayloadBase({ ...payload, status: "revoked" }, {
          state: "revoked",
          isLicensed: false,
          canUseApp: false,
          message: "This license is no longer active. Renew or sign in with an active account to continue.",
        });
      }

      return this.offlineGraceStatus(
        payload,
        "License validation is temporarily unavailable. KANVAS will keep working during the offline grace period.",
      );
    }
  }

  async requestUpdateFeed(): Promise<UpdateFeedAccess> {
    const status = await this.heartbeat(true);
    if (!status.canUseApp || !status.licenseId || !status.deviceId || !status.deviceActivationId) {
      throw new Error(status.message || "A valid desktop license is required before checking for updates.");
    }

    const data = await this.postBackend("/desktop/update-check", {
      entitlement_id: status.licenseId,
      device_id: status.deviceId,
      device_activation_id: status.deviceActivationId,
      channel: this.channel,
      app_version: app.getVersion(),
    });

    return {
      available: Boolean(data.available),
      feedUrl: data.feed_url,
      expiresAt: data.expires_at,
      channel: data.channel,
      version: data.version,
    };
  }

  async clearLocalLicense(): Promise<PublicLicenseStatus> {
    await this.store.clearToken();
    await this.store.clearActivationSession();
    return this.getStatus();
  }

  private async postBackend(path: string, body: Record<string, unknown>): Promise<BackendTokenResponse> {
    if (!this.backendBaseUrl) {
      throw new Error("License backend is not configured");
    }

    const baseUrl = this.backendBaseUrl.endsWith("/") ? this.backendBaseUrl : `${this.backendBaseUrl}/`;
    const response = await fetch(new URL(path.replace(/^\/+/, ""), baseUrl).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new LicenseBackendError(response.status, data);
    }

    return data;
  }

  private statusFromPayload(payload: LicenseTokenPayload): PublicLicenseStatus {
    if (!channelAllowed(payload, this.channel)) {
      return this.statusFromPayloadBase(payload, {
        state: "channel_denied",
        isLicensed: false,
        canUseApp: false,
        message: "Your license does not include this release channel. Install the correct KANVAS version or update your entitlement.",
      });
    }

    if (payload.status === "revoked" || payload.status === "cancelled" || payload.status === "past_due") {
      return this.statusFromPayloadBase(payload, {
        state: "revoked",
        isLicensed: false,
        canUseApp: false,
        message: "This license is no longer active. Renew or sign in with an active account to continue.",
      });
    }

    if (payload.status === "device_deactivated") {
      return this.statusFromPayloadBase(payload, {
        state: "device_deactivated",
        isLicensed: false,
        canUseApp: false,
        message: "This device was signed out because your account is active on two newer devices. Sign in again to reactivate this device.",
      });
    }

    if (daysRemainingUntil(payload.expires_at) <= 0) {
      return this.statusFromPayloadBase(payload, {
        state: "expired",
        isLicensed: false,
        canUseApp: false,
        message: "License validation is required. Connect to the internet and sign in again. Your projects are safe and have not been changed.",
      });
    }

    return this.statusFromPayloadBase(payload, {
      state: "licensed",
      isLicensed: true,
      canUseApp: true,
      message: "KANVAS is activated on this device.",
    });
  }

  private offlineGraceStatus(payload: LicenseTokenPayload, message: string): PublicLicenseStatus {
    const graceDeadline = getGraceDeadline(payload);
    const graceDaysRemaining = daysRemainingUntil(graceDeadline.toISOString());
    if (graceDaysRemaining <= 0) {
      return this.statusFromPayloadBase(payload, {
        state: "expired",
        isLicensed: false,
        canUseApp: false,
        message: "License validation is required. Connect to the internet and sign in again. Your projects are safe and have not been changed.",
        graceDaysRemaining: 0,
      });
    }

    return this.statusFromPayloadBase(payload, {
      state: "offline_grace",
      isLicensed: true,
      canUseApp: true,
      message,
      graceDaysRemaining,
    });
  }

  private statusFromPayloadBase(
    payload: LicenseTokenPayload,
    base: Omit<PublicLicenseStatus, "channel" | "backendConfigured">,
  ): PublicLicenseStatus {
    return this.status({
      ...base,
      userId: payload.user_id,
      licenseId: payload.license_id,
      deviceId: payload.device_id,
      deviceActivationId: payload.device_activation_id,
      status: payload.status,
      allowedChannels: payload.allowed_channels,
      stableAvailable: payload.stable_available,
      stableUpgradeEligible: payload.stable_upgrade_eligible,
      issuedAt: payload.issued_at,
      expiresAt: payload.expires_at,
      refreshAfter: payload.refresh_after,
      lastValidatedAt: payload.last_validated_at,
    });
  }

  private status(input: Omit<PublicLicenseStatus, "channel" | "backendConfigured">): PublicLicenseStatus {
    return {
      ...input,
      channel: this.channel,
      backendConfigured: Boolean(this.activationBaseUrl && this.backendBaseUrl),
    };
  }
}
