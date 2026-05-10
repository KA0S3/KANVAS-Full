/**
 * UnifiedUploadService - Consolidated upload service facade
 * 
 * This service consolidates three overlapping upload services:
 * - R2UploadService: Direct-to-R2 uploads with progress tracking and variants
 * - fileUploadService: Supabase Storage integration
 * - assetUploadService: DEPRECATED (removed)
 * 
 * Features:
 * - Automatic backend selection based on configuration and needs
 * - Unified API regardless of backend
 * - Progress tracking (R2 only)
 * - Image variant generation (R2 only)
 * - Consistent error handling
 * - Backward compatibility methods
 */

import { supabase } from '@/lib/supabase';
import { r2UploadService, type UploadResult as R2UploadResult, type UploadProgress } from './R2UploadService';
import { uploadFile as uploadToSupabase, type UploadResult as SupabaseUploadResult, type UploadOptions as SupabaseUploadOptions } from './fileUploadService';
import { createFile } from './ProjectService';
import { pathStandardizationService, PathType, type StandardizedPath } from './pathStandardizationService';

// =====================================================
// Unified Type Definitions
// =====================================================

export type UploadBackend = 'r2' | 'supabase' | 'auto';

export interface UnifiedUploadOptions {
  projectId: string;
  assetId?: string;
  backend?: UploadBackend;
  generateVariants?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  expiresIn?: number;
  bucket?: string;
}

export interface UnifiedUploadResult {
  success: boolean;
  backend: 'r2' | 'supabase';
  fileId?: string;
  storageKey?: string;
  r2Key?: string;
  publicUrl?: string;
  signedUrl?: string;
  error?: string;
}

export interface UnifiedBatchUploadOptions extends Omit<UnifiedUploadOptions, 'assetId'> {
  files: Array<{ file: File; assetId?: string }>;
}

export interface UnifiedBatchUploadResult {
  results: UnifiedUploadResult[];
  overallSuccess: boolean;
}

// =====================================================
// Main UnifiedUploadService Class
// =====================================================

class UnifiedUploadService {
  private static instance: UnifiedUploadService;
  private r2Configured: boolean;

  static getInstance(): UnifiedUploadService {
    if (!UnifiedUploadService.instance) {
      UnifiedUploadService.instance = new UnifiedUploadService();
    }
    return UnifiedUploadService.instance;
  }

  constructor() {
    // Check if R2 is configured
    this.r2Configured = !!import.meta.env.VITE_R2_PUBLIC_URL;
  }

  /**
   * Primary upload method - routes to appropriate backend with standardized paths
   */
  async upload(file: File, options: UnifiedUploadOptions): Promise<UnifiedUploadResult> {
    // Generate standardized path for R2
    const standardizedPath = pathStandardizationService.generateStandardizedPath({
      projectId: options.projectId,
      assetId: options.assetId,
      filename: file.name,
      pathType: PathType.ASSET,
      preserveOriginalName: true,
      includeTimestamp: true
    });

    // Always prefer R2 backend for consistency
    const backend: 'r2' = 'r2';
    
    try {
      return await this.uploadToR2(file, options, standardizedPath);
    } catch (error) {
      console.error(`[UnifiedUpload] Upload failed on ${backend}:`, error);
      return {
        success: false,
        backend,
        error: this.normalizeError(error, backend)
      };
    }
  }

  /**
   * Batch upload multiple files
   */
  async uploadBatch(options: UnifiedBatchUploadOptions): Promise<UnifiedBatchUploadResult> {
    const results: UnifiedUploadResult[] = [];
    
    for (const { file, assetId } of options.files) {
      const result = await this.upload(file, {
        ...options,
        assetId: assetId || crypto.randomUUID()
      });
      results.push(result);
    }

    return {
      results,
      overallSuccess: results.every(r => r.success)
    };
  }

  /**
   * Upload with image variants (R2 only, falls back to basic upload on Supabase)
   */
  async uploadWithVariants(
    file: File,
    options: UnifiedUploadOptions & {
      generateThumbnail?: boolean;
      generatePreview?: boolean;
      thumbnailMaxSize?: number;
      previewMaxSize?: number;
    }
  ): Promise<UnifiedUploadResult> {
    const backend = this.selectBackend(options);
    
    if (backend === 'r2' && (options.generateVariants !== false)) {
      try {
        const result = await r2UploadService.uploadWithVariants(
          file,
          options.assetId || crypto.randomUUID(),
          options.projectId,
          {
            generateThumbnail: options.generateThumbnail ?? true,
            generatePreview: options.generatePreview ?? true,
            thumbnailMaxSize: options.thumbnailMaxSize ?? 200,
            previewMaxSize: options.previewMaxSize ?? 800
          },
          options.onProgress ? (stage, progress) => options.onProgress!(progress) : undefined
        );

        return {
          success: result.success,
          backend: 'r2',
          r2Key: result.r2Key,
          publicUrl: result.publicUrl,
          error: result.error
        };
      } catch (error) {
        console.error('[UnifiedUpload] Variant upload failed:', error);
        // Fall back to basic upload
        return await this.upload(file, options);
      }
    }

    // For Supabase or when variants disabled, do basic upload
    return await this.upload(file, options);
  }

  /**
   * Retry a failed upload (requires original file)
   */
  async retryUpload(
    assetId: string,
    file: File,
    projectId: string,
    options: Omit<UnifiedUploadOptions, 'assetId' | 'projectId'> = {}
  ): Promise<UnifiedUploadResult> {
    return await this.upload(file, {
      ...options,
      assetId,
      projectId
    });
  }

  /**
   * Get public URL for a file (backend-specific)
   */
  getPublicUrl(storageKey: string, backend: 'r2' | 'supabase' = 'r2'): string {
    switch (backend) {
      case 'r2':
        return r2UploadService.getPublicUrl(storageKey);
      case 'supabase':
        // Use fileUploadService getPublicUrl
        const { getPublicUrl } = require('./fileUploadService');
        return getPublicUrl(storageKey);
      default:
        throw new Error(`Cannot get public URL for backend: ${backend}`);
    }
  }

  /**
   * Check if a specific backend is configured and available
   */
  isBackendAvailable(backend: UploadBackend): boolean {
    switch (backend) {
      case 'r2':
        return this.r2Configured;
      case 'supabase':
        return true; // Supabase is always available if configured
      case 'auto':
        return this.r2Configured || true; // At least one backend available
      default:
        return false;
    }
  }

  /**
   * Subscribe to cloud retry events (R2 only)
   */
  onCloudRetry(callback: (assetId: string, retryCount: number, cloudError?: string) => void): () => void {
    return r2UploadService.onCloudRetry(callback);
  }

  // =====================================================
  // Backend Selection Logic
  // =====================================================

  private selectBackend(options: UnifiedUploadOptions): 'r2' | 'supabase' {
    // Explicit backend selection
    if (options.backend === 'r2') return 'r2';
    if (options.backend === 'supabase') return 'supabase';
    
    // Auto mode: intelligent selection based on features and configuration
    if (!this.r2Configured) {
      return 'supabase';
    }

    // Prefer R2 if progress tracking or variants are needed
    if (options.onProgress || options.generateVariants) {
      return 'r2';
    }

    // Default to R2 if configured
    return 'r2';
  }

  // =====================================================
  // Backend-Specific Upload Methods
  // =====================================================

  private async uploadToR2(file: File, options: UnifiedUploadOptions, standardizedPath?: StandardizedPath): Promise<UnifiedUploadResult> {
    const assetId = options.assetId || crypto.randomUUID();
    
    try {
      // Use R2UploadService.uploadFile method
      const result = await r2UploadService.uploadFile(
        file,
        assetId,
        options.projectId,
        options.onProgress ? (progress) => options.onProgress!(progress) : undefined
      );

      return {
        success: result.success,
        backend: 'r2',
        r2Key: result.r2Key,
        publicUrl: result.publicUrl,
        error: result.error
      };
    } catch (error) {
      console.error('[UnifiedUpload] R2 upload failed:', error);
      throw error;
    }
  }

  private async uploadToSupabase(file: File, options: UnifiedUploadOptions, standardizedPath?: StandardizedPath): Promise<UnifiedUploadResult> {
    try {
      const supabaseOptions: SupabaseUploadOptions = {
        projectId: options.projectId,
        assetId: options.assetId,
        expiresIn: options.expiresIn,
        bucket: options.bucket
      };

      const result = await uploadToSupabase(file, supabaseOptions);

      return {
        success: true,
        backend: 'supabase',
        fileId: result.fileId,
        storageKey: result.storageKey,
        publicUrl: result.publicUrl,
        signedUrl: result.signedUrl
      };
    } catch (error) {
      console.error('[UnifiedUpload] Supabase upload failed:', error);
      throw error;
    }
  }

  // =====================================================
  // Error Handling
  // =====================================================

  private normalizeError(error: unknown, backend: 'r2' | 'supabase'): string {
    if (error instanceof Error) {
      // Add backend context to error
      const backendPrefix = `[${backend.toUpperCase()}] `;
      return backendPrefix + error.message;
    }
    
    return `[${backend.toUpperCase()}] Upload failed: ${String(error)}`;
  }

  // =====================================================
  // Backward Compatibility Methods
  // =====================================================

  /**
   * Legacy method for R2UploadService compatibility
   */
  async uploadFile(
    file: File,
    assetId: string,
    projectId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<R2UploadResult> {
    const result = await this.upload(file, {
      assetId,
      projectId,
      backend: 'r2',
      onProgress
    });

    if (result.backend !== 'r2') {
      throw new Error('Legacy uploadFile method requires R2 backend');
    }

    return {
      success: result.success,
      r2Key: result.r2Key,
      publicUrl: result.publicUrl,
      error: result.error
    };
  }

  /**
   * Legacy method for fileUploadService compatibility
   */
  async uploadFileLegacy(
    file: File,
    options: SupabaseUploadOptions
  ): Promise<SupabaseUploadResult> {
    const result = await this.upload(file, {
      projectId: options.projectId,
      assetId: options.assetId,
      backend: 'supabase',
      expiresIn: options.expiresIn,
      bucket: options.bucket
    });

    if (result.backend !== 'supabase') {
      throw new Error('Legacy uploadFile method requires Supabase backend');
    }

    return {
      fileId: result.fileId!,
      storageKey: result.storageKey!,
      signedUrl: result.signedUrl
    };
  }

  /**
   * Get service status and configuration
   */
  getStatus() {
    return {
      r2Configured: this.r2Configured,
      availableBackends: [
        ...(this.r2Configured ? ['r2'] : []),
        'supabase'
      ] as UploadBackend[],
      defaultBackend: this.r2Configured ? 'r2' : 'supabase'
    };
  }
}

// =====================================================
// Export Singleton Instance
// =====================================================

export const unifiedUploadService = UnifiedUploadService.getInstance();

// =====================================================
// Utility Types and Functions
// =====================================================

/**
 * Helper function to determine if file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Helper function to estimate upload time
 */
export function estimateUploadTime(fileSize: number, speedMbps: number = 1): number {
  const fileSizeMB = fileSize / (1024 * 1024);
  return Math.ceil(fileSizeMB / speedMbps * 60); // Return time in seconds
}

/**
 * Helper function to validate upload options
 */
export function validateUploadOptions(options: UnifiedUploadOptions): string[] {
  const errors: string[] = [];

  if (!options.projectId?.trim()) {
    errors.push('Project ID is required');
  }

  if (options.backend && !['r2', 'supabase', 'auto'].includes(options.backend)) {
    errors.push('Invalid backend specified');
  }

  if (options.expiresIn && options.expiresIn < 60) {
    errors.push('Expiration time must be at least 60 seconds');
  }

  return errors;
}
