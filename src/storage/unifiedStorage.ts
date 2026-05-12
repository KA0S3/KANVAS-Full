/**
 * UNIFIED STORAGE MANAGER
 * 
 * Integrates Supabase storage operations with blob storage management
 * to provide a single interface for all storage operations.
 * 
 * 🔒 CRITICAL: Maintains zone separation and low IO principles
 */

import { Asset } from '@/types/Asset';
import { Project } from '@/storage/indexeddb';
import { supabaseStorage } from './supabase';
import { blobStorage, ProcessedFile } from './blobStorage';
import { db } from '@/storage/indexeddb';

export interface UnifiedStorageConfig {
  enableBatching: boolean;
  batchSize: number;
  enableCompression: boolean;
  enableThumbnails: boolean;
  maxFileSize: number;
}

export interface StorageOperation {
  type: 'asset' | 'file' | 'project';
  operation: 'create' | 'update' | 'delete';
  data: any;
  priority: 'high' | 'normal' | 'low';
}

export interface StorageStats {
  assets: {
    total: number;
    synced: number;
    pending: number;
    failed: number;
  };
  files: {
    total: number;
    uploaded: number;
    local: number;
    size: number;
  };
  projects: {
    total: number;
    lastSync: string | null;
  };
}

/**
 * Unified Storage Manager
 * 
 * Provides a single interface for all storage operations while maintaining
 * the strict separation between local and cloud storage.
 */
export class UnifiedStorage {
  private config: UnifiedStorageConfig;
  private operationQueue: StorageOperation[] = [];
  private isProcessing = false;

  constructor(config: Partial<UnifiedStorageConfig> = {}) {
    this.config = {
      enableBatching: true,
      batchSize: 50,
      enableCompression: true,
      enableThumbnails: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      ...config,
    };
  }

  /**
   * Create asset with unified storage
   */
  async createAsset(asset: Asset): Promise<void> {
    try {
      // Store locally first (immediate)
      await db.assets.add(asset);
      
      // Queue for cloud sync
      if (this.config.enableBatching) {
        this.queueOperation({
          type: 'asset',
          operation: 'create',
          data: asset,
          priority: 'normal',
        });
      } else {
        // Immediate cloud sync
        await supabaseStorage.createAsset(asset);
      }
    } catch (error) {
      console.error('Unified asset creation failed:', error);
      throw error;
    }
  }

  /**
   * Update asset with unified storage
   */
  async updateAsset(asset: Asset): Promise<void> {
    try {
      // Update locally first (immediate)
      await db.assets.update(asset.id, { ...asset });
      
      // Queue for cloud sync
      if (this.config.enableBatching) {
        this.queueOperation({
          type: 'asset',
          operation: 'update',
          data: asset,
          priority: 'normal',
        });
      } else {
        // Immediate cloud sync
        await supabaseStorage.updateAsset(asset);
      }
    } catch (error) {
      console.error('Unified asset update failed:', error);
      throw error;
    }
  }

  /**
   * Delete asset with unified storage
   */
  async deleteAsset(assetId: string, projectId: string): Promise<void> {
    try {
      // Get asset before deletion for file cleanup
      const asset = await db.assets.get(assetId);
      
      // Delete locally first (immediate)
      await db.assets.delete(assetId);
      
      // Clean up associated files
      if (asset) {
        await blobStorage.deleteFile(assetId);
      }
      
      // Queue for cloud sync (high priority for deletions)
      this.queueOperation({
        type: 'asset',
        operation: 'delete',
        data: { assetId, projectId },
        priority: 'high',
      });
      
      // Immediate cloud sync for deletions
      await supabaseStorage.deleteAsset(assetId, projectId);
    } catch (error) {
      console.error('Unified asset deletion failed:', error);
      throw error;
    }
  }

  /**
   * Process file with unified storage
   */
  async processFile(file: File, assetId?: string): Promise<{
    processedFile: ProcessedFile;
    fileId: string;
    cloudUrl?: string;
  }> {
    try {
      // Process file locally
      const processedFile = await blobStorage.processFile(file, assetId);
      
      // Get file ID from storage
      const localFile = await blobStorage.getFile(processedFile.objectUrl);
      const fileId = localFile?.id || crypto.randomUUID();
      
      return {
        processedFile,
        fileId,
      };
    } catch (error) {
      console.error('Unified file processing failed:', error);
      throw error;
    }
  }

  /**
   * Batch process files with unified storage
   */
  async processFilesBatch(files: Array<{
    file: File;
    assetId?: string;
  }>): Promise<Array<{
    processedFile: ProcessedFile;
    fileId: string;
    cloudUrl?: string;
  }>> {
    try {
      return await blobStorage.processFilesBatch(files);
    } catch (error) {
      console.error('Unified batch file processing failed:', error);
      throw error;
    }
  }

  /**
   * Get project with all assets and files
   */
  async getProject(projectId: string): Promise<{
    project: Project;
    assets: Asset[];
    files: Array<{
      id: string;
      assetId: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      cloudUrl?: string;
    }>;
  }> {
    try {
      // Try local first
      const localProject = await db.projects.get(projectId);
      const localAssets = await db.assets
        .where('projectId')
        .equals(projectId)
        .toArray();
      const localFiles = await db.files
        .where('projectId')
        .equals(projectId)
        .toArray();

      if (localProject && localAssets.length > 0) {
        return {
          project: localProject,
          assets: localAssets,
          files: localFiles.map(f => ({
            id: f.id,
            assetId: f.assetId || '',
            storageKey: f.storageKey,
            mimeType: f.mimeType || '',
            sizeBytes: f.sizeBytes || 0,
            cloudUrl: f.cloudUrl,
          })),
        };
      }

      // Fallback to cloud
      return await supabaseStorage.getProjectWithAssets(projectId);
    } catch (error) {
      console.error('Unified project fetch failed:', error);
      throw error;
    }
  }

  /**
   * Sync project state (both assets and files)
   */
  async syncProject(projectId: string): Promise<{
    assets: { created: Asset[]; updated: Asset[]; deleted: string[] };
    files: { uploaded: Array<{ id: string; url: string }>; deleted: string[] };
  }> {
    try {
      // Sync assets
      const assetSync = await supabaseStorage.syncProjectState(projectId);
      
      // Sync files
      const fileSync = await blobStorage.syncFilesWithCloud(projectId);
      
      return {
        assets: assetSync.assets,
        files: {
          uploaded: fileSync.uploaded.map(id => ({ id, url: '' })),
          deleted: fileSync.deleted,
        },
      };
    } catch (error) {
      console.error('Unified project sync failed:', error);
      throw error;
    }
  }

  /**
   * Get file for asset with fallback
   */
  async getFileForAsset(assetId: string): Promise<{
    localBlob?: Blob;
    cloudUrl?: string;
    objectUrl?: string;
    mimeType?: string;
  } | null> {
    try {
      return await blobStorage.getFileForAsset(assetId);
    } catch (error) {
      console.error('Unified file fetch failed:', error);
      return null;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(projectId?: string): Promise<StorageStats> {
    try {
      const targetProjectId = projectId || this.getCurrentProjectId();
      
      if (!targetProjectId) {
        return this.getEmptyStats();
      }

      // Get asset stats
      const assets = await db.assets
        .where('projectId')
        .equals(targetProjectId)
        .toArray();
      
      const syncQueue = await db.getSyncQueue(targetProjectId);
      const syncedAssets = syncQueue.filter(q => q.status === 'synced').length;
      const pendingAssets = syncQueue.filter(q => q.status === 'dirty').length;
      const failedAssets = syncQueue.filter(q => q.status === 'failed').length;

      // Get file stats
      const files = await db.files
        .where('projectId')
        .equals(targetProjectId)
        .toArray();
      
      const uploadedFiles = files.filter(f => f.cloudUploaded).length;
      const localFiles = files.filter(f => f.blob).length;
      const totalSize = files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

      // Get project stats
      const project = await db.projects.get(targetProjectId);

      return {
        assets: {
          total: assets.length,
          synced: syncedAssets,
          pending: pendingAssets,
          failed: failedAssets,
        },
        files: {
          total: files.length,
          uploaded: uploadedFiles,
          local: localFiles,
          size: totalSize,
        },
        projects: {
          total: 1,
          lastSync: project?.lastSyncAt || null,
        },
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return this.getEmptyStats();
    }
  }

  /**
   * Process queued operations
   */
  async processQueuedOperations(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Group operations by type and priority
      const highPriorityOps = this.operationQueue.filter(op => op.priority === 'high');
      const normalOps = this.operationQueue.filter(op => op.priority === 'normal');
      const lowPriorityOps = this.operationQueue.filter(op => op.priority === 'low');

      // Process high priority first
      await this.processOperationGroup(highPriorityOps);
      await this.processOperationGroup(normalOps);
      await this.processOperationGroup(lowPriorityOps);

      // Clear processed operations
      this.operationQueue = [];
    } catch (error) {
      console.error('Failed to process queued operations:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Cleanup orphaned files and data
   */
  async cleanup(projectId?: string): Promise<{
    filesCleaned: number;
    assetsCleaned: number;
    spaceFreed: number;
  }> {
    try {
      const targetProjectId = projectId || this.getCurrentProjectId();
      
      if (!targetProjectId) {
        return { filesCleaned: 0, assetsCleaned: 0, spaceFreed: 0 };
      }

      // Cleanup orphaned files
      const filesCleaned = await blobStorage.cleanupOrphanedFiles(targetProjectId);
      
      // Get space freed (simplified calculation)
      const files = await db.files
        .where('projectId')
        .equals(targetProjectId)
        .toArray();
      const spaceFreed = files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

      return {
        filesCleaned,
        assetsCleaned: 0, // Assets are cleaned by sync queue
        spaceFreed,
      };
    } catch (error) {
      console.error('Cleanup failed:', error);
      return { filesCleaned: 0, assetsCleaned: 0, spaceFreed: 0 };
    }
  }

  /**
   * Queue operation for batch processing
   */
  private queueOperation(operation: StorageOperation): void {
    this.operationQueue.push(operation);
    
    // Auto-process if queue is full
    if (this.operationQueue.length >= this.config.batchSize) {
      this.processQueuedOperations();
    }
  }

  /**
   * Process group of operations
   */
  private async processOperationGroup(operations: StorageOperation[]): Promise<void> {
    if (operations.length === 0) return;

    // Group by type
    const assetOps = operations.filter(op => op.type === 'asset');
    const fileOps = operations.filter(op => op.type === 'file');
    const projectOps = operations.filter(op => op.type === 'project');

    // Process asset operations
    if (assetOps.length > 0) {
      const creates = assetOps.filter(op => op.operation === 'create').map(op => op.data);
      const updates = assetOps.filter(op => op.operation === 'update').map(op => op.data);
      const deletes = assetOps.filter(op => op.operation === 'delete').map(op => op.data);

      if (creates.length > 0) await supabaseStorage.createAssetsBatch(creates);
      if (updates.length > 0) await supabaseStorage.updateAssetsBatch(updates);
      if (deletes.length > 0) {
        const deleteIds = deletes.map(d => d.assetId);
        const projectId = deletes[0]?.projectId;
        if (projectId) await supabaseStorage.deleteAssetsBatch(deleteIds, projectId);
      }
    }

    // Process file operations
    if (fileOps.length > 0) {
      // File operations are handled by blob storage
      console.log(`Processing ${fileOps.length} file operations`);
    }

    // Process project operations
    if (projectOps.length > 0) {
      console.log(`Processing ${projectOps.length} project operations`);
    }
  }

  /**
   * Get current project ID
   */
  private getCurrentProjectId(): string | null {
    return localStorage.getItem('currentProjectId') || null;
  }

  /**
   * Get empty stats object
   */
  private getEmptyStats(): StorageStats {
    return {
      assets: { total: 0, synced: 0, pending: 0, failed: 0 },
      files: { total: 0, uploaded: 0, local: 0, size: 0 },
      projects: { total: 0, lastSync: null },
    };
  }
}

// Export singleton instance
export const unifiedStorage = new UnifiedStorage();
