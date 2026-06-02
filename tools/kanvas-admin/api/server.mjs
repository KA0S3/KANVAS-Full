import { createServer } from "node:http";
import { createHash, createHmac } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export function startAdminServer(options = {}) {
  const adminRoot = resolve(options.adminRoot || fileURLToPath(new URL("..", import.meta.url)));
  const envPaths = [...(options.envPaths || []), join(adminRoot, ".env.admin.local")];
  const envPath = envPaths.find((path) => existsSync(path)) || envPaths[0];
  const jobs = new Map();

  for (const path of envPaths) loadLocalEnv(path);

  let repoRoot = resolve(process.env.KANVAS_REPO_ROOT || options.repoRoot || resolve(adminRoot, "../.."));
  const host = process.env.KANVAS_ADMIN_HOST || options.host || "127.0.0.1";
  const port = Number(process.env.KANVAS_ADMIN_PORT || options.port || 4517);
  const secrets = [
    process.env.SUPABASE_ANON_KEY,
    process.env.R2_ACCESS_KEY_ID,
    process.env.R2_SECRET_ACCESS_KEY,
  ].filter(Boolean);

  const server = createServer(async (request, response) => {
    try {
      if (!request.url) return sendJson(response, 400, { error: "missing_url" });
      const url = new URL(request.url, `http://${host}:${port}`);

      if (request.method === "GET" && url.pathname === "/api/config") {
        return sendJson(response, 200, {
          supabaseUrl: process.env.SUPABASE_URL || "",
          supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
        });
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        return sendJson(response, 200, buildStatus());
      }

      if (request.method === "GET" && url.pathname === "/api/release/overview") {
        return sendJson(response, 200, await buildReleaseOverview());
      }

      if (request.method === "POST" && url.pathname === "/api/release/version") {
        return updateRepoVersion(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/settings/repo-root") {
        return updateRepoRoot(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/license-admin") {
        return proxyLicenseAdmin(request, response);
      }

      if (request.method === "POST" && url.pathname === "/api/release/jobs") {
        return createReleaseJob(request, response);
      }

      const jobMatch = url.pathname.match(/^\/api\/release\/jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        return sendJson(response, job ? 200 : 404, job || { error: "job_not_found" });
      }

      if (request.method === "GET") return serveStatic(url.pathname, response);
      sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      sendJson(response, 500, { error: "admin_server_error", message: String(error?.message || error) });
    }
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveServer({
        server,
        host,
        port,
        url: `http://${host}:${port}`,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });

  function buildStatus() {
    const releaseDir = join(repoRoot, "release");
    const releaseFiles = existsSync(releaseDir) ? readdirSync(releaseDir) : [];
    const packageJson = readPackageJson(repoRoot);
    return {
      version: packageJson.version,
      inferredChannel: inferReleaseChannel(packageJson.version),
      repoRoot,
      repoDetected: isKanvasRepo(repoRoot),
      env: {
        adminEnvFile: existsSync(envPath),
        adminEnvPath: envPath,
        supabaseUrl: Boolean(process.env.SUPABASE_URL),
        supabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
        r2AccountId: Boolean(process.env.R2_ACCOUNT_ID),
        r2AccessKeyId: Boolean(process.env.R2_ACCESS_KEY_ID),
        r2SecretAccessKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
        r2BucketName: Boolean(process.env.R2_BUCKET_NAME),
      },
      release: {
        directoryExists: existsSync(releaseDir),
        files: releaseFiles,
        hasInstaller: releaseFiles.includes("KANVAS-Setup.exe"),
        hasLatestYml: releaseFiles.includes("latest.yml"),
        hasBetaYml: releaseFiles.includes("beta.yml"),
        hasBlockmap: releaseFiles.some((file) => file.endsWith(".blockmap")),
      },
    };
  }

  async function buildReleaseOverview() {
    const status = buildStatus();
    const [beta, stable] = await Promise.all([
      readR2Json("manifests/beta/latest-installer.json").catch((error) => ({ error: sanitizeMessage(error) })),
      readR2Json("manifests/stable/latest-installer.json").catch((error) => ({ error: sanitizeMessage(error) })),
    ]);
    return {
      ...status,
      suggestions: suggestedVersions(status.version),
      cloud: {
        beta,
        stable,
      },
      canRelease: status.repoDetected,
    };
  }

  async function proxyLicenseAdmin(request, response) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return sendJson(response, 500, { error: "missing_supabase_env" });

    const body = await readBody(request);
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/license-admin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": anonKey,
        "authorization": request.headers.authorization || "",
      },
      body,
    });
    response.writeHead(upstream.status, { "content-type": "application/json" });
    response.end(await upstream.text());
  }

  async function createReleaseJob(request, response) {
    const body = JSON.parse((await readBody(request)) || "{}");
    const packageJson = readPackageJson(repoRoot);
    const channel = body.channel;
    const mode = body.mode;
    if (!["beta", "stable"].includes(channel)) return sendJson(response, 400, { error: "invalid_channel" });
    if (!["build", "upload", "build_publish"].includes(mode)) return sendJson(response, 400, { error: "invalid_release_mode" });
    if (!existsSync(join(repoRoot, "package.json"))) return sendJson(response, 400, { error: "repo_root_missing", repoRoot });
    if (channel === "stable" && body.confirmation !== `PUBLISH STABLE ${packageJson.version}`) {
      return sendJson(response, 400, { error: "stable_confirmation_required" });
    }
    if (inferReleaseChannel(packageJson.version) !== channel) {
      return sendJson(response, 400, { error: "version_channel_mismatch", version: packageJson.version, channel });
    }
    if ((mode === "upload" || mode === "build_publish") && !hasR2Env()) {
      return sendJson(response, 400, { error: "missing_r2_env" });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job = { id, channel, mode, status: "running", exitCode: null, logs: [`Starting ${mode} for ${channel} ${packageJson.version}...`] };
    jobs.set(id, job);

    const command = commandFor(channel, mode);
    const child = spawn(command.cmd, command.args, {
      cwd: repoRoot,
      shell: true,
      env: process.env,
    });
    child.stdout.on("data", (chunk) => appendLog(job, chunk));
    child.stderr.on("data", (chunk) => appendLog(job, chunk));
    child.on("close", (code) => {
      job.exitCode = code;
      job.status = code === 0 ? "succeeded" : "failed";
      job.logs.push(code === 0 ? "Release command completed." : `Release command failed with exit code ${code}.`);
    });

    sendJson(response, 202, job);
  }

  async function updateRepoVersion(request, response) {
    if (!isKanvasRepo(repoRoot)) return sendJson(response, 400, { error: "repo_root_missing", repoRoot });
    const body = JSON.parse((await readBody(request)) || "{}");
    const version = String(body.version || "").trim();
    if (!isValidReleaseVersion(version)) return sendJson(response, 400, { error: "invalid_release_version" });

    updateJsonFile(join(repoRoot, "package.json"), (json) => ({ ...json, version }));
    const lockPath = join(repoRoot, "package-lock.json");
    if (existsSync(lockPath)) {
      updateJsonFile(lockPath, (json) => {
        json.version = version;
        if (json.packages?.[""]) json.packages[""].version = version;
        return json;
      });
    }

    sendJson(response, 200, { ok: true, version, channel: inferReleaseChannel(version) });
  }

  async function updateRepoRoot(request, response) {
    const body = JSON.parse((await readBody(request)) || "{}");
    const nextRepoRoot = resolve(String(body.repoRoot || "").trim());
    if (!isKanvasRepo(nextRepoRoot)) return sendJson(response, 400, { error: "invalid_kanvas_repo_root" });
    setEnvValue(envPath, "KANVAS_REPO_ROOT", nextRepoRoot);
    process.env.KANVAS_REPO_ROOT = nextRepoRoot;
    repoRoot = nextRepoRoot;
    sendJson(response, 200, { ok: true, repoRoot: nextRepoRoot });
  }

  function commandFor(channel, mode) {
    if (mode === "build") return { cmd: "npm", args: ["run", `electron:installer:${channel}`] };
    if (mode === "upload") return { cmd: "node", args: ["scripts/upload-r2-release.mjs", channel] };
    return { cmd: "npm", args: ["run", `release:${channel}`] };
  }

  function appendLog(job, chunk) {
    const redacted = redact(chunk.toString());
    job.logs.push(...redacted.split(/\r?\n/).filter(Boolean));
    if (job.logs.length > 600) job.logs.splice(0, job.logs.length - 600);
  }

  function redact(value) {
    let output = value;
    for (const secret of secrets) output = output.split(secret).join("[redacted]");
    return output.replace(/(R2_SECRET_ACCESS_KEY|SUPABASE_ANON_KEY|R2_ACCESS_KEY_ID)=\S+/g, "$1=[redacted]");
  }

  function serveStatic(pathname, response) {
    const distRoot = join(adminRoot, "dist");
    const filePath = pathname === "/" ? join(distRoot, "index.html") : join(distRoot, pathname);
    const safePath = resolve(filePath);
    if (!safePath.startsWith(distRoot) || !existsSync(safePath)) return sendJson(response, 404, { error: "not_found" });
    response.writeHead(200, { "content-type": contentType(safePath) });
    createReadStream(safePath).pipe(response);
  }

  async function readR2Json(key) {
    if (!hasR2Env()) return null;
    const request = signedR2Request("GET", key);
    const response = await fetch(request.url, { headers: request.headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 read failed for ${key}: ${response.status} ${response.statusText}`);
    return await response.json();
  }
}

function loadLocalEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function readPackageJson(repoRoot) {
  const packagePath = join(repoRoot, "package.json");
  if (!existsSync(packagePath)) return { version: "0.0.0" };
  return JSON.parse(readFileSync(packagePath, "utf8"));
}

function inferReleaseChannel(version) {
  return /-beta\.\d+$/i.test(version) ? "beta" : "stable";
}

function isValidReleaseVersion(version) {
  return /^\d+\.\d+\.\d+(-beta\.\d+)?$/i.test(version);
}

function isKanvasRepo(path) {
  if (!existsSync(join(path, "package.json"))) return false;
  if (!existsSync(join(path, "electron-builder.config.cjs"))) return false;
  const packageJson = readPackageJson(path);
  return packageJson.name === "kanvas";
}

function suggestedVersions(version) {
  const beta = version.match(/^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/i);
  if (beta) {
    return { beta: `${beta[1]}.${beta[2]}.${beta[3]}-beta.${Number(beta[4]) + 1}`, stable: `${beta[1]}.${beta[2]}.${beta[3]}` };
  }
  const stable = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (stable) {
    return { beta: `${stable[1]}.${stable[2]}.${Number(stable[3]) + 1}-beta.1`, stable: `${stable[1]}.${stable[2]}.${Number(stable[3]) + 1}` };
  }
  return { beta: "0.1.0-beta.1", stable: "0.1.0" };
}

function updateJsonFile(path, update) {
  const json = update(JSON.parse(readFileSync(path, "utf8")));
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

function setEnvValue(path, key, value) {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (!line.match(new RegExp(`^\\s*${key}\\s*=`))) return line;
    found = true;
    return `${key}=${value}`;
  });
  if (!found) next.push(`${key}=${value}`);
  writeFileSync(path, `${next.filter((line, index) => line || index < next.length - 1).join("\n")}\n`);
}

function sanitizeMessage(error) {
  return String(error?.message || error).slice(0, 240);
}

function signedR2Request(method, key) {
  const bucket = process.env.R2_BUCKET_NAME || "kanvas-desktop-releases";
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpointHost = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const encodeKey = (value) => value.split("/").map(encodeURIComponent).join("/");
  const hmac = (secret, value) => createHmac("sha256", secret).update(value).digest();
  const hashHex = (value) => createHash("sha256").update(value).digest("hex");
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const signingKey = hmac(kService, "aws4_request");
  const canonicalUri = `/${bucket}/${encodeKey(key)}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalHeaders = `host:${endpointHost}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    url: `https://${endpointHost}${canonicalUri}`,
    headers: {
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function hasR2Env() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

function contentType(path) {
  return {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  }[extname(path)] || "application/octet-stream";
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
