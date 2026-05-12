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

    // Runtime validation hooks to prevent zone pollution
    this.setupValidationHooks();
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
    
    return await this.transaction('rw', this.assets, async () => {
      const id = await this.assets.add(asset);
      return id.toString();
    });
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
    return await this.transaction('rw', this.assets, async () => {
      return await this.assets.update(id, updates);
    });
  }

  async deleteAsset(id: string, projectId: string): Promise<void> {
    return await this.transaction('rw', this.assets, this.syncQueue, async () => {
      // Delete asset
      await this.assets.delete(id);
      
      // Mark for sync
      await this.syncQueue.add({
        id: crypto.randomUUID(),
        projectId,
        assetId: id,
        operation: 'delete',
        status: 'dirty',
        retryCount: 0,
        createdAt: new Date().toISOString(),
      });
    });
  }

  // Sync queue operations
  async addToSyncQueue(entry: Omit<SyncQueueEntry, 'id'>): Promise<string> {
    const syncEntry: SyncQueueEntry = {
      ...entry,
      id: crypto.randomUUID(),
    };
    
    await this.syncQueue.add(syncEntry);
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
  async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const newProject: Project = {
      ...project,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await this.projects.add(newProject);
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
    return await this.transaction('rw', this.projects, this.assets, this.files, this.syncQueue, async () => {
      await this.projects.clear();
      await this.assets.clear();
      await this.files.clear();
      await this.syncQueue.clear();
    });
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
