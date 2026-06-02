const { app, BrowserWindow, dialog, shell } = require("electron");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

let adminServer;
let mainWindow;

app.setName("KANVAS Admin");

app.whenReady().then(async () => {
  const { startAdminServer } = await import("../api/server.mjs");
  const appRoot = app.isPackaged ? app.getAppPath() : join(__dirname, "../../..");
  const adminRoot = join(appRoot, "tools", "kanvas-admin");
  const userEnvPath = join(app.getPath("userData"), ".env.admin.local");
  ensureEnvTemplate(userEnvPath);

  try {
    adminServer = await startAdminServer({
      adminRoot,
      envPaths: [
        userEnvPath,
        join(dirname(process.execPath), ".env.admin.local"),
        join(adminRoot, ".env.admin.local"),
      ],
    });
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "KANVAS Admin failed to start",
      message: String(error && error.message ? error.message : error),
    });
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "KANVAS Admin",
    backgroundColor: "#f4f5f7",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(adminServer.url);
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (adminServer && adminServer.server) adminServer.server.close();
});

function ensureEnvTemplate(path) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      "SUPABASE_URL=",
      "SUPABASE_ANON_KEY=",
      "",
      "# Required only for release upload/publish actions.",
      "R2_ACCOUNT_ID=",
      "R2_ACCESS_KEY_ID=",
      "R2_SECRET_ACCESS_KEY=",
      "R2_BUCKET_NAME=kanvas-desktop-releases",
      "",
      "# Optional: set this to your repo checkout when using release build/publish buttons.",
      "KANVAS_REPO_ROOT=",
      "",
    ].join("\n"),
  );
}
