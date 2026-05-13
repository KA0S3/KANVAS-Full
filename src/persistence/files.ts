/**
 * FILE PERSISTENCE OPERATIONS - File Blob Storage
 * 
 * This module handles all file persistence operations following plan.
 * Files are stored separately from assets - NEVER embedded.
 * 
 * 🔒 CRITICAL: Files are separate from canonical asset data
 */

import { db, FileBlob } from '@/storage/indexeddb';
import { createId } from '@/utils/id';

/**
 * File persistence operations
 */
export class FilePersistence {
  /**
   * Store a file blob
   */
  static async store(fileData: Omit<FileBlob, 'id' | 'createdAt'>): Promise<string> {
    const file: FileBlob = {
      ...fileData,
      id: createId(),
      createdAt: new Date().toISOString(),
    };

    await db.storeFile(file);
    return file.id;
  }

  /**
   * Get file by ID
   */
  static async get(id: string): Promise<FileBlob | undefined> {
    return await db.getFile(id);
  }

  /**
   * Get all files for a project
   */
  static async getProjectFiles(projectId: string): Promise<FileBlob[]> {
    return await db.getProjectFiles(projectId);
  }

  /**
   * Get files for a specific asset
   */
  static async getAssetFiles(projectId: string, assetId: string): Promise<FileBlob[]> {
    const allFiles = await db.getProjectFiles(projectId);
    return allFiles.filter(file => file.assetId === assetId);
  }

  /**
   * Update file metadata
   */
  static async update(id: string, updates: Partial<FileBlob>): Promise<void> {
    await db.files.update(id, updates);
  }

  /**
   * Delete a file
   */
  static async delete(id: string): Promise<void> {
    await db.deleteFile(id);
  }

  /**
   * Delete all files for an asset
   */
  static async deleteAssetFiles(projectId: string, assetId: string): Promise<void> {
    const files = await this.getAssetFiles(projectId, assetId);
    
    await db.transaction('rw', db.files, async () => {
      for (const file of files) {
        await db.deleteFile(file.id);
      }
    });
  }

  /**
   * Store multiple files (bulk operation)
   */
  static async storeMultiple(filesData: Array<Omit<FileBlob, 'id' | 'createdAt'>>): Promise<string[]> {
    const files: FileBlob[] = filesData.map(fileData => ({
      ...fileData,
      id: createId(),
      createdAt: new Date().toISOString(),
    }));

    await db.transaction('rw', db.files, async () => {
      for (const file of files) {
        await db.storeFile(file);
      }
    });

    return files.map(file => file.id);
  }

  /**
   * Get file statistics for a project
   */
  static async getProjectFileStats(projectId: string): Promise<{
    count: number;
    totalSize: number;
    byMimeType: Record<string, number>;
  }> {
    const files = await db.getProjectFiles(projectId);
    
    const stats = {
      count: files.length,
      totalSize: files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0),
      byMimeType: files.reduce((acc, file) => {
        const mimeType = file.mimeType || 'unknown';
        acc[mimeType] = (acc[mimeType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return stats;
  }

  /**
   * Clean up orphaned files (files without associated assets)
   */
  static async cleanupOrphanedFiles(projectId: string): Promise<number> {
    const [files, assets] = await Promise.all([
      db.getProjectFiles(projectId),
      db.getProjectAssets(projectId),
    ]);

    const assetIds = new Set(assets.map(asset => asset.id));
    const orphanedFiles = files.filter(file => 
      file.assetId && !assetIds.has(file.assetId)
    );

    await db.transaction('rw', db.files, async () => {
      for (const file of orphanedFiles) {
        await db.deleteFile(file.id);
      }
    });

    return orphanedFiles.length;
  }

  /**
   * Validate file structure
   */
  static validateFile(file: Partial<FileBlob>): void {
    if (!file.storageKey) {
      throw new Error('File must have storageKey');
    }

    if (!file.projectId) {
      throw new Error('File must have projectId');
    }

    if (file.sizeBytes !== undefined && file.sizeBytes < 0) {
      throw new Error('File size cannot be negative');
    }
  }

  /**
   * Create file from File object (for uploads)
   */
  static async createFromFile(
    projectId: string,
    file: File,
    assetId?: string,
    storageKey?: string
  ): Promise<string> {
    const fileData: Omit<FileBlob, 'id' | 'createdAt'> = {
      projectId,
      assetId,
      storageKey: storageKey || `uploads/${projectId}/${createId()}`,
      mimeType: file.type,
      sizeBytes: file.size,
      blob: file,
    };

    this.validateFile(fileData);
    return await this.store(fileData);
  }

  /**
   * Get file URL for display
   */
  static async getFileUrl(id: string): Promise<string | null> {
    const file = await this.get(id);
    if (!file?.blob) return null;

    return URL.createObjectURL(file.blob);
  }

  /**
   * Revoke file URL (memory management)
   */
  static revokeFileUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  /**
   * Compress image file
   */
  static async compressImage(file: File, maxWidth = 2048, quality = 0.85): Promise<File> {
    if (!file.type.startsWith('image/')) {
      return file; // Only compress images
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, {
                type: 'image/webp', // Convert to WebP
                lastModified: Date.now(),
              }));
            } else {
              resolve(file);
            }
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }
}

// Export singleton instance
export const filePersistence = FilePersistence;
