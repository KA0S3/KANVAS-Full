import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const channel = process.argv[2];
const metadataFile = channel === "beta" ? "beta.yml" : "latest.yml";
const releaseDir = resolve(process.cwd(), "release");
const errors = [];

if (!["beta", "stable"].includes(channel)) {
  errors.push("Usage: node scripts/verify-electron-release-artifacts.mjs <beta|stable>");
}

if (!existsSync(releaseDir)) {
  errors.push("release directory was not generated.");
} else {
  const files = readdirSync(releaseDir);
  if (!existsSync(join(releaseDir, metadataFile))) {
    errors.push(`${metadataFile} update metadata was not generated.`);
  }

  if (!files.includes("KANVAS-Setup.exe")) {
    errors.push("Installer asset KANVAS-Setup.exe was not generated.");
  }

  if (channel === "beta" && existsSync(join(releaseDir, "latest.yml"))) {
    errors.push("Beta release generated latest.yml; beta builds must publish beta.yml only.");
  }

  if (channel === "stable" && existsSync(join(releaseDir, "beta.yml"))) {
    errors.push("Stable release generated beta.yml; stable builds must publish latest.yml only.");
  }
}

if (errors.length > 0) {
  console.error("Electron release artifact verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Electron release artifacts verified for ${channel} (${metadataFile}).`);
