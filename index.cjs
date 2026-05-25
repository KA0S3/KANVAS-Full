"use strict";
const electron = require("electron");
const node_fs = require("node:fs");
const node_path = require("node:path");
const node_crypto = require("node:crypto");
const REQUIRED_DIRS = ["assets", "thumbnails", "backups"];
function getProjectsRoot(documentsPath) {
  return node_path.resolve(documentsPath, "KANVAS", "Projects");
}
function sanitizeProjectSlug(value) {
  const slug = (value || "untitled-project").trim().toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "untitled-project";
}
function sanitizeFilename(value) {
  const clean = node_path.basename(value || "asset").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return clean || "asset";
}
function assertInsideProjectsRoot(projectsRoot2, targetPath) {
  const root = node_path.resolve(projectsRoot2);
  const target = node_path.resolve(targetPath);
  const rel = node_path.relative(root, target);
  if (rel === "" || !rel.startsWith("..") && !node_path.isAbsolute(rel)) {
    return target;
  }
  throw new Error("Resolved project path escapes the KANVAS projects root");
}
function getProjectFolderInfo(projectsRoot2, input) {
  const folderName = sanitizeProjectSlug(input.folderName || input.projectName || input.projectId);
  const folderPath = assertInsideProjectsRoot(projectsRoot2, node_path.join(projectsRoot2, folderName));
  return {
    folderName,
    folderPath,
    projectPath: assertInsideProjectsRoot(projectsRoot2, node_path.join(folderPath, "project.json")),
    metadataPath: assertInsideProjectsRoot(projectsRoot2, node_path.join(folderPath, "metadata.json")),
    assetsPath: assertInsideProjectsRoot(projectsRoot2, node_path.join(folderPath, "assets")),
    thumbnailsPath: assertInsideProjectsRoot(projectsRoot2, node_path.join(folderPath, "thumbnails")),
    backupsPath: assertInsideProjectsRoot(projectsRoot2, node_path.join(folderPath, "backups"))
  };
}
async function ensureProjectStructure(projectsRoot2, input) {
  const info = getProjectFolderInfo(projectsRoot2, input);
  await node_fs.promises.mkdir(projectsRoot2, { recursive: true });
  await node_fs.promises.mkdir(info.folderPath, { recursive: true });
  await Promise.all(REQUIRED_DIRS.map((dir) => node_fs.promises.mkdir(node_path.join(info.folderPath, dir), { recursive: true })));
  return info;
}
async function atomicWriteJson(filePath, value) {
  await node_fs.promises.mkdir(node_path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
  const json = `${JSON.stringify(value, null, 2)}
`;
  await node_fs.promises.writeFile(tempPath, json, "utf8");
  await node_fs.promises.rename(tempPath, filePath);
}
function collectRelativeAssetReferences(value) {
  const refs = /* @__PURE__ */ new Set();
  collectRefs(value, refs);
  return [...refs].sort();
}
function collectRefs(value, refs) {
  if (typeof value === "string") {
    const normalized = value.replace(/\\/g, "/");
    if (normalized.startsWith("assets/") && !normalized.includes("..")) {
      refs.add(normalized);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRefs(entry, refs));
    return;
  }
  Object.values(value).forEach((entry) => collectRefs(entry, refs));
}
async function validateReferencedAssets(folderPath, projectJson) {
  const warnings = [];
  const refs = collectRelativeAssetReferences(projectJson);
  for (const ref of refs) {
    const assetPath = node_path.resolve(folderPath, ref);
    const safeAssetPath = assertInsideProjectsRoot(folderPath, assetPath);
    try {
      await node_fs.promises.access(safeAssetPath);
    } catch {
      warnings.push({
        code: "missing_asset_file",
        message: `Referenced asset file is missing: ${ref}`,
        path: ref
      });
    }
  }
  return warnings;
}
async function readJsonFile(filePath) {
  const raw = await node_fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}
async function listProjects(projectsRoot2) {
  await node_fs.promises.mkdir(projectsRoot2, { recursive: true });
  const entries = await node_fs.promises.readdir(projectsRoot2, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const info = getProjectFolderInfo(projectsRoot2, { folderName: entry.name });
    const warnings = [];
    try {
      const projectJson = await readJsonFile(info.projectPath);
      projects.push({
        folderName: entry.name,
        projectId: typeof projectJson.projectId === "string" ? projectJson.projectId : void 0,
        projectName: typeof projectJson.projectName === "string" ? projectJson.projectName : void 0,
        updatedAt: typeof projectJson.updatedAt === "string" ? projectJson.updatedAt : void 0,
        warnings
      });
    } catch (error) {
      warnings.push({
        code: "project_read_failed",
        message: error instanceof Error ? error.message : String(error)
      });
      projects.push({ folderName: entry.name, warnings });
    }
  }
  return projects.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
async function copyAssetIntoProject(projectsRoot2, input) {
  const info = await ensureProjectStructure(projectsRoot2, input);
  const filename = `${sanitizeFilename(input.assetId)}_${sanitizeFilename(input.originalName || input.sourcePath)}`;
  const destination = assertInsideProjectsRoot(projectsRoot2, node_path.join(info.assetsPath, filename));
  if (input.bytes) {
    await node_fs.promises.writeFile(destination, Buffer.from(input.bytes));
  } else if (input.sourcePath) {
    await node_fs.promises.copyFile(input.sourcePath, destination);
  } else {
    throw new Error("copyAssetIntoProject requires sourcePath or bytes");
  }
  return {
    filename,
    relativePath: `assets/${filename}`
  };
}
const runtimeInfo = {
  rendererSource: "not-loaded",
  rendererEntry: "not-loaded"
};
const writeRuntimeLog = (message) => {
  try {
    const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${message}
`;
    node_fs.appendFileSync(node_path.join(electron.app.getPath("userData"), "desktop-runtime.log"), line, "utf8");
  } catch {
  }
};
const getRendererEntry = (indexHtmlPath) => {
  try {
    const html = node_fs.readFileSync(indexHtmlPath, "utf8");
    return html.match(/src=["']\.\/assets\/([^"']+\.js)["']/)?.[1] || "unknown-renderer-entry";
  } catch {
    return "unreadable-renderer-entry";
  }
};
const createMainWindow = () => {
  const mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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
    const rendererIndexHtml = node_path.join(electron.app.getAppPath(), "dist", "index.html");
    if (!node_fs.existsSync(rendererIndexHtml)) {
      throw new Error(`Renderer entry not found: ${rendererIndexHtml}`);
    }
    runtimeInfo.rendererSource = rendererIndexHtml;
    runtimeInfo.rendererEntry = getRendererEntry(rendererIndexHtml);
    writeRuntimeLog(`Loading renderer from ${rendererIndexHtml} (${runtimeInfo.rendererEntry})`);
    void mainWindow.loadFile(rendererIndexHtml);
  }
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.setTitle(`KANVAS - ${electron.app.isPackaged ? "packaged" : "dev"} - ${runtimeInfo.rendererEntry}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    writeRuntimeLog(`Renderer load failed ${code}: ${description} (${url})`);
  });
};
electron.ipcMain.handle("kanvas:ping", () => "pong");
electron.ipcMain.handle("kanvas:get-app-info", () => {
  return {
    name: electron.app.getName(),
    version: electron.app.getVersion(),
    platform: process.platform,
    isPackaged: electron.app.isPackaged,
    appPath: electron.app.getAppPath(),
    userDataPath: electron.app.getPath("userData"),
    rendererSource: runtimeInfo.rendererSource,
    rendererEntry: runtimeInfo.rendererEntry
  };
});
const projectsRoot = () => getProjectsRoot(electron.app.getPath("documents"));
electron.ipcMain.handle("kanvas:getProjectsRoot", async () => {
  const root = projectsRoot();
  return root;
});
electron.ipcMain.handle("kanvas:ensureProjectStructure", async (_event, input) => {
  return await ensureProjectStructure(projectsRoot(), input || {});
});
electron.ipcMain.handle("kanvas:saveProjectToDisk", async (_event, input) => {
  if (!input?.projectJson || !input?.metadataJson) {
    throw new Error("saveProjectToDisk requires projectJson and metadataJson");
  }
  const info = await ensureProjectStructure(projectsRoot(), input);
  await atomicWriteJson(info.projectPath, input.projectJson);
  await atomicWriteJson(info.metadataPath, input.metadataJson);
  const warnings = await validateReferencedAssets(info.folderPath, input.projectJson);
  return {
    folderName: info.folderName,
    folderPath: info.folderPath,
    warnings
  };
});
electron.ipcMain.handle("kanvas:loadProjectFromDisk", async (_event, input) => {
  const lookup = typeof input === "string" ? { folderName: input } : input || {};
  const root = projectsRoot();
  let info = getProjectFolderInfo(root, lookup);
  try {
    await readJsonFile(info.projectPath);
  } catch {
    if (lookup.projectId) {
      const projects = await listProjects(root);
      const match = projects.find((project) => project.projectId === lookup.projectId);
      if (match) {
        info = getProjectFolderInfo(root, { folderName: match.folderName });
      }
    }
  }
  const [projectJson, metadataJson] = await Promise.all([
    readJsonFile(info.projectPath),
    readJsonFile(info.metadataPath).catch(() => void 0)
  ]);
  const warnings = await validateReferencedAssets(info.folderPath, projectJson);
  return {
    folderName: info.folderName,
    folderPath: info.folderPath,
    projectJson,
    metadataJson,
    warnings
  };
});
electron.ipcMain.handle("kanvas:listProjects", async () => {
  return await listProjects(projectsRoot());
});
electron.ipcMain.handle("kanvas:copyAssetIntoProject", async (_event, input) => {
  return await copyAssetIntoProject(projectsRoot(), input);
});
electron.app.whenReady().then(() => {
  createMainWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
