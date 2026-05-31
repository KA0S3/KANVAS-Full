import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { expectedPublishChannel, inferReleaseChannel, validateReleaseConfig } from "./release-rules.mjs";

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const config = require("../electron-builder.config.cjs");
const requestedChannel = process.argv[2];
const version = packageJson.version;
const publishChannel = config.publish?.[0]?.channel;
const expectedChannel = inferReleaseChannel(version);
const errors = validateReleaseConfig({
  version,
  requestedChannel,
  packageMetadata: packageJson,
  builderConfig: config,
  configExists: existsSync(join(projectRoot, "electron-builder.config.cjs")),
});

if (errors.length > 0) {
  console.error("Release configuration verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release configuration verified for ${expectedChannel} (${version}, publish channel ${publishChannel || expectedPublishChannel(version)}).`);
