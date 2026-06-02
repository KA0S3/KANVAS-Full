import {
  getActiveEntitlement,
  corsHeaders,
  handleError,
  HttpError,
  json,
  randomCode,
  readJson,
  requireUser,
  serviceClient,
  sha256Hex,
} from "../_shared/common.ts";
import { buildLicensePayload, signLicenseToken } from "../_shared/license.ts";

const activeStatuses = ["active", "trial"];
const r2AccountId = Deno.env.get("R2_ACCOUNT_ID")?.trim() ?? "";
const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")?.trim() ?? "";
const r2SecretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")?.trim() ?? "";
const r2Bucket = Deno.env.get("R2_BUCKET_NAME")?.trim() || "kanvas-desktop-releases";
const downloadTokenTtlSeconds = Number(Deno.env.get("DOWNLOAD_LINK_TTL_SECONDS") ?? Deno.env.get("DOWNLOAD_TOKEN_TTL_SECONDS") ?? 15 * 60);
const updateTokenTtlSeconds = Number(Deno.env.get("UPDATE_LINK_TTL_SECONDS") ?? 15 * 60);

const textEncoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hmac = async (key: CryptoKey | Uint8Array | string, value: string): Promise<ArrayBuffer> => {
  const cryptoKey = key instanceof CryptoKey
    ? key
    : await crypto.subtle.importKey(
      "raw",
      typeof key === "string" ? textEncoder.encode(key) : key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  return crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value));
};

const sha256 = async (value: string): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));

const encodeR2Key = (key: string): string => key.split("/").map(encodeURIComponent).join("/");

const assertR2Configured = () => {
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    throw new HttpError(500, "r2_not_configured");
  }
};

const r2SignedUrl = async (key: string, expiresSeconds: number, download = false): Promise<string> => {
  assertR2Configured();
  const host = `${r2AccountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${r2AccessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  });
  if (download) {
    query.set("response-content-disposition", `attachment; filename="${key.split("/").pop() ?? "download"}"`);
  }

  const canonicalUri = `/${r2Bucket}/${encodeR2Key(key)}`;
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256(canonicalRequest)].join("\n");
  const kDate = new Uint8Array(await hmac(`AWS4${r2SecretAccessKey}`, dateStamp));
  const kRegion = new Uint8Array(await hmac(kDate, "auto"));
  const kService = new Uint8Array(await hmac(kRegion, "s3"));
  const kSigning = new Uint8Array(await hmac(kService, "aws4_request"));
  query.set("X-Amz-Signature", toHex(await hmac(kSigning, stringToSign)));
  const signedQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");

  return `https://${host}${canonicalUri}?${signedQuery}`;
};

const readR2Json = async <T>(key: string): Promise<T | null> => {
  const response = await fetch(await r2SignedUrl(key, 60));
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(502, "r2_read_failed", { key, status: response.status });
  return await response.json() as T;
};

const readR2Text = async (key: string): Promise<string | null> => {
  const response = await fetch(await r2SignedUrl(key, 60));
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(502, "r2_read_failed", { key, status: response.status });
  return await response.text();
};

const activeEntitlementById = async (supabase: ReturnType<typeof serviceClient>, entitlementId: string, channel: string) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("entitlements")
    .select("*")
    .eq("id", entitlementId)
    .in("status", activeStatuses)
    .contains("allowed_channels", [channel])
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();

  if (error) throw error;
  return data;
};

const startActivation = async (request: Request) => {
  const { user } = await requireUser(request);
  const body = await readJson<any>(request);
  const channel = body.channel ?? "stable";
  if (!body.state) throw new HttpError(400, "state_required");
  if (!body.device_id) throw new HttpError(400, "device_id_required");
  const entitlement = await getActiveEntitlement(serviceClient(), user.id, channel);
  if (!entitlement) throw new HttpError(402, "active_entitlement_required");

  const code = randomCode();
  const redirectUri = body.redirect_uri ?? Deno.env.get("APP_DEEP_LINK_SCHEME") ?? "kanvas://activate";
  if (!String(redirectUri).startsWith("kanvas://activate")) throw new HttpError(400, "invalid_redirect_uri");

  const { error } = await serviceClient().from("activation_requests").insert({
    code_hash: await sha256Hex(code),
    state: body.state,
    user_id: user.id,
    device_id: body.device_id,
    device_name: body.device_name ?? null,
    platform: body.platform ?? null,
    app_version: body.app_version ?? null,
    channel,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  const redirectUrl = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(body.state)}`;
  return json(request, { code, state: body.state, redirect_uri: redirectUri, redirect_url: redirectUrl });
};

const chooseEviction = (devices: any[]) =>
  [...devices].sort((a, b) => {
    if (!a.last_seen_at && b.last_seen_at) return -1;
    if (a.last_seen_at && !b.last_seen_at) return 1;
    const seen = new Date(a.last_seen_at ?? 0).getTime() - new Date(b.last_seen_at ?? 0).getTime();
    if (seen !== 0) return seen;
    return new Date(a.first_activated_at).getTime() - new Date(b.first_activated_at).getTime();
  })[0];

const activateDevice = async (supabase: ReturnType<typeof serviceClient>, entitlement: any, requestRow: any, body: any) => {
  const now = new Date().toISOString();
  const { data: activeSame, error: sameError } = await supabase
    .from("device_activations")
    .select("*")
    .eq("entitlement_id", entitlement.id)
    .eq("device_id", requestRow.device_id)
    .eq("active", true)
    .maybeSingle();
  if (sameError) throw sameError;

  if (activeSame) {
    const { data, error } = await supabase
      .from("device_activations")
      .update({
        app_version: body.app_version ?? requestRow.app_version,
        channel: requestRow.channel,
        last_seen_at: now,
      })
      .eq("id", activeSame.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data: activeDevices, error: devicesError } = await supabase
    .from("device_activations")
    .select("*")
    .eq("entitlement_id", entitlement.id)
    .eq("active", true);
  if (devicesError) throw devicesError;

  if ((activeDevices ?? []).length >= entitlement.allowed_devices) {
    const evict = chooseEviction(activeDevices ?? []);
    if (evict) {
      const { error } = await supabase
        .from("device_activations")
        .update({ active: false, deactivated_at: now, deactivation_reason: "device_limit_eviction" })
        .eq("id", evict.id);
      if (error) throw error;
    }
  }

  const { data: inactiveSame } = await supabase
    .from("device_activations")
    .select("*")
    .eq("entitlement_id", entitlement.id)
    .eq("device_id", requestRow.device_id)
    .eq("active", false)
    .order("first_activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inactiveSame) {
    const { data, error } = await supabase
      .from("device_activations")
      .update({
        active: true,
        device_name: requestRow.device_name,
        platform: requestRow.platform,
        app_version: body.app_version ?? requestRow.app_version,
        channel: requestRow.channel,
        last_seen_at: now,
        deactivated_at: null,
        deactivation_reason: null,
      })
      .eq("id", inactiveSame.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("device_activations")
    .insert({
      user_id: requestRow.user_id,
      entitlement_id: entitlement.id,
      device_id: requestRow.device_id,
      device_name: requestRow.device_name,
      platform: requestRow.platform,
      app_version: body.app_version ?? requestRow.app_version,
      channel: requestRow.channel,
      active: true,
      last_seen_at: now,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

const completeActivation = async (request: Request) => {
  const body = await readJson<any>(request);
  const supabase = serviceClient();
  if (!body.code) throw new HttpError(400, "code_required");
  if (!body.state) throw new HttpError(400, "state_required");
  if (!body.device_id) throw new HttpError(400, "device_id_required");
  const codeHash = await sha256Hex(String(body.code ?? ""));
  const { data: requestRow, error } = await supabase
    .from("activation_requests")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (error) throw error;
  if (!requestRow) throw new HttpError(404, "activation_code_not_found");
  if (requestRow.used_at) throw new HttpError(409, "activation_code_used");
  if (new Date(requestRow.expires_at).getTime() <= Date.now()) throw new HttpError(410, "activation_code_expired");
  if (requestRow.state !== body.state) throw new HttpError(400, "state_mismatch");
  if (requestRow.device_id !== body.device_id) throw new HttpError(400, "device_mismatch");

  const channel = body.channel ?? requestRow.channel;
  const entitlement = await getActiveEntitlement(supabase, requestRow.user_id, channel);
  if (!entitlement) throw new HttpError(402, "active_entitlement_required");

  const activation = await activateDevice(supabase, entitlement, requestRow, body);
  await supabase.from("activation_requests").update({ used_at: new Date().toISOString() }).eq("id", requestRow.id);

  const payload = buildLicensePayload(entitlement, activation, body.app_version ?? requestRow.app_version ?? "unknown", channel);
  return json(request, { license_token: await signLicenseToken(payload), token_payload: payload });
};

const heartbeat = async (request: Request) => {
  const body = await readJson<any>(request);
  const supabase = serviceClient();
  const channel = body.channel ?? "stable";
  const entitlementId = body.entitlement_id ?? body.license_id;
  if (!entitlementId) throw new HttpError(400, "entitlement_id_required");
  if (!body.device_id) throw new HttpError(400, "device_id_required");
  if (!body.device_activation_id) throw new HttpError(400, "device_activation_id_required");
  const entitlement = await activeEntitlementById(supabase, entitlementId, channel);
  if (!entitlement) {
    const { data: lockedEntitlement } = await supabase
      .from("entitlements")
      .select("id,user_id")
      .eq("id", entitlementId)
      .maybeSingle();
    if (lockedEntitlement) {
      await supabase.from("license_heartbeats").insert({
        user_id: lockedEntitlement.user_id,
        entitlement_id: lockedEntitlement.id,
        device_activation_id: body.device_activation_id ?? null,
        device_id: body.device_id,
        status: "locked",
        app_version: body.app_version ?? null,
        channel,
        reason: "entitlement_invalid",
      });
    }
    throw new HttpError(403, "entitlement_invalid", { reason: "entitlement_invalid" });
  }

  const { data: activation, error } = await supabase
    .from("device_activations")
    .select("*")
    .eq("id", body.device_activation_id)
    .eq("entitlement_id", entitlement.id)
    .eq("device_id", body.device_id)
    .maybeSingle();
  if (error) throw error;
  if (!activation || !activation.active) {
    await supabase.from("license_heartbeats").insert({
      user_id: entitlement.user_id,
      entitlement_id: entitlement.id,
      device_activation_id: body.device_activation_id ?? null,
      device_id: body.device_id,
      status: "device_deactivated",
      app_version: body.app_version ?? null,
      channel,
      reason: "device_deactivated",
    });
    throw new HttpError(409, "device_deactivated", { reason: "device_deactivated" });
  }

  const now = new Date().toISOString();
  await supabase.from("device_activations").update({ last_seen_at: now, app_version: body.app_version ?? activation.app_version }).eq("id", activation.id);
  await supabase.from("license_heartbeats").insert({
    user_id: entitlement.user_id,
    entitlement_id: entitlement.id,
    device_activation_id: activation.id,
    device_id: body.device_id,
    status: "active",
    app_version: body.app_version ?? null,
    channel,
  });

  const payload = buildLicensePayload(entitlement, activation, body.app_version ?? activation.app_version ?? "unknown", channel);
  return json(request, { license_token: await signLicenseToken(payload), token_payload: payload });
};

type InstallerManifest = {
  channel: "stable" | "beta";
  version: string;
  storage_path: string;
  object_key?: string;
  file_name?: string;
  uploaded_at?: string;
};

type UpdateManifest = {
  channel: "stable" | "beta";
  version: string;
  metadata_file: string;
  metadata_key: string;
  artifacts: { file_name: string; object_key: string }[];
  uploaded_at?: string;
};

const downloadBaseUrl = (request: Request) => {
  const url = new URL(request.url);
  url.search = "";
  url.pathname = url.pathname.replace(/\/download-access$/, "/download");
  return url.toString();
};

const readInstallerManifest = async (
  channel: "stable" | "beta",
): Promise<InstallerManifest | null> => {
  const manifest = await readR2Json<InstallerManifest>(`manifests/${channel}/latest-installer.json`);
  if (!manifest) return null;
  if (manifest.channel !== channel || !manifest.version || !manifest.storage_path) {
    throw new HttpError(500, "download_manifest_invalid", { channel });
  }

  return manifest;
};

const createDownloadLink = async (
  request: Request,
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  channel: "stable" | "beta",
  manifest: InstallerManifest | null,
) => {
  if (!manifest) return "";

  const rawToken = randomCode();
  const expiresAt = new Date(Date.now() + downloadTokenTtlSeconds * 1000).toISOString();
  const { error } = await supabase.from("download_tokens").insert({
    token_hash: await sha256Hex(rawToken),
    user_id: userId,
    channel,
    version: manifest.version,
    storage_path: manifest.object_key ?? manifest.storage_path,
    expires_at: expiresAt,
  });
  if (error) throw error;

  const url = new URL(downloadBaseUrl(request));
  url.searchParams.set("token", rawToken);
  return { url: url.toString(), expiresAt };
};

const downloadAccess = async (request: Request) => {
  const { user } = await requireUser(request);
  const supabase = serviceClient();
  const [stableEntitlement, betaEntitlement, stableManifest, betaManifest] = await Promise.all([
    getActiveEntitlement(supabase, user.id, "stable"),
    getActiveEntitlement(supabase, user.id, "beta"),
    readInstallerManifest("stable"),
    readInstallerManifest("beta"),
  ]);
  if (!stableEntitlement && !betaEntitlement) throw new HttpError(402, "active_entitlement_required");

  const stableLink = stableEntitlement ? await createDownloadLink(request, supabase, user.id, "stable", stableManifest) : "";
  const betaLink = betaEntitlement ? await createDownloadLink(request, supabase, user.id, "beta", betaManifest) : "";
  const expiresAt = [stableLink && stableLink.expiresAt, betaLink && betaLink.expiresAt].filter(Boolean).sort()[0];

  return json(request, {
    expires_at: expiresAt || undefined,
    stable_available: Boolean(stableManifest),
    channels: {
      stable: stableLink ? stableLink.url : "",
      beta: betaLink ? betaLink.url : "",
    },
  });
};

const download = async (request: Request) => {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) throw new HttpError(400, "token_required");

  const supabase = serviceClient();
  const tokenHash = await sha256Hex(token);
  const { data: row, error } = await supabase
    .from("download_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new HttpError(404, "download_token_not_found");
  if (row.used_at) throw new HttpError(409, "download_token_used");
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new HttpError(410, "download_token_expired");

  const { error: updateError } = await supabase
    .from("download_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);
  if (updateError) throw updateError;

  return Response.redirect(await r2SignedUrl(row.storage_path, downloadTokenTtlSeconds, true), 302);
};

const updateFeedBaseUrl = (request: Request, token: string) => {
  const url = new URL(request.url);
  url.search = "";
  url.pathname = url.pathname.replace(/\/update-check$/, `/update-feed/${token}/`);
  return url.toString();
};

const updateArtifactUrl = (request: Request, token: string, file: string) => {
  const url = new URL(request.url);
  url.search = "";
  url.pathname = url.pathname.replace(/\/update-feed(?:\/[^/]+\/[^/]*)?$/, `/update-artifact/${token}/${file}`);
  return url.toString();
};

const readUpdateManifest = async (channel: "stable" | "beta"): Promise<UpdateManifest | null> => {
  const manifest = await readR2Json<UpdateManifest>(`updates/${channel}/update-manifest.json`);
  if (!manifest) return null;
  if (manifest.channel !== channel || !manifest.version || !manifest.metadata_key || !Array.isArray(manifest.artifacts)) {
    throw new HttpError(500, "update_manifest_invalid", { channel });
  }
  return manifest;
};

const updateCheck = async (request: Request) => {
  const body = await readJson<any>(request);
  const supabase = serviceClient();
  const channel = body.channel === "beta" ? "beta" : "stable";
  const entitlementId = body.entitlement_id ?? body.license_id;
  if (!entitlementId) throw new HttpError(400, "entitlement_id_required");
  if (!body.device_id) throw new HttpError(400, "device_id_required");
  if (!body.device_activation_id) throw new HttpError(400, "device_activation_id_required");

  const entitlement = await activeEntitlementById(supabase, entitlementId, channel);
  if (!entitlement) throw new HttpError(403, "entitlement_invalid");

  const { data: activation, error } = await supabase
    .from("device_activations")
    .select("*")
    .eq("id", body.device_activation_id)
    .eq("entitlement_id", entitlement.id)
    .eq("device_id", body.device_id)
    .maybeSingle();
  if (error) throw error;
  if (!activation || !activation.active) throw new HttpError(409, "device_deactivated");

  const manifest = await readUpdateManifest(channel);
  if (!manifest) {
    return json(request, {
      available: false,
      channel,
      message: "No update feed is available for this channel.",
    });
  }

  const rawToken = randomCode();
  const expiresAt = new Date(Date.now() + updateTokenTtlSeconds * 1000).toISOString();
  const { error: insertError } = await supabase.from("desktop_update_tokens").insert({
    token_hash: await sha256Hex(rawToken),
    user_id: entitlement.user_id,
    entitlement_id: entitlement.id,
    device_activation_id: activation.id,
    channel,
    version: manifest.version,
    expires_at: expiresAt,
  });
  if (insertError) throw insertError;

  return json(request, {
    available: true,
    channel,
    version: manifest.version,
    expires_at: expiresAt,
    feed_url: updateFeedBaseUrl(request, rawToken),
  });
};

const updateTokenRow = async (token: string) => {
  const supabase = serviceClient();
  const { data: row, error } = await supabase
    .from("desktop_update_tokens")
    .select("*")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new HttpError(404, "update_token_not_found");
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new HttpError(410, "update_token_expired");
  return row;
};

const extractPathToken = (path: string, prefix: string): { token: string; file?: string } | null => {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length).replace(/^\/+/, "");
  const [token, ...fileParts] = rest.split("/");
  if (!token) return null;
  return { token, file: fileParts.join("/") || undefined };
};

const updateFeed = async (request: Request, tokenOverride?: string) => {
  const url = new URL(request.url);
  const token = tokenOverride ?? url.searchParams.get("token")?.trim();
  if (!token) throw new HttpError(400, "token_required");

  const row = await updateTokenRow(token);
  const manifest = await readUpdateManifest(row.channel);
  if (!manifest) throw new HttpError(404, "update_manifest_not_found");
  const yml = await readR2Text(manifest.metadata_key);
  if (!yml) throw new HttpError(404, "update_metadata_not_found");

  const rewritten = yml.replace(/^(\s*url:\s*)(.+)$/gm, (_match, prefix, value) => {
    const file = String(value).trim().replace(/^["']|["']$/g, "").split("/").pop() || "KANVAS-Setup.exe";
    return `${prefix}${updateArtifactUrl(request, token, file)}`;
  });

  return new Response(rewritten, {
    headers: { ...corsHeaders(request), "content-type": "text/yaml; charset=utf-8" },
  });
};

const updateArtifact = async (request: Request, tokenOverride?: string, fileOverride?: string) => {
  const url = new URL(request.url);
  const token = tokenOverride ?? url.searchParams.get("token")?.trim();
  const file = fileOverride ?? url.searchParams.get("file")?.trim();
  if (!token) throw new HttpError(400, "token_required");
  if (!file) throw new HttpError(400, "file_required");

  const row = await updateTokenRow(token);
  const manifest = await readUpdateManifest(row.channel);
  const artifact = manifest?.artifacts.find((item) => item.file_name === file);
  if (!artifact) throw new HttpError(404, "update_artifact_not_found");

  return Response.redirect(await r2SignedUrl(artifact.object_key, updateTokenTtlSeconds, true), 302);
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: json(request, {}).headers });

  try {
    const path = new URL(request.url).pathname.replace(/^\/desktop/, "");
    if (request.method === "POST" && path === "/activation/start") return await startActivation(request);
    if (request.method === "POST" && path === "/activation/complete") return await completeActivation(request);
    if (request.method === "POST" && path === "/license/heartbeat") return await heartbeat(request);
    if (request.method === "GET" && path === "/download-access") return await downloadAccess(request);
    if (request.method === "GET" && path === "/download") return await download(request);
    if (request.method === "POST" && path === "/update-check") return await updateCheck(request);
    if (request.method === "GET" && path === "/update-feed") return await updateFeed(request);
    if (request.method === "GET" && path === "/update-artifact") return await updateArtifact(request);
    const feedPath = extractPathToken(path, "/update-feed");
    if (request.method === "GET" && feedPath?.token) return await updateFeed(request, feedPath.token);
    const artifactPath = extractPathToken(path, "/update-artifact");
    if (request.method === "GET" && artifactPath?.token && artifactPath.file) {
      return await updateArtifact(request, artifactPath.token, artifactPath.file);
    }
    throw new HttpError(404, "route_not_found");
  } catch (error) {
    return handleError(request, error);
  }
});
