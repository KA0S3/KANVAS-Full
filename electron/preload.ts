import { contextBridge, ipcRenderer } from "electron";

const kanvas = {
  ping: (): Promise<string> => ipcRenderer.invoke("kanvas:ping"),
  getAppInfo: (): Promise<{
    name: string;
    version: string;
    platform: string;
    isPackaged: boolean;
  }> => ipcRenderer.invoke("kanvas:get-app-info"),
};

const kanvasUpdates = {
  getStatus: () => ipcRenderer.invoke("kanvas:update:getStatus"),
  check: () => ipcRenderer.invoke("kanvas:update:check"),
  download: () => ipcRenderer.invoke("kanvas:update:download"),
  install: () => ipcRenderer.invoke("kanvas:update:install"),
  setStableAvailability: (input: { stableAvailable?: boolean; stableUpgradeEligible?: boolean }) =>
    ipcRenderer.invoke("kanvas:update:setStableAvailability", input),
  setAutoDownload: (enabled: boolean) => ipcRenderer.invoke("kanvas:update:setAutoDownload", enabled),
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("kanvas:update:status", listener);
    return () => ipcRenderer.removeListener("kanvas:update:status", listener);
  },
};

const kanvasLicense = {
  getStatus: () => ipcRenderer.invoke("kanvas:license:getStatus"),
  startActivation: () => ipcRenderer.invoke("kanvas:license:startActivation"),
  completeActivation: (input: { code: string; state: string }) => ipcRenderer.invoke("kanvas:license:completeActivation", input),
  heartbeat: (input?: { force?: boolean }) => ipcRenderer.invoke("kanvas:license:heartbeat", input),
  clearLocalLicense: () => ipcRenderer.invoke("kanvas:license:clearLocalLicense"),
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("kanvas:license:status", listener);
    return () => ipcRenderer.removeListener("kanvas:license:status", listener);
  },
  onError: (callback: (error: { message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: { message: string }) => callback(error);
    ipcRenderer.on("kanvas:license:error", listener);
    return () => ipcRenderer.removeListener("kanvas:license:error", listener);
  },
};

const kanvasDesktop = {
  getProjectsRoot: (): Promise<string> => ipcRenderer.invoke("kanvas:getProjectsRoot"),
  ensureProjectStructure: (input: {
    folderName?: string;
    projectName?: string;
    projectId?: string;
  }) => ipcRenderer.invoke("kanvas:ensureProjectStructure", input),
  saveProjectToDisk: (input: {
    folderName?: string;
    projectName?: string;
    projectId?: string;
    projectJson: unknown;
    metadataJson: unknown;
    assetManifest: unknown;
  }) => ipcRenderer.invoke("kanvas:saveProjectToDisk", input),
  loadProjectFromDisk: (input: {
    folderName?: string;
    projectName?: string;
    projectId?: string;
  } | string) => ipcRenderer.invoke("kanvas:loadProjectFromDisk", input),
  listProjects: () => ipcRenderer.invoke("kanvas:listProjects"),
  copyAssetIntoProject: (input: {
    folderName?: string;
    projectName?: string;
    projectId?: string;
    assetId: string;
    originalName?: string;
    sourcePath?: string;
    bytes?: Uint8Array | number[];
  }) => ipcRenderer.invoke("kanvas:copyAssetIntoProject", input),
  exportProjectZip: (input: {
    folderName?: string;
    projectName?: string;
    projectId?: string;
  }) => ipcRenderer.invoke("kanvas:exportProjectZip", input),
  exportLibraryZip: (input?: {
    folderNames?: string[];
  }) => ipcRenderer.invoke("kanvas:exportLibraryZip", input),
  importProjectZip: (input?: {
    sourcePath?: string;
    conflictAction?: "keep_both" | "replace" | "cancel";
  }) => ipcRenderer.invoke("kanvas:importProjectZip", input),
  openProjectFolder: (input?: {
    sourcePath?: string;
    conflictAction?: "keep_both" | "replace" | "cancel";
  }) => ipcRenderer.invoke("kanvas:openProjectFolder", input),
};

contextBridge.exposeInMainWorld("kanvas", kanvas);
contextBridge.exposeInMainWorld("kanvasDesktop", kanvasDesktop);
contextBridge.exposeInMainWorld("kanvasUpdates", kanvasUpdates);
contextBridge.exposeInMainWorld("kanvasLicense", kanvasLicense);
