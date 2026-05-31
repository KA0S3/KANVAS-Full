import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const channel = process.argv[2];
if (!["beta", "stable"].includes(channel)) {
  throw new Error("Usage: node scripts/build-electron-installer.mjs <beta|stable>");
}

const releaseDir = resolve(process.cwd(), "release");
const metadataFile = channel === "beta" ? "beta.yml" : "latest.yml";
const requiredFiles = ["KANVAS-Setup.exe", "KANVAS-Setup.exe.blockmap", metadataFile];

for (const file of requiredFiles) {
  const filePath = join(releaseDir, file);
  if (existsSync(filePath)) unlinkSync(filePath);
}

const rceditSource = join(process.cwd(), "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
const rceditDir = join(process.cwd(), ".tmp-electron-builder-tools", "rcedit");
if (existsSync(rceditSource)) {
  mkdirSync(rceditDir, { recursive: true });
  copyFileSync(rceditSource, join(rceditDir, "rcedit-x64.exe"));
  copyFileSync(rceditSource, join(rceditDir, "rcedit-x86.exe"));
}

const startedAt = Date.now();
const command = process.execPath;
const result = spawnSync(command, [
  join(process.cwd(), "node_modules", "electron-builder", "cli.js"),
  "--win",
  "nsis",
  "--config",
  "electron-builder.config.cjs",
  "-p",
  "never",
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? "false",
    ELECTRON_BUILDER_RCEDIT_PATH: process.env.ELECTRON_BUILDER_RCEDIT_PATH ?? rceditDir,
  },
  shell: false,
  stdio: "inherit",
});

const freshArtifacts = requiredFiles.every((file) => {
  const filePath = join(releaseDir, file);
  return existsSync(filePath) && statSync(filePath).mtimeMs >= startedAt - 5000;
});

if (result.status === 0) {
  process.exit(0);
}

if (freshArtifacts) {
  console.warn("electron-builder exited non-zero after producing fresh installer artifacts; continuing after artifact verification.");
  process.exit(0);
}

process.exit(result.status ?? 1);
