/// <reference types="vite/client" />

interface KanvasAppInfo {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
  appPath: string;
  userDataPath: string;
  rendererSource: string;
  rendererEntry: string;
}

interface KanvasDesktopWarning {
  code: string;
  message: string;
  path?: string;
}

interface KanvasDesktopProjectEntry {
  folderName: string;
  projectId?: string;
  projectName?: string;
  updatedAt?: string;
  warnings: KanvasDesktopWarning[];
}

type KanvasDesktopConflictAction = 'keep_both' | 'replace' | 'cancel';

interface KanvasDesktopImportConflict {
  incomingFolderName: string;
  incomingProjectId?: string;
  incomingProjectName?: string;
  existingFolderName: string;
  existingProjectId?: string;
  reason: 'project_id' | 'folder_name';
}

interface KanvasDesktopImportedProject {
  folderName: string;
  folderPath?: string;
  warnings?: KanvasDesktopWarning[];
  usesLegacyProjectJson?: boolean;
  replaced?: boolean;
}

interface KanvasDesktopImportResult {
  canceled: boolean;
  sourcePath?: string;
  needsConflictResolution?: boolean;
  conflicts?: KanvasDesktopImportConflict[];
  imported?: KanvasDesktopImportedProject[];
}

type KanvasUpdateChannel = 'beta' | 'stable';
type KanvasUpdateState =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'no-update'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface KanvasUpdateStatus {
  state: KanvasUpdateState;
  channel: KanvasUpdateChannel;
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
}

type KanvasLicenseState =
  | 'licensed'
  | 'development'
  | 'needs_activation'
  | 'activation_pending'
  | 'offline_grace'
  | 'expired'
  | 'revoked'
  | 'device_deactivated'
  | 'channel_denied'
  | 'backend_unavailable'
  | 'invalid';

interface KanvasLicenseStatus {
  state: KanvasLicenseState;
  isLicensed: boolean;
  canUseApp: boolean;
  message: string;
  userId?: string;
  licenseId?: string;
  deviceId?: string;
  deviceActivationId?: string;
  status?: string;
  channel: KanvasUpdateChannel;
  allowedChannels?: KanvasUpdateChannel[];
  stableAvailable?: boolean;
  stableUpgradeEligible?: boolean;
  issuedAt?: string;
  expiresAt?: string;
  refreshAfter?: string;
  lastValidatedAt?: string;
  graceDaysRemaining?: number;
  activationUrl?: string;
  backendConfigured: boolean;
}

interface KanvasActivationStartResult {
  status: KanvasLicenseStatus;
  activationUrl?: string;
  state?: string;
}

interface Window {
  kanvas?: {
    ping: () => Promise<string>;
    getAppInfo: () => Promise<KanvasAppInfo>;
  };
  kanvasDesktop?: {
    getProjectsRoot: () => Promise<string>;
    ensureProjectStructure: (input: {
      folderName?: string;
      projectName?: string;
      projectId?: string;
    }) => Promise<unknown>;
    saveProjectToDisk: (input: {
      folderName?: string;
      projectName?: string;
      projectId?: string;
      projectJson: unknown;
      metadataJson: unknown;
      assetManifest: unknown;
    }) => Promise<{ folderName: string; folderPath: string; warnings: KanvasDesktopWarning[] }>;
    loadProjectFromDisk: (input: {
      folderName?: string;
      projectName?: string;
      projectId?: string;
    } | string) => Promise<{
      folderName: string;
      folderPath: string;
      projectJson: unknown;
      metadataJson?: unknown;
      assetManifest?: unknown;
      warnings: KanvasDesktopWarning[];
    }>;
    listProjects: () => Promise<KanvasDesktopProjectEntry[]>;
    copyAssetIntoProject: (input: {
      folderName?: string;
      projectName?: string;
      projectId?: string;
      assetId: string;
      originalName?: string;
      sourcePath?: string;
      bytes?: Uint8Array | number[];
    }) => Promise<{ relativePath: string; filename: string }>;
    exportProjectZip: (input: {
      folderName?: string;
      projectName?: string;
      projectId?: string;
    }) => Promise<{
      canceled: boolean;
      filePath?: string;
      folderName?: string;
      contents?: string[];
    }>;
    exportLibraryZip: (input?: {
      folderNames?: string[];
    }) => Promise<{
      canceled: boolean;
      filePath?: string;
    }>;
    importProjectZip: (input?: {
      sourcePath?: string;
      conflictAction?: KanvasDesktopConflictAction;
    }) => Promise<KanvasDesktopImportResult>;
    openProjectFolder: (input?: {
      sourcePath?: string;
      conflictAction?: KanvasDesktopConflictAction;
    }) => Promise<KanvasDesktopImportResult>;
  };
  kanvasUpdates?: {
    getStatus: () => Promise<KanvasUpdateStatus>;
    check: () => Promise<KanvasUpdateStatus>;
    download: () => Promise<KanvasUpdateStatus>;
    install: () => Promise<KanvasUpdateStatus>;
    setStableAvailability: (input: {
      stableAvailable?: boolean;
      stableUpgradeEligible?: boolean;
    }) => Promise<KanvasUpdateStatus>;
    setAutoDownload: (enabled: boolean) => Promise<KanvasUpdateStatus>;
    onStatus: (callback: (status: KanvasUpdateStatus) => void) => () => void;
  };
  kanvasBeforeUpdateInstall?: () => Promise<void>;
  kanvasLicense?: {
    getStatus: () => Promise<KanvasLicenseStatus>;
    startActivation: () => Promise<KanvasActivationStartResult>;
    completeActivation: (input: { code: string; state: string }) => Promise<KanvasLicenseStatus>;
    heartbeat: (input?: { force?: boolean }) => Promise<KanvasLicenseStatus>;
    clearLocalLicense: () => Promise<KanvasLicenseStatus>;
    onStatus: (callback: (status: KanvasLicenseStatus) => void) => () => void;
    onError: (callback: (error: { message: string }) => void) => () => void;
  };
}
