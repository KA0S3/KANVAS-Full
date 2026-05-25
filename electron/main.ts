import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  atomicWriteJson,
  copyAssetIntoProject,
  ensureProjectStructure,
  exportLibraryToZip,
  exportProjectFolderToZip,
  getProjectFolderInfo,
  getProjectsRoot,
  importProjectSourceIntoRoot,
  importProjectZipIntoRoot,
  inspectProjectImportConflicts,
  inspectProjectZipImportConflicts,
  listProjects,
  readJsonFile,
  readProjectJsonFile,
  validateReferencedAssets,
} from "./projectFilesystem";

type AppInfo = {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
  appPath: string;
  userDataPath: string;
  rendererSource: string;
  rendererEntry: string;
};

const runtimeInfo = {
  rendererSource: "not-loaded",
  rendererEntry: "not-loaded",
};

const writeRuntimeLog = (message: string): void => {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    appendFileSync(join(app.getPath("userData"), "desktop-runtime.log"), line, "utf8");
  } catch {
    // Runtime diagnostics should never prevent the app from opening.
  }
};

const getRendererEntry = (indexHtmlPath: string): string => {
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    return html.match(/src=["']\.\/assets\/([^"']+\.js)["']/)?.[1] || "unknown-renderer-entry";
  } catch {
    return "unreadable-renderer-entry";
  }
};

const getAppIconPath = (): string | undefined => {
  const candidates = [
    join(app.getAppPath(), "dist", "KANVAS-LOGO-F3.png"),
    join(app.getAppPath(), "public", "KANVAS-LOGO-F3.png"),
    join(app.getAppPath(), "src", "assets", "KANVAS-LOGO-F3.png"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
};

const createMainWindow = (): void => {
  const iconPath = getAppIconPath();
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f172a",
    show: false,
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    runtimeInfo.rendererSource = devServerUrl;
    runtimeInfo.rendererEntry = "dev-server";
    writeRuntimeLog(`Loading renderer from dev server: ${devServerUrl}`);
    void mainWindow.loadURL(devServerUrl);
  } else {
    const rendererIndexHtml = join(app.getAppPath(), "dist", "index.html");

    if (!existsSync(rendererIndexHtml)) {
      throw new Error(`Renderer entry not found: ${rendererIndexHtml}`);
    }

    runtimeInfo.rendererSource = rendererIndexHtml;
    runtimeInfo.rendererEntry = getRendererEntry(rendererIndexHtml);
    writeRuntimeLog(`Loading renderer from ${rendererIndexHtml} (${runtimeInfo.rendererEntry})`);
    void mainWindow.loadFile(rendererIndexHtml);
  }

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.setTitle(`KANVAS - ${app.isPackaged ? "packaged" : "dev"} - ${runtimeInfo.rendererEntry}`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    writeRuntimeLog(`Renderer load failed ${code}: ${description} (${url})`);
  });
};

ipcMain.handle("kanvas:ping", () => "pong");

ipcMain.handle("kanvas:get-app-info", (): AppInfo => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userDataPath: app.getPath("userData"),
    rendererSource: runtimeInfo.rendererSource,
    rendererEntry: runtimeInfo.rendererEntry,
  };
});

const projectsRoot = (): string => getProjectsRoot(app.getPath("documents"));

const resolveProjectFolder = async (lookup: {
  folderName?: string;
  projectName?: string;
  projectId?: string;
} | string) => {
  const normalized = typeof lookup === "string" ? { folderName: lookup } : lookup || {};
  const root = projectsRoot();
  let info = getProjectFolderInfo(root, normalized);

  try {
    await readProjectJsonFile(info);
  } catch {
    if (normalized.projectId) {
      const projects = await listProjects(root);
      const match = projects.find(project => project.projectId === normalized.projectId);
      if (match) {
        info = getProjectFolderInfo(root, { folderName: match.folderName });
      }
    }
  }

  return info;
};

ipcMain.handle("kanvas:getProjectsRoot", async () => {
  const root = projectsRoot();
  return root;
});

ipcMain.handle("kanvas:ensureProjectStructure", async (_event, input: {
  folderName?: string;
  projectName?: string;
  projectId?: string;
}) => {
  return await ensureProjectStructure(projectsRoot(), input || {});
});

ipcMain.handle("kanvas:saveProjectToDisk", async (_event, input: {
  folderName?: string;
  projectName?: string;
  projectId?: string;
  projectJson: unknown;
  metadataJson: unknown;
  assetManifest: unknown;
}) => {
  if (!input?.projectJson || !input?.metadataJson || !input?.assetManifest) {
    throw new Error("saveProjectToDisk requires projectJson, metadataJson, and assetManifest");
  }

  const info = await ensureProjectStructure(projectsRoot(), input);
  await atomicWriteJson(info.projectPath, input.projectJson);
  await atomicWriteJson(info.metadataPath, input.metadataJson);
  await atomicWriteJson(info.assetManifestPath, input.assetManifest);
  const warnings = await validateReferencedAssets(info.folderPath, input.projectJson);

  return {
    folderName: info.folderName,
    folderPath: info.folderPath,
    warnings,
  };
});

ipcMain.handle("kanvas:loadProjectFromDisk", async (_event, input: {
  folderName?: string;
  projectName?: string;
  projectId?: string;
} | string) => {
  const info = await resolveProjectFolder(input);

  const [projectJson, metadataJson, assetManifest] = await Promise.all([
    readProjectJsonFile(info),
    readJsonFile(info.metadataPath).catch(() => undefined),
    readJsonFile(info.assetManifestPath).catch(() => undefined),
  ]);
  const warnings = await validateReferencedAssets(info.folderPath, projectJson);

  return {
    folderName: info.folderName,
    folderPath: info.folderPath,
    projectJson,
    metadataJson,
    assetManifest,
    warnings,
  };
});

ipcMain.handle("kanvas:listProjects", async () => {
  return await listProjects(projectsRoot());
});

ipcMain.handle("kanvas:copyAssetIntoProject", async (_event, input: {
  folderName?: string;
  projectName?: string;
  projectId?: string;
  assetId: string;
  originalName?: string;
  sourcePath?: string;
  bytes?: Uint8Array | number[];
}) => {
  return await copyAssetIntoProject(projectsRoot(), input);
});

ipcMain.handle("kanvas:exportProjectZip", async (event, input: {
  folderName?: string;
  projectName?: string;
  projectId?: string;
}) => {
  const info = await resolveProjectFolder(input || {});
  const projectJson = await readProjectJsonFile<Record<string, unknown>>(info);
  const projectName = typeof projectJson.projectName === "string" ? projectJson.projectName : info.folderName;
  const defaultPath = join(app.getPath("documents"), `${projectName.replace(/[^a-zA-Z0-9._ -]+/g, "_")}.kanvas.zip`);
  const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
  const saveResult = await dialog.showSaveDialog(parentWindow, {
    title: "Export KANVAS Project",
    defaultPath,
    filters: [{ name: "KANVAS Project ZIP", extensions: ["zip"] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const zipBuffer = await exportProjectFolderToZip(info.folderPath);
  await writeFile(saveResult.filePath, zipBuffer);
  return {
    canceled: false,
    filePath: saveResult.filePath,
    folderName: info.folderName,
    contents: ["project.kanvas.json", "metadata.json", "asset-manifest.json", "assets/", "indexes/"],
  };
});

ipcMain.handle("kanvas:exportLibraryZip", async (event, input?: {
  folderNames?: string[];
}) => {
  const defaultPath = join(app.getPath("documents"), "KANVAS-library-backup.kanvas.zip");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
  const saveResult = await dialog.showSaveDialog(parentWindow, {
    title: "Export KANVAS Library",
    defaultPath,
    filters: [{ name: "KANVAS Library ZIP", extensions: ["zip"] }],
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const zipBuffer = await exportLibraryToZip(projectsRoot(), input?.folderNames);
  await writeFile(saveResult.filePath, zipBuffer);
  return {
    canceled: false,
    filePath: saveResult.filePath,
  };
});

ipcMain.handle("kanvas:importProjectZip", async (event, input?: {
  sourcePath?: string;
  conflictAction?: "keep_both" | "replace" | "cancel";
}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
  let sourcePath = input?.sourcePath;
  if (!sourcePath) {
    const openResult = await dialog.showOpenDialog(parentWindow, {
      title: "Import KANVAS ZIP",
      properties: ["openFile"],
      filters: [{ name: "KANVAS ZIP", extensions: ["zip"] }],
    });

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return { canceled: true };
    }
    sourcePath = openResult.filePaths[0];
  }

  if (!input?.conflictAction) {
    const conflicts = await inspectProjectZipImportConflicts(projectsRoot(), sourcePath);
    if (conflicts.length > 0) {
      return {
        canceled: false,
        sourcePath,
        needsConflictResolution: true,
        conflicts,
      };
    }
  }

  const imported = await importProjectZipIntoRoot(projectsRoot(), sourcePath, {
    conflictAction: input?.conflictAction || "keep_both",
  });
  return {
    canceled: false,
    imported: imported.map(project => ({
      folderName: project.folderName,
      folderPath: project.folderPath,
      warnings: project.warnings,
      usesLegacyProjectJson: project.usesLegacyProjectJson,
      replaced: project.replaced,
    })),
  };
});

ipcMain.handle("kanvas:openProjectFolder", async (event, input?: {
  sourcePath?: string;
  conflictAction?: "keep_both" | "replace" | "cancel";
}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
  let sourcePath = input?.sourcePath;
  if (!sourcePath) {
    const openResult = await dialog.showOpenDialog(parentWindow, {
      title: "Open KANVAS Project Folder",
      properties: ["openDirectory"],
    });

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return { canceled: true };
    }
    sourcePath = openResult.filePaths[0];
  }

  if (!input?.conflictAction) {
    const conflicts = await inspectProjectImportConflicts(projectsRoot(), sourcePath);
    if (conflicts.length > 0) {
      return {
        canceled: false,
        sourcePath,
        needsConflictResolution: true,
        conflicts,
      };
    }
  }

  const imported = await importProjectSourceIntoRoot(projectsRoot(), sourcePath, {
    conflictAction: input?.conflictAction || "keep_both",
  });
  return {
    canceled: false,
    imported: imported.map(project => ({
      folderName: project.folderName,
      folderPath: project.folderPath,
      warnings: project.warnings,
      usesLegacyProjectJson: project.usesLegacyProjectJson,
      replaced: project.replaced,
    })),
  };
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
