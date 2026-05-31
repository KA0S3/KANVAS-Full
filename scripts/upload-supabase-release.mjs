import { createClient } from "@supabase/supabase-js";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { inferReleaseChannel } from "./release-rules.mjs";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const channel = process.argv[2];
const expectedChannel = inferReleaseChannel(version);
const releaseDir = resolve(process.cwd(), "release");
const installerBucket = process.env.DESKTOP_INSTALLER_BUCKET || "desktop-installers";
const updateBucket = process.env.DESKTOP_UPDATE_BUCKET || "desktop-updates";

const contentTypes = {
  ".exe": "application/vnd.microsoft.portable-executable",
  ".yml": "text/yaml",
  ".blockmap": "application/octet-stream",
  ".json": "application/json",
};

if (!["beta", "stable"].includes(channel)) {
  throw new Error("Usage: node scripts/upload-supabase-release.mjs <beta|stable>");
}

if (channel !== expectedChannel) {
  throw new Error(`Package version ${version} is a ${expectedChannel} release, not ${channel}.`);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading release artifacts.");
}

if (!existsSync(releaseDir)) {
  throw new Error("release directory does not exist. Build the installer first.");
}

const metadataFile = channel === "beta" ? "beta.yml" : "latest.yml";
const requiredFiles = ["KANVAS-Setup.exe", metadataFile];
const releaseFiles = readdirSync(releaseDir);
const blockmapFiles = releaseFiles.filter((file) => file.endsWith(".blockmap"));

for (const file of requiredFiles) {
  if (!releaseFiles.includes(file)) {
    throw new Error(`Missing release artifact: ${file}`);
  }
}

if (blockmapFiles.length === 0) {
  throw new Error("Missing release blockmap artifact.");
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const objectUrl = (bucket, storagePath) => {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
};

const uploadBody = async (bucket, storagePath, body, contentType) => {
  const response = await fetch(objectUrl(bucket, storagePath), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": contentType,
      "x-upsert": "true",
    },
    body,
    duplex: "half",
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
};

const upload = async (bucket, storagePath, filePath) => {
  const ext = Object.keys(contentTypes).find((suffix) => filePath.endsWith(suffix));
  const contentType = contentTypes[ext ?? ""] || "application/octet-stream";

  try {
    await uploadBody(bucket, storagePath, createReadStream(filePath), contentType);
  } catch (error) {
    throw new Error(`Upload failed for ${bucket}/${storagePath}: ${error.message}`, {
      cause: error,
    });
  }
  console.log(`Uploaded ${bucket}/${storagePath}`);
};

await upload(installerBucket, `${channel}/${version}/KANVAS-Setup.exe`, join(releaseDir, "KANVAS-Setup.exe"));
for (const file of ["KANVAS-Setup.exe", metadataFile, ...blockmapFiles]) {
  await upload(updateBucket, `${channel}/${file}`, join(releaseDir, file));
}

const manifest = {
  channel,
  version,
  storage_path: `${channel}/${version}/KANVAS-Setup.exe`,
  file_name: "KANVAS-Setup.exe",
  uploaded_at: new Date().toISOString(),
};

try {
  await uploadBody(
    installerBucket,
    `${channel}/latest-installer.json`,
    JSON.stringify(manifest, null, 2),
    "application/json",
  );
} catch (error) {
  throw new Error(`Upload failed for ${installerBucket}/${channel}/latest-installer.json: ${error.message}`, {
    cause: error,
  });
}

console.log(`Uploaded ${installerBucket}/${channel}/latest-installer.json`);
console.log(`Supabase ${channel} release upload complete for ${version}.`);
