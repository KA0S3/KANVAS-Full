import { app, BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import { LicenseService } from "./licensing/licenseService";

type UpdateChannel = "beta" | "stable";
type UpdateState =
  | "idle"
  | "disabled"
  | "checking"
  | "no-update"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type KanvasUpdateStatus = {
  state: UpdateState;
  channel: UpdateChannel;
  currentVersion: string;
  availableVersion?: string;
  stableAvailable?: boolean;
  stableUpgradeEligible?: boolean;
  progress?: number;
  autoDownload: boolean;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  message: string;
};

const updateStatusChannel = "kanvas:update:status";

const getChannelFromVersion = (version: string): UpdateChannel => {
  return /-beta(?:\.|-|$)/i.test(version) ? "beta" : "stable";
};

const sanitizeError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message.split("\n")[0].slice(0, 240);
  }

  return "Update check failed.";
};

export class UpdateService {
  private windows = new Set<BrowserWindow>();
  private initialized = false;
  private downloaded = false;
  private readonly licenseService = new LicenseService(app.getPath("userData"));
  private status: KanvasUpdateStatus = {
    state: "idle",
    channel: getChannelFromVersion(app.getVersion()),
    currentVersion: app.getVersion(),
    autoDownload: false,
    canCheck: false,
    canDownload: false,
    canInstall: false,
    message: "Updater is starting.",
  };

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    const allowDevUpdater = process.env.KANVAS_UPDATER_DEV === "1";

    log.transports.file.level = "info";
    log.initialize({ preload: false });
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.channel = this.status.channel === "beta" ? "beta" : "latest";
    autoUpdater.allowPrerelease = this.status.channel === "beta";

    if (!app.isPackaged && !allowDevUpdater) {
      this.setStatus({
        state: "disabled",
        canCheck: false,
        message: "Updates are disabled in development builds.",
      });
      return;
    }

    this.setStatus({
      state: "idle",
      canCheck: true,
      message: this.status.channel === "beta"
        ? "Beta channel updates are available for this build."
        : "Stable channel updates are available for this build.",
    });

    autoUpdater.on("checking-for-update", () => {
      this.downloaded = false;
      this.setStatus({
        state: "checking",
        progress: undefined,
        canCheck: false,
        canDownload: false,
        canInstall: false,
        message: "Checking for updates.",
      });
    });

    autoUpdater.on("update-not-available", () => {
      this.downloaded = false;
      this.setStatus({
        state: "no-update",
        progress: undefined,
        canCheck: true,
        canDownload: false,
        canInstall: false,
        message: "KANVAS is up to date.",
      });
    });

    autoUpdater.on("update-available", (info) => {
      this.downloaded = false;
      this.setStatus({
        state: "available",
        availableVersion: info.version,
        progress: undefined,
        canCheck: true,
        canDownload: true,
        canInstall: false,
        message: `Update ${info.version} is available.`,
      });

      if (this.status.autoDownload) {
        void this.downloadUpdate();
      }
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setStatus({
        state: "downloading",
        progress: Math.round(progress.percent),
        canCheck: false,
        canDownload: false,
        canInstall: false,
        message: `Downloading update (${Math.round(progress.percent)}%).`,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.downloaded = true;
      this.setStatus({
        state: "downloaded",
        availableVersion: info.version,
        progress: 100,
        canCheck: true,
        canDownload: false,
        canInstall: true,
        message: "Update downloaded. Restart KANVAS to install it.",
      });
    });

    autoUpdater.on("error", (error) => {
      this.downloaded = false;
      this.setStatus({
        state: "error",
        progress: undefined,
        canCheck: true,
        canDownload: this.status.state === "available",
        canInstall: false,
        message: sanitizeError(error),
      });
    });
  }

  registerWindow(window: BrowserWindow): void {
    this.windows.add(window);
    window.on("closed", () => {
      this.windows.delete(window);
    });
    this.sendStatus(window);
  }

  registerIpcHandlers(): void {
    ipcMain.handle("kanvas:update:getStatus", () => this.status);
    ipcMain.handle("kanvas:update:check", async () => this.checkForUpdates());
    ipcMain.handle("kanvas:update:download", async () => this.downloadUpdate());
    ipcMain.handle("kanvas:update:install", () => this.installUpdate());
    ipcMain.handle("kanvas:update:setStableAvailability", (_event, input: {
      stableAvailable?: boolean;
      stableUpgradeEligible?: boolean;
    }) => {
      this.setStatus({
        stableAvailable: Boolean(input?.stableAvailable),
        stableUpgradeEligible: Boolean(input?.stableUpgradeEligible),
      });
      return this.status;
    });
    ipcMain.handle("kanvas:update:setAutoDownload", (_event, enabled: boolean) => {
      this.setStatus({
        autoDownload: Boolean(enabled),
        message: Boolean(enabled)
          ? "Auto-download is enabled for available updates."
          : "Auto-download is disabled.",
      });
      return this.status;
    });
  }

  private async checkForUpdates(): Promise<KanvasUpdateStatus> {
    if (!this.status.canCheck) {
      return this.status;
    }

    try {
      const updateAccess = await this.licenseService.requestUpdateFeed();
      if (!updateAccess.available || !updateAccess.feedUrl) {
        this.setStatus({
          state: "no-update",
          progress: undefined,
          canCheck: true,
          canDownload: false,
          canInstall: false,
          message: "No update feed is available for this release channel.",
        });
        return this.status;
      }

      autoUpdater.setFeedURL({
        provider: "generic",
        url: updateAccess.feedUrl,
        channel: this.status.channel === "beta" ? "beta" : "latest",
      });
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.downloaded = false;
      this.setStatus({
        state: "error",
        progress: undefined,
        canCheck: true,
        canDownload: false,
        canInstall: false,
        message: sanitizeError(error),
      });
    }

    return this.status;
  }

  private async downloadUpdate(): Promise<KanvasUpdateStatus> {
    if (!this.status.canDownload) {
      return this.status;
    }

    this.setStatus({
      state: "downloading",
      progress: 0,
      canCheck: false,
      canDownload: false,
      canInstall: false,
      message: "Downloading update.",
    });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.downloaded = false;
      this.setStatus({
        state: "error",
        progress: undefined,
        canCheck: true,
        canDownload: true,
        canInstall: false,
        message: sanitizeError(error),
      });
    }

    return this.status;
  }

  private installUpdate(): KanvasUpdateStatus {
    if (!this.downloaded || !this.status.canInstall) {
      return this.status;
    }

    autoUpdater.quitAndInstall(false, true);
    return this.status;
  }

  private setStatus(update: Partial<KanvasUpdateStatus>): void {
    this.status = {
      ...this.status,
      ...update,
      channel: getChannelFromVersion(app.getVersion()),
      currentVersion: app.getVersion(),
    };

    log.info("[updates]", this.status.state, this.status.message);
    for (const window of this.windows) {
      this.sendStatus(window);
    }
  }

  private sendStatus(window: BrowserWindow): void {
    if (!window.isDestroyed()) {
      window.webContents.send(updateStatusChannel, this.status);
    }
  }
}

export const updateService = new UpdateService();
