import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadEnv } from "vite";
import { expectedPublishChannel, inferReleaseChannel, validateReleaseConfig } from "./release-rules.mjs";

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const env = loadEnv(process.env.NODE_ENV || "production", projectRoot, "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const config = require("../electron-builder.config.cjs");
const requestedChannel = process.argv[2];
const version = packageJson.version;
const publishChannel = config.publish?.[0]?.channel;
const expectedChannel = inferReleaseChannel(version);
const releaseEnvNames = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const errors = validateReleaseConfig({
  version,
  requestedChannel,
  packageMetadata: packageJson,
  builderConfig: config,
  configExists: existsSync(join(projectRoot, "electron-builder.config.cjs")),
});

if (requestedChannel) {
  for (const name of releaseEnvNames) {
    if (!process.env[name]) {
      errors.push(`Missing ${name}. R2 release uploads require private bucket credentials.`);
    }
  }
}

if (errors.length > 0) {
  console.error("Release configuration verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release configuration verified for ${expectedChannel} (${version}, publish channel ${publishChannel || expectedPublishChannel(version)}).`);
