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
}
