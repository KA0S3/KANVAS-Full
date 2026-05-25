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
