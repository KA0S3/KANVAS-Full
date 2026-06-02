import { safeStorage } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ActivationSession, LicenseStoreSnapshot } from "./licenseTypes";

export class LicenseStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "licensing", "license-store.json");
  }

  async read(): Promise<LicenseStoreSnapshot> {
    if (!existsSync(this.filePath)) {
      return {};
    }

    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as { encrypted: boolean; data: string };
    const json = parsed.encrypted && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(parsed.data, "base64"))
      : Buffer.from(parsed.data, "base64").toString("utf8");

    return JSON.parse(json);
  }

  async write(snapshot: LicenseStoreSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const json = JSON.stringify(snapshot, null, 2);
    const encrypted = safeStorage.isEncryptionAvailable();
    const data = encrypted
      ? safeStorage.encryptString(json).toString("base64")
      : Buffer.from(json, "utf8").toString("base64");

    await writeFile(this.filePath, JSON.stringify({ encrypted, data }, null, 2), "utf8");
  }

  async getToken(): Promise<string | undefined> {
    return (await this.read()).token;
  }

  async setToken(token: string): Promise<void> {
    const snapshot = await this.read();
    await this.write({ ...snapshot, token });
  }

  async clearToken(): Promise<void> {
    const snapshot = await this.read();
    delete snapshot.token;
    await this.write(snapshot);
  }

  async getDeviceId(): Promise<string | undefined> {
    return (await this.read()).deviceId;
  }

  async setDeviceId(deviceId: string): Promise<void> {
    const snapshot = await this.read();
    await this.write({ ...snapshot, deviceId });
  }

  async setActivationSession(activationSession: ActivationSession): Promise<void> {
    const snapshot = await this.read();
    await this.write({ ...snapshot, activationSession });
  }

  async getActivationSession(): Promise<ActivationSession | undefined> {
    return (await this.read()).activationSession;
  }

  async clearActivationSession(): Promise<void> {
    const snapshot = await this.read();
    delete snapshot.activationSession;
    await this.write(snapshot);
  }

  async setLastHeartbeatAttemptAt(lastHeartbeatAttemptAt: string): Promise<void> {
    const snapshot = await this.read();
    await this.write({ ...snapshot, lastHeartbeatAttemptAt });
  }
}
