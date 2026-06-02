import { createHash, createHmac } from "node:crypto";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { loadEnv } from "vite";
import { inferReleaseChannel } from "./release-rules.mjs";

const require = createRequire(import.meta.url);
const env = loadEnv(process.env.NODE_ENV || "production", process.cwd(), "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] ??= value;
}

const { version } = require("../package.json");

const channel = process.argv[2];
const expectedChannel = inferReleaseChannel(version);
const releaseDir = resolve(process.cwd(), "release");
const bucket = process.env.R2_BUCKET_NAME || "kanvas-desktop-releases";
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

const contentTypes = {
  ".exe": "application/vnd.microsoft.portable-executable",
  ".yml": "text/yaml",
  ".blockmap": "application/octet-stream",
  ".json": "application/json",
};

if (!["beta", "stable"].includes(channel)) {
  throw new Error("Usage: node scripts/upload-r2-release.mjs <beta|stable>");
}

if (channel !== expectedChannel) {
  throw new Error(`Package version ${version} is a ${expectedChannel} release, not ${channel}.`);
}

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME before uploading release artifacts.");
}

if (!existsSync(releaseDir)) {
  throw new Error("release directory does not exist. Build the installer first.");
}

const metadataFile = channel === "beta" ? "beta.yml" : "latest.yml";
const releaseFiles = readdirSync(releaseDir);
const blockmapFiles = releaseFiles.filter((file) => file.endsWith(".blockmap"));

for (const file of ["KANVAS-Setup.exe", metadataFile]) {
  if (!releaseFiles.includes(file)) {
    throw new Error(`Missing release artifact: ${file}`);
  }
}

if (blockmapFiles.length === 0) {
  throw new Error("Missing release blockmap artifact.");
}

const endpointHost = `${accountId}.r2.cloudflarestorage.com`;
const endpoint = `https://${endpointHost}`;
const region = "auto";
const service = "s3";

const hashHex = (input) => createHash("sha256").update(input).digest("hex");
const hmac = (key, input) => createHmac("sha256", key).update(input).digest();
const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");

const signingKey = (dateStamp) => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
};

const signedHeadersForPut = (key, payloadHash, contentType) => {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const path = `/${bucket}/${encodeKey(key)}`;
  const headers = {
    "content-type": contentType,
    host: endpointHost,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const canonicalHeaders = Object.entries(headers).map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = Object.keys(headers).join(";");
  const canonicalRequest = ["PUT", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(dateStamp)).update(stringToSign).digest("hex");

  return {
    url: `${endpoint}${path}`,
    headers: {
      "content-type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
};

const fileHash = async (filePath) => {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolvePromise);
  });
  return hash.digest("hex");
};

const contentTypeFor = (filePath) => {
  const ext = Object.keys(contentTypes).find((suffix) => filePath.endsWith(suffix));
  return contentTypes[ext ?? ""] || "application/octet-stream";
};

const putObject = async (key, body, contentType, payloadHash) => {
  const { url, headers } = signedHeadersForPut(key, payloadHash, contentType);
  const response = await fetch(url, { method: "PUT", headers, body, duplex: "half" });
  if (!response.ok) {
    throw new Error(`Upload failed for ${bucket}/${key}: ${response.status} ${response.statusText}: ${await response.text()}`);
  }
  console.log(`Uploaded ${bucket}/${key}`);
};

const uploadFile = async (key, filePath) => {
  await stat(filePath);
  await putObject(key, createReadStream(filePath), contentTypeFor(filePath), await fileHash(filePath));
};

const uploadJson = async (key, value) => {
  const body = JSON.stringify(value, null, 2);
  await putObject(key, body, "application/json", hashHex(body));
};

const installerKey = `installers/${channel}/${version}/KANVAS-Setup.exe`;
const updateKeys = [`updates/${channel}/KANVAS-Setup.exe`, `updates/${channel}/${metadataFile}`, ...blockmapFiles.map((file) => `updates/${channel}/${file}`)];

await uploadFile(installerKey, join(releaseDir, "KANVAS-Setup.exe"));
for (const key of updateKeys) {
  await uploadFile(key, join(releaseDir, key.split("/").pop()));
}

const latestInstallerManifest = {
  channel,
  version,
  storage_path: installerKey,
  object_key: installerKey,
  file_name: "KANVAS-Setup.exe",
  uploaded_at: new Date().toISOString(),
};

const updateManifest = {
  channel,
  version,
  metadata_file: metadataFile,
  metadata_key: `updates/${channel}/${metadataFile}`,
  artifacts: ["KANVAS-Setup.exe", ...blockmapFiles].map((file) => ({
    file_name: file,
    object_key: `updates/${channel}/${file}`,
  })),
  uploaded_at: new Date().toISOString(),
};

await uploadJson(`manifests/${channel}/latest-installer.json`, latestInstallerManifest);
await uploadJson(`updates/${channel}/update-manifest.json`, updateManifest);

console.log(`R2 ${channel} release upload complete for ${version}.`);
console.log("R2 object keys:");
for (const key of [installerKey, ...updateKeys, `manifests/${channel}/latest-installer.json`, `updates/${channel}/update-manifest.json`]) {
  console.log(`- ${key}`);
}
