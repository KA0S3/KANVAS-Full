/**
 * FILE BLOB STORAGE - Memory Management
 * 
 * Handles file blob storage with proper memory management.
 * Files are stored separately from assets - NEVER embedded.
 * 
 * 🔒 CRITICAL: Files must NEVER be embedded in asset JSON
 */

import { FileBlob } from '@/storage/indexeddb';
import { db } from '@/storage/indexeddb';
import { FileUploadState, createFileUploadState } from '@/types/SyncTypes';
import { supabaseStorage } from './supabase';

export interface BlobStorageConfig {
  maxFileSize: number; // 50MB max
  maxMemoryUsage: number; // 100MB max in memory
  thumbnailSize: number; // 200x200 max
  previewSize: number; // 800x800 max
  compressionQuality: number; // 0.85
}

export interface ProcessedFile {
  original: File;
  blob: Blob;
  thumbnail?: Blob;
  preview?: Blob;
  objectUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  size: number;
  mimeType: string;
  compressed: boolean;
}

export class BlobStorage {
  private config: BlobStorageConfig;
  private memoryUsage = 0;
  private objectUrls = new Map<string, string>();
  private activeUploads = new Map<string, FileUploadState>();

  constructor(config: Partial<BlobStorageConfig> = {}) {
    this.config = {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      thumbnailSize: 200,
      previewSize: 800,
      compressionQuality: 0.85,
      ...config,
    };

    // Setup cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.cleanup();
      });
    }
  }

  /**
   * Process and store a file
   */
  async processFile(file: File, assetId?: string): Promise<ProcessedFile> {
    // Validate file
    this.validateFile(file);

    // Create upload state
    const uploadId = crypto.randomUUID();
    const uploadState = createFileUploadState(uploadId, assetId || '');
    this.activeUploads.set(uploadId, uploadState);

    try {
      // Update upload state
      uploadState.status = 'uploading';
      uploadState.progress = 10;

      // Create object URL for immediate rendering
      const objectUrl = URL.createObjectURL(file);
      this.objectUrls.set(uploadId, objectUrl);
      uploadState.localUrl = objectUrl;

      // Process file in background
      const processed = await this.processFileInBackground(file, uploadState);

      // Store in IndexedDB
      await this.storeFileBlob(processed, assetId);

      // Update upload state
      uploadState.status = 'completed';
      uploadState.progress = 100;

      return processed;

    } catch (error) {
      uploadState.status = 'failed';
      uploadState.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    } finally {
      this.activeUploads.delete(uploadId);
    }
  }

  /**
   * Validate file before processing
   */
  private validateFile(file: File): void {
    if (file.size > this.config.maxFileSize) {
      throw new Error(`File size ${file.size} exceeds maximum ${this.config.maxFileSize}`);
    }

    // Check for common MIME types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/html',
      'video/mp4', 'video/webm', 'audio/mp3', 'audio/wav'
    ];

    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      console.warn(`Unusual MIME type: ${file.type}`);
    }
  }

  /**
   * Process file in background with compression and thumbnail generation
   */
  private async processFileInBackground(file: File, uploadState: FileUploadState): Promise<ProcessedFile> {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/workers/fileProcessor.js');
      
      worker.postMessage({
        file,
        config: {
          thumbnailSize: this.config.thumbnailSize,
          previewSize: this.config.previewSize,
          compressionQuality: this.config.compressionQuality,
        }
      });

      worker.onmessage = (event) => {
        const { type, data } = event.data;

        switch (type) {
          case 'progress':
            uploadState.progress = Math.round(10 + (data.progress * 80));
            break;

          case 'complete':
            const processed = this.handleProcessedFile(data, file);
            worker.terminate();
            resolve(processed);
            break;

          case 'error':
            worker.terminate();
            reject(new Error(data.error));
            break;
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        reject(new Error(`Worker error: ${error.message}`));
      };

      // Timeout after 30 seconds
      setTimeout(() => {
        worker.terminate();
        reject(new Error('File processing timeout'));
      }, 30000);
    });
  }

  /**
   * Handle processed file from worker
   */
  private handleProcessedFile(data: any, originalFile: File): ProcessedFile {
    const processed: ProcessedFile = {
      original: originalFile,
      blob: new Blob([data.compressedData], { type: originalFile.type }),
      objectUrl: URL.createObjectURL(new Blob([data.compressedData], { type: originalFile.type })),
      size: data.compressedData.byteLength,
      mimeType: originalFile.type,
      compressed: data.compressed,
    };

    // Add thumbnail if available
    if (data.thumbnail) {
      processed.thumbnail = new Blob([data.thumbnail], { type: 'image/jpeg' });
      processed.thumbnailUrl = URL.createObjectURL(processed.thumbnail);
      this.objectUrls.set(`thumb-${processed.objectUrl}`, processed.thumbnailUrl);
    }

    // Add preview if available
    if (data.preview) {
      processed.preview = new Blob([data.preview], { type: 'image/jpeg' });
      processed.previewUrl = URL.createObjectURL(processed.preview);
      this.objectUrls.set(`preview-${processed.objectUrl}`, processed.previewUrl);
    }

    // Update memory usage
    this.updateMemoryUsage(processed);

    return processed;
  }

  /**
   * Store file blob in IndexedDB and upload to cloud
   */
  private async storeFileBlob(processed: ProcessedFile, assetId?: string): Promise<string> {
    const fileBlob: FileBlob = {
      id: crypto.randomUUID(),
      projectId: this.getCurrentProjectId() || '',
      assetId,
      storageKey: this.generateStorageKey(processed),
      mimeType: processed.mimeType,
      sizeBytes: processed.size,
      blob: processed.blob,
      createdAt: new Date().toISOString(),
    };

    // Store locally first
    await db.storeFile(fileBlob);

    // Upload to cloud in background
    try {
      const file = new File([processed.blob], fileBlob.storageKey, {
        type: processed.mimeType,
      });
      
      const cloudUrl = await supabaseStorage.uploadFile(file, fileBlob.storageKey);
      
      // Update file record with cloud status
      await db.files.update(fileBlob.id, {
        cloudUrl,
        cloudUploaded: true,
      });

      return cloudUrl;
    } catch (error) {
      console.warn('Cloud upload failed, keeping local only:', error);
      return fileBlob.storageKey; // Return local key for fallback
    }
  }

  /**
   * Batch process multiple files
   */
  async processFilesBatch(files: Array<{
    file: File;
    assetId?: string;
  }>): Promise<Array<{
    processedFile: ProcessedFile;
    fileId: string;
    cloudUrl?: string;
  }>> {
    if (files.length === 0) return [];

    const results = await Promise.allSettled(
      files.map(({ file, assetId }) => this.processFile(file, assetId))
    );

    const successes: Array<{
      processedFile: ProcessedFile;
      fileId: string;
      cloudUrl?: string;
    }> = results
      .filter((result): result is PromiseFulfilledResult<ProcessedFile> => result.status === 'fulfilled')
      .map((result, index) => ({
        processedFile: result.value,
        fileId: files[index].assetId || crypto.randomUUID(),
      }));

    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    if (failures.length > 0) {
      console.warn(`${failures.length} files failed to process:`, failures);
    }

    // Batch upload to cloud
    const uploadPayload = successes.map(({ processedFile }) => ({
      file: new File([processedFile.blob], processedFile.objectUrl.split('/').pop() || 'file', {
        type: processedFile.mimeType,
      }),
      storageKey: this.generateStorageKey(processedFile),
    }));

    try {
      const cloudResults = await supabaseStorage.uploadFilesBatch(uploadPayload);
      
      // Update local records with cloud URLs
      for (let i = 0; i < successes.length && i < cloudResults.length; i++) {
        successes[i].cloudUrl = cloudResults[i].url;
      }
    } catch (error) {
      console.warn('Batch cloud upload failed, files remain local:', error);
    }

    return successes;
  }

  /**
   * Sync local files with cloud
   */
  async syncFilesWithCloud(projectId: string): Promise<{
    uploaded: string[];
    failed: string[];
    deleted: string[];
  }> {
    try {
      // Get local files that need sync
      const localFiles = await db.files
        .where('projectId')
        .equals(projectId)
        .and(file => !file.cloudUploaded || Boolean(file.blob))
        .toArray();

      const uploaded: string[] = [];
      const failed: string[] = [];

      // Upload pending files
      for (const file of localFiles) {
        if (file.blob) {
          try {
            const uploadFile = new File([file.blob], file.storageKey, {
              type: file.mimeType,
            });
            
            const cloudUrl = await supabaseStorage.uploadFile(uploadFile, file.storageKey);
            
            // Update local record
            await db.files.update(file.id, {
              cloudUrl,
              cloudUploaded: true,
              blob: undefined, // Remove local blob after successful upload
            });
            
            uploaded.push(file.id);
          } catch (error) {
            console.error(`Failed to upload file ${file.id}:`, error);
            failed.push(file.id);
          }
        }
      }

      // Clean up orphaned local files
      const cloudFiles = await supabaseStorage.getFilesMetadataBatch(
        localFiles.map(f => f.storageKey)
      );
      
      const deleted: string[] = [];
      for (let i = 0; i < localFiles.length; i++) {
        const localFile = localFiles[i];
        const cloudFile = cloudFiles[i];
        
        if (!cloudFile && localFile.cloudUploaded) {
          // File exists locally but not in cloud - mark for deletion
          await db.deleteFile(localFile.id);
          deleted.push(localFile.id);
        }
      }

      return { uploaded, failed, deleted };
    } catch (error) {
      console.error('File sync failed:', error);
      throw error;
    }
  }

  /**
   * Get file by asset ID with fallback
   */
  async getFileForAsset(assetId: string): Promise<{
    localBlob?: Blob;
    cloudUrl?: string;
    objectUrl?: string;
    mimeType?: string;
  } | null> {
    try {
      // Try local first
      const localFile = await db.files
        .where('assetId')
        .equals(assetId)
        .first();

      if (localFile) {
        if (localFile.blob) {
          return {
            localBlob: localFile.blob,
            objectUrl: URL.createObjectURL(localFile.blob),
            mimeType: localFile.mimeType,
          };
        }
        
        if (localFile.cloudUrl) {
          return {
            cloudUrl: localFile.cloudUrl,
            mimeType: localFile.mimeType,
          };
        }
      }

      // Fallback to cloud
      // This would require knowing the storage key pattern
      return null;
    } catch (error) {
      console.error('Failed to get file for asset:', error);
      return null;
    }
  }

  /**
   * Cleanup orphaned files
   */
  async cleanupOrphanedFiles(projectId: string): Promise<number> {
    try {
      // Get all asset IDs in project
      const projectAssets = await db.assets
        .where('projectId')
        .equals(projectId)
        .toArray();
      const assetIds = new Set(projectAssets.map(a => a.id));

      // Find files with no associated asset
      const orphanedFiles = await db.files
        .where('projectId')
        .equals(projectId)
        .and(file => file.assetId && !assetIds.has(file.assetId!))
        .toArray();

      // Delete orphaned files
      for (const file of orphanedFiles) {
        await this.deleteFile(file.id);
        
        // Also delete from cloud if uploaded
        if (file.cloudUploaded) {
          try {
            await supabaseStorage.deleteFile(file.storageKey);
          } catch (error) {
            console.warn(`Failed to delete cloud file ${file.storageKey}:`, error);
          }
        }
      }

      return orphanedFiles.length;
    } catch (error) {
      console.error('Failed to cleanup orphaned files:', error);
      return 0;
    }
  }

  /**
   * Generate storage key for file
   */
  private generateStorageKey(processed: ProcessedFile): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(processed.original.name + processed.size);
    return `${timestamp}-${hash}`;
  }

  /**
   * Simple hash function for storage keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Update memory usage tracking
   */
  private updateMemoryUsage(processed: ProcessedFile): void {
    let size = processed.blob.size;
    if (processed.thumbnail) size += processed.thumbnail.size;
    if (processed.preview) size += processed.preview.size;

    this.memoryUsage += size;

    // Check memory limit
    if (this.memoryUsage > this.config.maxMemoryUsage) {
      this.cleanupOldFiles();
    }
  }

  /**
   * Cleanup old files to free memory
   */
  private cleanupOldFiles(): void {
    // This is a simplified cleanup - in production, you'd want LRU logic
    const urlsToRevoke = Array.from(this.objectUrls.keys()).slice(0, Math.floor(this.objectUrls.size / 2));
    
    urlsToRevoke.forEach(url => {
      URL.revokeObjectURL(this.objectUrls.get(url)!);
      this.objectUrls.delete(url);
    });

    this.memoryUsage = Math.floor(this.memoryUsage / 2);
    console.log('Cleaned up old files to free memory');
  }

  /**
   * Get file blob by ID
   */
  async getFile(fileId: string): Promise<FileBlob | undefined> {
    return await db.getFile(fileId);
  }

  /**
   * Get file blob by storage key
   */
  async getFileByKey(storageKey: string): Promise<FileBlob | undefined> {
    const files = await db.files.where('storageKey').equals(storageKey).toArray();
    return files[0];
  }

  /**
   * Delete file blob
   */
  async deleteFile(fileId: string): Promise<void> {
    const file = await db.getFile(fileId);
    if (file) {
      // Revoke object URLs
      this.objectUrls.forEach((url, key) => {
        if (url.includes(file.storageKey)) {
          URL.revokeObjectURL(url);
          this.objectUrls.delete(key);
        }
      });

      await db.deleteFile(fileId);
    }
  }

  /**
   * Get upload progress
   */
  getUploadProgress(uploadId: string): FileUploadState | undefined {
    return this.activeUploads.get(uploadId);
  }

  /**
   * Get current project ID
   */
  private getCurrentProjectId(): string | null {
    return localStorage.getItem('currentProjectId');
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    currentUsage: number;
    maxUsage: number;
    activeUploads: number;
    objectUrls: number;
  } {
    return {
      currentUsage: this.memoryUsage,
      maxUsage: this.config.maxMemoryUsage,
      activeUploads: this.activeUploads.size,
      objectUrls: this.objectUrls.size,
    };
  }

  /**
   * Force cleanup of all resources
   */
  cleanup(): void {
    // Revoke all object URLs
    this.objectUrls.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.objectUrls.clear();

    // Clear memory usage
    this.memoryUsage = 0;

    // Clear active uploads
    this.activeUploads.clear();

    console.log('Blob storage cleanup completed');
  }

  /**
   * Create file processor worker script content
   */
  static createWorkerScript(): string {
    return `
      self.onmessage = async function(event) {
        const { file, config } = event.data;

        try {
          if (file.type.startsWith('image/')) {
            await processImage(file, config);
          } else {
            await processOtherFile(file, config);
          }
        } catch (error) {
          self.postMessage({ type: 'error', error: error.message });
        }
      };

      async function processImage(file, config) {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = async function() {
          // Process original image
          const compressed = await compressImage(img, file.type, config.compressionQuality);
          
          // Generate thumbnail
          const thumbnail = await generateThumbnail(img, config.thumbnailSize);
          
          // Generate preview
          const preview = await generatePreview(img, config.previewSize);

          self.postMessage({
            type: 'complete',
            data: {
              compressed: compressed.size < file.size,
              compressedData: compressed.data,
              thumbnail: thumbnail?.data,
              preview: preview?.data,
            }
          });
        };

        img.onerror = function() {
          throw new Error('Failed to load image');
        };

        img.src = URL.createObjectURL(file);
      }

      async function processOtherFile(file, config) {
        // For non-image files, just return the original
        const arrayBuffer = await file.arrayBuffer();
        
        self.postMessage({
          type: 'complete',
          data: {
            compressed: false,
            compressedData: arrayBuffer,
            thumbnail: null,
            preview: null,
          }
        });
      }

      async function compressImage(img, mimeType, quality) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = img.width;
        canvas.height = img.height;
        
        ctx.drawImage(img, 0, 0);
        
        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            blob.arrayBuffer().then(data => {
              resolve({ data, size: blob.size });
            });
          }, mimeType, quality);
        });
      }

      async function generateThumbnail(img, size) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const scale = Math.min(size / img.width, size / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then(data => {
                resolve({ data, size: blob.size });
              });
            } else {
              resolve(null);
            }
          }, 'image/jpeg', 0.8);
        });
      }

      async function generatePreview(img, size) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const scale = Math.min(size / img.width, size / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              blob.arrayBuffer().then(data => {
                resolve({ data, size: blob.size });
              });
            } else {
              resolve(null);
            }
          }, 'image/jpeg', 0.8);
        });
      }
    `;
  }
}

// Create worker blob URL if needed
if (typeof window !== 'undefined' && !(window as any).hasFileProcessorWorker) {
  const workerScript = BlobStorage.createWorkerScript();
  const workerBlob = new Blob([workerScript], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(workerBlob);
  
  // Store for later use
  (window as any).fileProcessorWorkerUrl = workerUrl;
  (window as any).hasFileProcessorWorker = true;
}

// Export singleton instance
export const blobStorage = new BlobStorage();
