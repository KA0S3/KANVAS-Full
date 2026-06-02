import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";
import "./styles.css";

type Tab = "status" | "promo" | "release" | "audit";
type Status = {
  version: string;
  inferredChannel: "beta" | "stable";
  repoRoot?: string;
  repoDetected?: boolean;
  env: Record<string, boolean | string>;
  release: { files: string[]; hasInstaller: boolean; hasLatestYml: boolean; hasBetaYml: boolean; hasBlockmap: boolean };
};
type ReleaseOverview = Status & {
  suggestions: { beta: string; stable: string };
  cloud: {
    beta: any;
    stable: any;
  };
  canRelease: boolean;
};
type AccessKey = {
  id: string;
  label: string | null;
  plan: string;
  allowed_devices: number;
  allowed_channels: string[];
  max_redemptions: number;
  redemption_count: number;
  status: string;
  expires_at: string | null;
  created_at: string;
};

function App() {
  const [tab, setTab] = useState<Tab>("status");
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<{ role: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchJson("/api/config").then((config) => {
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        setMessage("Add tools/kanvas-admin/.env.admin.local with SUPABASE_URL and SUPABASE_ANON_KEY.");
        return;
      }
      const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true } });
      setClient(supabase);
      supabase.auth.getSession().then(({ data }) => setSession(data.session));
      supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    });
    refreshStatus(setStatus);
  }, []);

  useEffect(() => {
    if (!session) {
      setAdmin(null);
      return;
    }
    adminAction(session, { action: "admin_status" })
      .then((data) => setAdmin(data.admin))
      .catch(() => setAdmin(null));
  }, [session]);

  const signedIn = Boolean(session);
  const blocked = signedIn && !admin;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local Owner Tool</p>
          <h1>KANVAS Admin</h1>
        </div>
        <AuthBox client={client} session={session} admin={admin} />
      </header>

      {message && <div className="notice warning">{message}</div>}
      {blocked && <div className="notice danger">Signed in, but this user is not in admin_users or the admin check failed.</div>}

      <nav className="tabs">
        {(["status", "promo", "release", "audit"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {labelFor(item)}
          </button>
        ))}
      </nav>

      {tab === "status" && <StatusTab status={status} session={session} admin={admin} onRefresh={() => refreshStatus(setStatus)} />}
      {tab === "promo" && <PromoTab session={session} disabled={!admin} />}
      {tab === "release" && <ReleaseTab disabled={!admin} />}
      {tab === "audit" && <AuditTab session={session} disabled={!admin} />}
    </main>
  );
}

function AuthBox({ client, session, admin }: { client: SupabaseClient | null; session: Session | null; admin: { role: string } | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) {
    return (
      <section className="auth-box">
        <strong>{session.user.email}</strong>
        <span>{admin ? `Admin: ${admin.role}` : "Checking admin..."}</span>
        <button onClick={() => client?.auth.signOut()}>Sign out</button>
      </section>
    );
  }

  return (
    <form
      className="auth-box"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!client) return;
        setBusy(true);
        await client.auth.signInWithPassword({ email, password });
        setBusy(false);
      }}
    >
      <input placeholder="owner email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <button disabled={busy || !client}>Sign in</button>
    </form>
  );
}

function StatusTab({ status, session, admin, onRefresh }: { status: Status | null; session: Session | null; admin: { role: string } | null; onRefresh: () => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Status</h2>
        <button onClick={onRefresh}>Refresh</button>
      </div>
      <div className="status-grid">
        <Metric label="Login" value={session?.user.email || "Not signed in"} tone={session ? "good" : "warn"} />
        <Metric label="Admin" value={admin?.role || "Not verified"} tone={admin ? "good" : "warn"} />
        <Metric label="Version" value={status?.version || "Unknown"} />
        <Metric label="Channel" value={status?.inferredChannel || "Unknown"} />
      </div>
      {status && (
        <>
          <h3>Environment</h3>
          <div className="checks">
            {Object.entries(status.env).map(([key, value]) => (
              <Metric
                key={key}
                label={key}
                value={typeof value === "string" ? value || "Missing" : value ? "Set" : "Missing"}
                tone={typeof value === "string" || value ? "good" : "warn"}
              />
            ))}
          </div>
          <h3>Release Folder</h3>
          <p className="muted">Repo root: {status.repoRoot || "Not set"}</p>
          <p className="muted">{status.release.files.length ? status.release.files.join(", ") : "No release artifacts detected."}</p>
        </>
      )}
    </section>
  );
}

function PromoTab({ session, disabled }: { session: Session | null; disabled: boolean }) {
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [status, setStatus] = useState("all");
  const [plaintext, setPlaintext] = useState("");
  const [form, setForm] = useState({ label: "", plan: "stable", channels: "stable", devices: 2, max: 1, expires: "", active: true });

  const load = () => session && adminAction(session, { action: "list_access_keys", status }).then((data) => setKeys(data.access_keys || []));
  useEffect(load, [session, status]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Promo Codes</h2>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      {plaintext && (
        <div className="notice success">
          <strong>Generated code:</strong> <code>{plaintext}</code>
          <button onClick={() => navigator.clipboard.writeText(plaintext)}>Copy</button>
          <button onClick={() => setPlaintext("")}>Clear</button>
          <span>Shown once. It cannot be retrieved later.</span>
        </div>
      )}
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!session) return;
          const data = await adminAction(session, {
            action: "create_access_key",
            label: form.label || null,
            plan: form.plan,
            allowed_channels: splitCsv(form.channels),
            allowed_devices: Number(form.devices),
            max_redemptions: Number(form.max),
            expires_at: form.expires || null,
            status: form.active ? "active" : "revoked",
          });
          setPlaintext(data.plaintext_key);
          load();
        }}
      >
        <input placeholder="label" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
        <input placeholder="plan" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} />
        <input placeholder="channels" value={form.channels} onChange={(event) => setForm({ ...form, channels: event.target.value })} />
        <input type="number" min="1" value={form.devices} onChange={(event) => setForm({ ...form, devices: Number(event.target.value) })} />
        <input type="number" min="1" value={form.max} onChange={(event) => setForm({ ...form, max: Number(event.target.value) })} />
        <input type="datetime-local" value={form.expires} onChange={(event) => setForm({ ...form, expires: event.target.value })} />
        <label className="check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label>
        <button disabled={disabled}>Create code</button>
      </form>
      <div className="table">
        <div className="row header"><span>Label</span><span>Plan</span><span>Channels</span><span>Devices</span><span>Uses</span><span>Status</span><span>Expiry</span><span></span></div>
        {keys.map((key) => <PromoRow key={key.id} accessKey={key} session={session} disabled={disabled} onChange={load} />)}
      </div>
    </section>
  );
}

function PromoRow({ accessKey, session, disabled, onChange }: { accessKey: AccessKey; session: Session | null; disabled: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...accessKey, expires_at: toDatetimeLocal(accessKey.expires_at) });
  const save = async () => {
    if (!session) return;
    await adminAction(session, {
      action: "update_access_key",
      access_key_id: accessKey.id,
      label: draft.label,
      plan: draft.plan,
      allowed_devices: Number(draft.allowed_devices),
      allowed_channels: draft.allowed_channels,
      max_redemptions: Number(draft.max_redemptions),
      expires_at: draft.expires_at || null,
      status: draft.status,
    });
    setEditing(false);
    onChange();
  };
  return (
    <div className="row">
      <span>{editing ? <input value={draft.label || ""} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /> : accessKey.label || "Unlabeled"}</span>
      <span>{editing ? <input value={draft.plan} onChange={(event) => setDraft({ ...draft, plan: event.target.value })} /> : accessKey.plan}</span>
      <span>{editing ? <input value={draft.allowed_channels.join(",")} onChange={(event) => setDraft({ ...draft, allowed_channels: splitCsv(event.target.value) })} /> : accessKey.allowed_channels.join(", ")}</span>
      <span>{editing ? <input type="number" value={draft.allowed_devices} onChange={(event) => setDraft({ ...draft, allowed_devices: Number(event.target.value) })} /> : accessKey.allowed_devices}</span>
      <span>{accessKey.redemption_count}/{editing ? <input type="number" min="1" value={draft.max_redemptions} onChange={(event) => setDraft({ ...draft, max_redemptions: Number(event.target.value) })} /> : accessKey.max_redemptions}</span>
      <span>{editing ? <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>active</option><option>revoked</option><option>expired</option></select> : accessKey.status}</span>
      <span>{editing ? <input type="datetime-local" value={draft.expires_at || ""} onChange={(event) => setDraft({ ...draft, expires_at: event.target.value })} /> : accessKey.expires_at ? new Date(accessKey.expires_at).toLocaleString() : "Never"}</span>
      <span className="actions">
        {editing ? <button onClick={save} disabled={disabled}>Save</button> : <button onClick={() => setEditing(true)} disabled={disabled}>Edit</button>}
        <button disabled={disabled || accessKey.status === "revoked"} onClick={async () => { session && await adminAction(session, { action: "revoke_access_key", access_key_id: accessKey.id }); onChange(); }}>Revoke</button>
      </span>
    </div>
  );
}

function ReleaseTab({ disabled }: { disabled: boolean }) {
  const [overview, setOverview] = useState<ReleaseOverview | null>(null);
  const [targetChannel, setTargetChannel] = useState<"beta" | "stable">("beta");
  const [targetVersion, setTargetVersion] = useState("");
  const [repoRoot, setRepoRoot] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [job, setJob] = useState<any>(null);
  const isStable = targetChannel === "stable";
  const expectedConfirmation = `PUBLISH STABLE ${targetVersion}`;
  const selectedCloud = overview?.cloud?.[targetChannel];

  const load = async () => {
    const next = await fetchJson("/api/release/overview");
    setOverview(next);
    setRepoRoot(next.repoRoot || "");
    const suggested = next.suggestions?.[targetChannel] || next.version || "";
    setTargetVersion((current) => current || suggested);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!overview) return;
    setTargetVersion(overview.suggestions?.[targetChannel] || overview.version || "");
    setConfirmation("");
  }, [targetChannel, overview?.version]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(async () => {
      const next = await fetchJson(`/api/release/jobs/${job.id}`);
      setJob(next);
      if (next.status !== "running") load();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  const saveVersion = async () => {
    await fetchJson("/api/release/version", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: targetVersion }),
    });
    await load();
  };

  const saveRepoRoot = async () => {
    await fetchJson("/api/settings/repo-root", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoRoot }),
    });
    await load();
  };

  const run = async (mode: "build" | "upload" | "build_publish") => {
    await saveVersion();
    const next = await fetchJson("/api/release/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: targetChannel, mode, confirmation }),
    });
    setJob(next);
  };

  const versionMatchesChannel = inferChannel(targetVersion) === targetChannel;
  const canRun = !disabled && Boolean(overview?.canRelease) && isValidReleaseVersion(targetVersion) && versionMatchesChannel;
  const stableConfirmed = !isStable || confirmation === expectedConfirmation;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Release KANVAS</h2>
        <button onClick={load}>Refresh cloud + repo</button>
      </div>
      <p className="muted">Use this after making app changes. Confirm the repo, choose beta or stable, set the version, then build and publish to the updater feed.</p>

      <div className="status-grid">
        <Metric label="Repo detected" value={overview?.repoDetected ? "Yes" : "No"} tone={overview?.repoDetected ? "good" : "warn"} />
        <Metric label="Repo package version" value={overview?.version || "Unknown"} tone={overview?.inferredChannel === "beta" ? "good" : "warn"} />
        <Metric label="Detected local channel" value={overview?.inferredChannel || "Unknown"} tone={overview?.inferredChannel === "beta" ? "good" : "warn"} />
        <Metric label="Release folder" value={overview?.release?.hasInstaller ? "Artifacts found" : "No installer yet"} tone={overview?.release?.hasInstaller ? "good" : "warn"} />
      </div>

      <label className="full">
        KANVAS repo folder used for building
        <input value={repoRoot} onChange={(event) => setRepoRoot(event.target.value)} placeholder="C:/Users/shade/Desktop/Projects/.../vFANTASY/V3.9.7" />
      </label>
      <div className="button-row">
        <button disabled={disabled || !repoRoot} onClick={saveRepoRoot}>Use this repo folder</button>
      </div>

      {!overview?.repoDetected && (
        <div className="notice danger">Release actions are disabled because this folder is not a KANVAS repo. Point it at the folder containing package.json and electron-builder.config.cjs.</div>
      )}

      <div className="release-grid">
        <section className={`release-card ${targetChannel === "beta" ? "selected" : ""}`}>
          <button onClick={() => setTargetChannel("beta")}>Beta release</button>
          <p>For normal test builds. User computers on beta update from this channel.</p>
          <strong>Online beta: {cloudVersion(overview?.cloud?.beta)}</strong>
          <span>Suggested next: {overview?.suggestions?.beta || "Unknown"}</span>
        </section>
        <section className={`release-card ${targetChannel === "stable" ? "selected" : ""}`}>
          <button onClick={() => setTargetChannel("stable")}>Stable release</button>
          <p>Use later when you intentionally promote to stable.</p>
          <strong>Online stable: {cloudVersion(overview?.cloud?.stable)}</strong>
          <span>Suggested next: {overview?.suggestions?.stable || "Unknown"}</span>
        </section>
      </div>

      <label className="full">
        Version to build and publish
        <input value={targetVersion} onChange={(event) => setTargetVersion(event.target.value.trim())} placeholder={targetChannel === "beta" ? "0.4.0-beta.2" : "0.4.0"} />
      </label>
      {!versionMatchesChannel && <div className="notice danger">This version does not match the selected {targetChannel} channel.</div>}
      {!isValidReleaseVersion(targetVersion) && <div className="notice warning">Use normal semver like 0.4.0 or beta semver like 0.4.0-beta.2.</div>}

      <div className="status-grid">
        <Metric label="Selected channel" value={targetChannel} />
        <Metric label="Online selected version" value={cloudVersion(selectedCloud)} />
        <Metric label="Expected metadata" value={targetChannel === "beta" ? "beta.yml" : "latest.yml"} />
        <Metric label="Will publish to" value={`updates/${targetChannel}`} />
      </div>

      <div className="button-row">
        <button disabled={disabled || !overview?.repoDetected || !isValidReleaseVersion(targetVersion)} onClick={saveVersion}>Save version only</button>
      </div>

      {isStable && (
        <label className="full">
          Stable confirmation required
          <input placeholder={expectedConfirmation} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
      )}
      <div className="button-row">
        <button disabled={!canRun} onClick={() => run("build")}>Build installer only</button>
        <button disabled={!canRun || !stableConfirmed} onClick={() => run("upload")}>Publish existing release folder</button>
        <button disabled={!canRun || !stableConfirmed} onClick={() => run("build_publish")}>Build + publish update</button>
      </div>
      <p className="muted">Build + publish runs the existing root script for the selected channel, uploads to R2, and user computers update from the `updates/{targetChannel}` feed.</p>

      {job && (
        <div className={`logs ${job.status}`}>
          <div className="panel-header"><strong>{job.status}</strong><span>{job.exitCode === null ? "" : `exit ${job.exitCode}`}</span></div>
          <pre>{(job.logs || []).join("\n")}</pre>
        </div>
      )}
    </section>
  );
}

function AuditTab({ session, disabled }: { session: Session | null; disabled: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => session && adminAction(session, { action: "list_audit", limit: 100 }).then((data) => setRows(data.audit_log || []));
  useEffect(load, [session]);
  return (
    <section className="panel">
      <div className="panel-header"><h2>Audit</h2><button disabled={disabled} onClick={load}>Refresh</button></div>
      <div className="table audit-table">
        <div className="row header"><span>Time</span><span>Action</span><span>Target</span><span>Metadata</span></div>
        {rows.map((row) => (
          <div className="row" key={row.id}>
            <span>{new Date(row.created_at).toLocaleString()}</span>
            <span>{row.action}</span>
            <span>{row.target_type}: {row.target_id}</span>
            <span><code>{JSON.stringify(row.metadata || {})}</code></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function labelFor(tab: Tab) {
  return ({ status: "Status", promo: "Promo Codes", release: "Release", audit: "Audit" } as Record<Tab, string>)[tab];
}

function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function isValidReleaseVersion(version: string) {
  return /^\d+\.\d+\.\d+(-beta\.\d+)?$/i.test(version);
}

function inferChannel(version: string) {
  return /-beta\.\d+$/i.test(version) ? "beta" : "stable";
}

function cloudVersion(value: any) {
  if (!value) return "Not found";
  if (value.error) return "Read failed";
  return value.version || "Unknown";
}

function refreshStatus(setStatus: (status: Status) => void) {
  fetchJson("/api/status").then(setStatus);
}

async function adminAction(session: Session, body: Record<string, unknown>) {
  return fetchJson("/api/license-admin", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
}

createRoot(document.getElementById("root")!).render(<App />);
