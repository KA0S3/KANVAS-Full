/**
 * INDEXEDDB SETUP WITH ZONE SEPARATION
 * 
 * This module sets up IndexedDB with strict zone separation as defined in the plan.
 * Each zone has its own table and never mixes with other zones.
 * 
 * 🔒 CRITICAL: Zone separation must NEVER be violated
 */

import Dexie, { Table } from 'dexie';
import type { Asset } from '@/types/Asset';
import type { SyncQueueEntry } from '@/types/SyncTypes';
import { validateAssetStrict, FORBIDDEN_ASSET_FIELDS } from '@/types/Safeguards';
import { createId } from '@/utils/id';
import { USE_SUPABASE } from '@/config/features';

export const REQUIRED_OBJECT_STORES = [
  'projects',
  'assets',
  'files',
  'syncQueue',
  'migrationProgress',
] as const;

export class IndexedDBSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndexedDBSchemaError';
  }
}

const getNativeObjectStoreNames = (databaseName: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new IndexedDBSchemaError('Browser IndexedDB API is unavailable'));
      return;
    }

    const request = globalThis.indexedDB.open(databaseName);

    request.onerror = () => {
      reject(request.error || new IndexedDBSchemaError(`Failed to open native IndexedDB database ${databaseName}`));
    };

    request.onsuccess = () => {
      const nativeDb = request.result;
      const storeNames = Array.from(nativeDb.objectStoreNames);
      nativeDb.close();
      resolve(storeNames);
    };
  });
};

const deleteNativeDatabase = (databaseName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(databaseName);
    request.onerror = () => reject(request.error || new Error(`Failed to delete IndexedDB database ${databaseName}`));
    request.onblocked = () => reject(new Error(`Delete blocked for IndexedDB database ${databaseName}; close other tabs and retry`));
    request.onsuccess = () => resolve();
  });
};

// Project metadata interface
export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  settings: Record<string, any>;
  version: number;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ProjectTag {
  id: string;
  projectId: string;
  name: string;
  color?: string;
  scope: 'project';
  createdAt: string;
  updatedAt: string;
}

export interface GlobalTag {
  id: string;
  userId: string;
  name: string;
  color?: string;
  scope: 'global';
  createdAt: string;
  updatedAt: string;
}

// File blob interface (separate from assets)
export interface FileBlob {
  id: string;
  projectId: string;
  assetId?: string;
  storageKey: string;
  mimeType?: string;
  sizeBytes?: number;
  blob?: Blob; // Actual blob data
  cloudUrl?: string; // R2 storage URL
  cloudUploaded?: boolean; // Upload status
  createdAt: string;
}

// Migration progress interface
export interface MigrationProgress {
  migrationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startTime: string;
  endTime?: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  progressPercentage: number;
  steps: any[]; // MigrationStep[]
  errors: any[]; // MigrationError[]
  warnings: any[]; // MigrationWarning[]
  metadata: Record<string, any>;
}

/**
 * KANVAS Database with Zone Separation
 * 
 * ZONES:
 * 1. Projects table - Project metadata only
 * 2. Assets table - Canonical asset data ONLY (no sync state, no UI state)
 * 3. Files table - File blob storage (separate from assets)
 * 4. SyncQueue table - Runtime sync state ONLY (never mixed with assets)
 */
export class KanvasDatabase extends Dexie {
  // Zone 1: Project metadata
  projects!: Table<Project>;
  
  // Zone 2: Canonical asset data ONLY
  assets!: Table<Asset>;
  
  // Zone 3: File blob storage (separate)
  files!: Table<FileBlob>;
  
  // Zone 4: Runtime sync state ONLY
  syncQueue!: Table<SyncQueueEntry>;
  
  // Zone 5: Migration progress tracking
  migrationProgress!: Table<MigrationProgress>;

  // Zone 6: Project-local tag definitions
  projectTags!: Table<ProjectTag>;

  // Zone 7: User-local shared tags
  globalTags!: Table<GlobalTag>;

  constructor() {
    super('kanvas-db-v2');

    // Version 1: Initial schema with zone separation
    this.version(1).stores({
      // Simple project table (canonical data only)
      projects: 'id, userId, name, updatedAt, deletedAt',
      
      // Single unified asset table (NO sync state, NO UI state)
      // Only canonical asset data stored here
      assets: 'id, projectId, parentId, updatedAt, [projectId+parentId]',
      
      // File storage (separate from assets - NEVER embedded)
      files: 'id, projectId, assetId, storageKey, mimeType, [projectId+assetId]',
      
      // FIFO sync queue (runtime state ONLY)
      // Never mix with canonical asset data
      syncQueue: 'id, projectId, assetId, operation, status, createdAt, retryCount, [projectId+status]',
      
      // Migration progress tracking
      migrationProgress: 'migrationId, status, startTime, endTime, progressPercentage'
    });

    // Version 2: add local tag stores and richer project hydration support
    this.version(2).stores({
      projects: 'id, userId, name, updatedAt, deletedAt',
      assets: 'id, projectId, parentId, updatedAt, [projectId+parentId]',
      files: 'id, projectId, assetId, storageKey, mimeType, [projectId+assetId]',
      syncQueue: 'id, projectId, assetId, operation, status, createdAt, retryCount, [projectId+status]',
      migrationProgress: 'migrationId, status, startTime, endTime, progressPercentage',
      projectTags: 'id, projectId, name, updatedAt, [projectId+name]',
      globalTags: 'id, userId, name, updatedAt, [userId+name]'
    });

    // Runtime validation hooks to prevent zone pollution
    this.setupValidationHooks();
  }

  async verifySchemaHealth(): Promise<void> {
    try {
      if (!this.isOpen()) {
        await this.open();
      }

      const nativeStoreNames = await getNativeObjectStoreNames(this.name);
      const nativeMissingStores = REQUIRED_OBJECT_STORES.filter(store => !nativeStoreNames.includes(store));

      if (nativeMissingStores.length > 0) {
        throw new IndexedDBSchemaError(
          `Native IndexedDB database is missing required object store(s): ${nativeMissingStores.join(', ')}`
        );
      }

      const dexieStoreNames = Array.from(this.backendDB().objectStoreNames);
      const missingStores = REQUIRED_OBJECT_STORES.filter(store => !dexieStoreNames.includes(store));

      if (missingStores.length > 0) {
        throw new IndexedDBSchemaError(
          `IndexedDB schema is missing required object store(s): ${missingStores.join(', ')}`
        );
      }

      // Touch every required table so Dexie/table bindings fail during startup, not later writes.
      await Promise.all([
        this.projects.limit(1).toArray(),
        this.assets.limit(1).toArray(),
        this.files.limit(1).toArray(),
        this.syncQueue.limit(1).toArray(),
        this.migrationProgress.limit(1).toArray(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[IndexedDB] FATAL: local persistence schema is unhealthy.', {
        database: this.name,
        requiredStores: REQUIRED_OBJECT_STORES,
        error: message,
      });
      throw error instanceof IndexedDBSchemaError
        ? error
        : new IndexedDBSchemaError(`IndexedDB schema health check failed: ${message}`);
    }
  }

  async resetDevDatabaseForSchemaRepair(): Promise<void> {
    if (!import.meta.env.DEV) {
      throw new IndexedDBSchemaError('Refusing to reset IndexedDB outside development');
    }

    this.close();
    await deleteNativeDatabase(this.name);
    await this.open();
    await this.verifySchemaHealth();
  }

  /**
   * Setup validation hooks to enforce zone separation
   */
  private setupValidationHooks(): void {
    // Asset table validation - prevent runtime state pollution
    this.assets.hook('creating', (primKey, obj, trans) => {
      this.validateAssetZone(obj);
    });

    this.assets.hook('updating', (modifications, primKey, obj, trans) => {
      // Validate modifications don't contain forbidden fields
      for (const [key, value] of Object.entries(modifications)) {
        if (FORBIDDEN_ASSET_FIELDS.includes(key as any)) {
          throw new Error(`Forbidden field '${key}' in asset update`);
        }
      }
    });

    // SyncQueue validation - prevent asset data pollution
    this.syncQueue.hook('creating', (primKey, obj, trans) => {
      this.validateSyncQueueZone(obj);
    });

    // Files table validation - ensure separation from assets
    this.files.hook('creating', (primKey, obj, trans) => {
      if (!obj.storageKey) {
        throw new Error('File must have storageKey');
      }
    });
  }

  /**
   * Validate asset zone compliance
   */
  private validateAssetZone(obj: any): void {
    // Ensure no runtime state in asset data
    const forbiddenFields = ['sync_status', 'upload_progress', 'selection_state'];
    for (const field of forbiddenFields) {
      if (field in obj) {
        throw new Error(`Forbidden field ${field} in asset data`);
      }
    }

    // Validate canonical asset structure
    validateAssetStrict(obj);
  }

  /**
   * Validate sync queue zone compliance
   */
  private validateSyncQueueZone(obj: any): void {
    // Ensure no canonical asset data in sync queue (except assetData field)
    const assetFields = ['layout', 'content', 'style', 'behavior', 'metadata'];
    for (const field of assetFields) {
      if (field in obj && field !== 'assetData') {
        throw new Error(`Asset field '${field}' in sync queue data`);
      }
    }

    // Validate required sync queue fields
    if (!obj.assetId || !obj.operation || !obj.status) {
      throw new Error('Missing required sync queue fields');
    }
  }

  // Asset CRUD operations with zone protection
  async createAsset(asset: Asset): Promise<string> {
    // Validate canonical asset structure before storing
    validateAssetStrict(asset);
    
    const id = await this.transaction('rw', this.assets, async () => {
      const id = await this.assets.add(asset);
      return id.toString();
    });

    await this.verifyAssetReadAfterWrite(id, 'createAsset');
    return id;
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    return await this.assets.get(id);
  }

  async getProjectAssets(projectId: string): Promise<Asset[]> {
    return await this.assets
      .where('projectId')
      .equals(projectId)
      .toArray();
  }

  async updateAsset(id: string, updates: Partial<Asset>): Promise<number> {
    const updatedCount = await this.transaction('rw', this.assets, async () => {
      return await this.assets.update(id, updates);
    });

    await this.verifyAssetReadAfterWrite(id, 'updateAsset');
    return updatedCount;
  }

  private async verifyAssetReadAfterWrite(id: string, operation: string): Promise<void> {
    if (!import.meta.env.DEV) {
      return;
    }

    const savedAsset = await this.assets.get(id);
    if (!savedAsset) {
      throw new Error(`[IndexedDB] Read-after-write failed for ${operation}: asset ${id} was not found`);
    }

    console.log(`[IndexedDB] Read-after-write verified for ${operation}: asset ${id}`);
  }

  async deleteAsset(id: string, projectId: string): Promise<void> {
    await this.assets.delete(id);

    if (!USE_SUPABASE) {
      return;
    }

    try {
      await Dexie.ignoreTransaction(() => this.syncQueue.add({
        id: createId(),
        projectId,
        assetId: id,
        operation: 'delete',
        status: 'dirty',
        retryCount: 0,
        createdAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn('[IndexedDB] Asset deleted locally, but sync queue write failed. Local persistence remains valid.', error);
    }
  }

  // Sync queue operations
  async addToSyncQueue(entry: Omit<SyncQueueEntry, 'id'>): Promise<string> {
    const syncEntry: SyncQueueEntry = {
      ...entry,
      id: createId(),
    };

    if (!USE_SUPABASE) {
      return syncEntry.id;
    }
    
    try {
      await this.verifySchemaHealth();
      await Dexie.ignoreTransaction(() => this.syncQueue.add(syncEntry));
    } catch (error) {
      console.warn('[IndexedDB] Non-fatal sync queue write failed. Cloud sync queue was not updated, but local persistence was not blocked.', error);
    }

    return syncEntry.id;
  }

  async getSyncQueue(projectId: string): Promise<SyncQueueEntry[]> {
    return await this.syncQueue
      .where('projectId')
      .equals(projectId)
      .and(entry => ['dirty', 'failed'].includes(entry.status))
      .sortBy('createdAt');
  }

  async markSyncProcessed(id: string): Promise<void> {
    await this.syncQueue.update(id, {
      status: 'synced',
      processedAt: new Date().toISOString(),
    });
  }

  async markSyncFailed(id: string, error: string): Promise<void> {
    const entry = await this.syncQueue.get(id);
    await this.syncQueue.update(id, {
      status: 'failed',
      error,
      retryCount: (entry?.retryCount || 0) + 1,
    });
  }

  // Project operations
  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Project, 'id' | 'createdAt' | 'updatedAt'>>): Promise<string> {
    const now = new Date().toISOString();
    const newProject: Project = {
      ...project,
      id: project.id || createId(),
      createdAt: project.createdAt || now,
      updatedAt: project.updatedAt || now,
      version: project.version || 1,
    };

    await this.projects.put(newProject);
    return newProject.id;
  }

  async getProject(id: string): Promise<Project | undefined> {
    return await this.projects.get(id);
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return await this.projects
      .where('userId')
      .equals(userId)
      .and(project => !project.deletedAt)
      .toArray();
  }

  async getAllProjects(): Promise<Project[]> {
    return await this.projects
      .filter(project => !project.deletedAt)
      .toArray();
  }

  async updateProject(project: Project): Promise<void> {
    await this.projects.update(project.id, {
      name: project.name,
      description: project.description,
      settings: project.settings,
      version: project.version,
      lastSyncAt: project.lastSyncAt,
      updatedAt: project.updatedAt,
      deletedAt: project.deletedAt,
    });
  }

  async createProjectTag(tag: ProjectTag): Promise<string> {
    await this.projectTags.put(tag);
    return tag.id;
  }

  async getProjectTags(projectId: string): Promise<ProjectTag[]> {
    return await this.projectTags
      .where('projectId')
      .equals(projectId)
      .sortBy('updatedAt');
  }

  async updateProjectTag(id: string, updates: Partial<ProjectTag>): Promise<void> {
    await this.projectTags.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteProjectTag(id: string): Promise<void> {
    await this.projectTags.delete(id);
  }

  async createGlobalTag(tag: GlobalTag): Promise<string> {
    await this.globalTags.put(tag);
    return tag.id;
  }

  async getGlobalTags(userId: string): Promise<GlobalTag[]> {
    return await this.globalTags
      .where('userId')
      .equals(userId)
      .sortBy('updatedAt');
  }

  async updateGlobalTag(id: string, updates: Partial<GlobalTag>): Promise<void> {
    await this.globalTags.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteGlobalTag(id: string): Promise<void> {
    await this.globalTags.delete(id);
  }

  async deleteProject(id: string): Promise<void> {
    await this.projects.update(id, {
      deletedAt: new Date().toISOString(),
    });
  }

  // File blob operations
  async storeFile(file: FileBlob): Promise<string> {
    await this.files.add(file);
    return file.id;
  }

  async getFile(id: string): Promise<FileBlob | undefined> {
    return await this.files.get(id);
  }

  async getProjectFiles(projectId: string): Promise<FileBlob[]> {
    return await this.files
      .where('projectId')
      .equals(projectId)
      .toArray();
  }

  async deleteFile(id: string): Promise<void> {
    await this.files.delete(id);
  }

  // Cleanup operations
  async cleanupSyncedEntries(): Promise<number> {
    return await this.transaction('rw', this.syncQueue, async () => {
      const syncedEntries = await this.syncQueue
        .where('status')
        .equals('synced')
        .and(entry => {
          // Delete entries synced more than 24 hours ago
          const processedAt = entry.processedAt ? new Date(entry.processedAt) : new Date(0);
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          return processedAt < dayAgo;
        })
        .toArray();

      await this.syncQueue.bulkDelete(syncedEntries.map(e => e.id));
      return syncedEntries.length;
    });
  }

  // Database maintenance
  async clearAllData(): Promise<void> {
    return await this.transaction('rw', this.projects, this.assets, this.files, this.syncQueue, this.projectTags, this.globalTags, async () => {
      await this.projects.clear();
      await this.assets.clear();
      await this.files.clear();
      await this.syncQueue.clear();
      await this.projectTags.clear();
      await this.globalTags.clear();
    });
  }

  async loadProjectBundle(projectId: string, userId?: string): Promise<{
    project: Project | undefined;
    assets: Asset[];
    projectTags: ProjectTag[];
    globalTags: GlobalTag[];
    files: FileBlob[];
  }> {
    const project = await this.getProject(projectId);
    const resolvedUserId = userId || project?.userId;
    const [assets, projectTags, globalTags, files] = await Promise.all([
      this.getProjectAssets(projectId),
      this.getProjectTags(projectId),
      resolvedUserId ? this.getGlobalTags(resolvedUserId) : Promise.resolve([]),
      this.getProjectFiles(projectId),
    ]);

    return {
      project,
      assets,
      projectTags,
      globalTags,
      files,
    };
  }

  async exportProjectData(projectId: string): Promise<{
    project: Project | undefined;
    assets: Asset[];
    files: FileBlob[];
  }> {
    const [project, assets, files] = await Promise.all([
      this.getProject(projectId),
      this.getProjectAssets(projectId),
      this.getProjectFiles(projectId),
    ]);

    return { project, assets, files };
  }
}

// Singleton instance
export const db = new KanvasDatabase();

export const verifyIndexedDBSchemaHealth = () => db.verifySchemaHealth();

export const repairIndexedDBSchemaInDevelopment = () => db.resetDevDatabaseForSchemaRepair();
