import { supabase } from '@/lib/supabase';
import { documentMutationService } from './DocumentMutationService';
import { useAuthStore } from '@/stores/authStore';
import { USE_SUPABASE } from '@/config/features';

export interface UploadResult {
  success: boolean;
  r2Key?: string;
  publicUrl?: string;
  error?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadUrlResponse {
  uploadUrls: Array<{
    asset_id: string;
    signedUrl: string;
    path: string;
  }>;
}

/**
 * R2UploadService - Handles direct-to-R2 file uploads with progress tracking
 * 
 * Phase 5 Implementation:
 * - Gets signed upload URLs from backend (getUploadUrls Edge Function)
 * - Uploads directly to R2 via XHR for progress tracking
 * - Registers file metadata via DocumentMutationService (RPC)
 * 
 * KEEP FRONTEND AS IS - Replaces assetUploadService for new uploads
 */
class R2UploadService {
  private static instance: R2UploadService;
  private r2PublicEndpoint: string;

  static getInstance(): R2UploadService {
    if (!R2UploadService.instance) {
      R2UploadService.instance = new R2UploadService();
    }
    return R2UploadService.instance;
  }

  private retryListeners: Set<(assetId: string, retryCount: number, cloudError?: string) => void> = new Set();
  private cloudRetryHandler: ((event: Event) => void) | null = null;

  constructor() {
    // R2 public endpoint for constructing public URLs
    // Format: https://pub-<hash>.r2.dev or https://<custom-domain>
    this.r2PublicEndpoint = import.meta.env.VITE_R2_PUBLIC_URL || '';

    // Listen for cloud retry events from DocumentMutationService (Phase 10)
    this.cloudRetryHandler = this.handleCloudRetryEvent.bind(this);
    window.addEventListener('cloud-retry-upload', this.cloudRetryHandler);

    // Cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => {
      if (this.cloudRetryHandler) {
        window.removeEventListener('cloud-retry-upload', this.cloudRetryHandler);
      }
    });
  }

  /**
   * Handle cloud retry events from DocumentMutationService
   */
  private handleCloudRetryEvent(event: Event): void {
    const customEvent = event as CustomEvent<{ assetId: string; retryCount: number; cloudError?: string }>;
    const { assetId, retryCount, cloudError } = customEvent.detail;
    
    console.log(`[R2Upload] Retry requested for asset ${assetId} (attempt ${retryCount})`);
    
    // Notify all registered retry listeners
    this.retryListeners.forEach(listener => {
      try {
        listener(assetId, retryCount, cloudError);
      } catch (error) {
        console.error('[R2Upload] Retry listener error:', error);
      }
    });
  }

  /**
   * Subscribe to cloud retry events
   * Returns unsubscribe function
   */
  onCloudRetry(callback: (assetId: string, retryCount: number, cloudError?: string) => void): () => void {
    this.retryListeners.add(callback);
    return () => this.retryListeners.delete(callback);
  }

  /**
   * Retry a failed upload
   * Requires the original file - caller must provide it
   */
  async retryUpload(
    assetId: string,
    file: File,
    projectId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    console.log(`[R2Upload] Retrying upload for asset ${assetId}`);
    
    // Reset retry count before attempting
    documentMutationService.resetCloudRetryCount(assetId);
    
    // Attempt the upload again
    return this.uploadFile(file, assetId, projectId, onProgress);
  }

  /**
   * Upload a file directly to R2 with progress tracking
   * 
   * Flow:
   * 1. Set cloud status to 'uploading'
   * 2. Get signed upload URL from backend Edge Function
   * 3. Upload file directly to R2 via XHR (for progress)
   * 4. Register file in database via RPC
   * 5. Update cloud status to 'synced' or 'failed'
   */
  async uploadFile(
    file: File,
    assetId: string,
    projectId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    if (!USE_SUPABASE) {
      console.info('[R2Upload] Skipped: USE_SUPABASE=false');
      return {
        success: false,
        error: 'Cloud uploads are disabled when USE_SUPABASE=false',
      };
    }

    try {
      // Validate authentication
      const authStore = useAuthStore.getState();
      if (!authStore.user || !authStore.isAuthenticated) {
        throw new Error('User not authenticated');
      }

      // Get session for Edge Function call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Step 1: Set status to 'uploading' before starting
      await documentMutationService.updateCloudStatus(assetId, 'uploading');

      // Step 2: Get signed upload URL from backend Edge Function
      const uploadUrlData = await this.getUploadUrl(
        assetId,
        file.size,
        projectId,
        session.access_token
      );

      if (!uploadUrlData) {
        throw new Error('Failed to get upload URL');
      }

      // Step 3: Upload directly to R2 using XHR for progress tracking
      await this.uploadToR2(
        uploadUrlData.signedUrl,
        file,
        onProgress
      );

      // Step 4: Register file in database via RPC
      const registered = await documentMutationService.registerFile(
        assetId,
        uploadUrlData.path,
        file.size,
        file.type,
        [] // variants - populated separately if needed
      );

      if (!registered) {
        throw new Error('File uploaded but registration failed');
      }

      // Step 5: Mark as synced on success
      await documentMutationService.updateCloudStatus(assetId, 'synced');

      // Construct public URL
      const publicUrl = this.getPublicUrl(uploadUrlData.path);

      return {
        success: true,
        r2Key: uploadUrlData.path,
        publicUrl
      };

    } catch (error) {
      console.error('[R2Upload] Upload failed:', error);
      
      // Mark as failed with error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      await documentMutationService.updateCloudStatus(assetId, 'failed', errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get signed upload URL from backend Edge Function
   */
  private async getUploadUrl(
    assetId: string,
    sizeBytes: number,
    projectId: string,
    accessToken: string
  ): Promise<{ signedUrl: string; path: string } | null> {
    if (!USE_SUPABASE) {
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke<UploadUrlResponse>('getUploadUrls', {
        body: {
          project_id: projectId,
          files: [{
            asset_id: assetId,
            size_bytes: sizeBytes
          }]
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (error) {
        console.error('[R2Upload] Failed to get upload URL:', error);
        throw new Error(`Failed to get upload URL: ${error.message}`);
      }

      if (!data?.uploadUrls || data.uploadUrls.length === 0) {
        throw new Error('No upload URL returned from server');
      }

      const uploadInfo = data.uploadUrls[0];
      return {
        signedUrl: uploadInfo.signedUrl,
        path: uploadInfo.path
      };

    } catch (error) {
      console.error('[R2Upload] getUploadUrl error:', error);
      throw error;
    }
  }

  /**
   * Upload file to R2 using XHR for progress tracking
   */
  private uploadToR2(
    signedUrl: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100)
          });
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed - network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      // Open and send
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      // Note: Content-Length is set automatically by browser for Blob/File
      xhr.send(file);
    });
  }

  /**
   * Get public URL for an R2 file
   * Requires VITE_R2_PUBLIC_URL to be set
   */
  getPublicUrl(r2Key: string): string {
    if (!this.r2PublicEndpoint) {
      console.warn('[R2Upload] VITE_R2_PUBLIC_URL not set, returning empty URL');
      return '';
    }

    // Remove leading slash if present to avoid double slashes
    const cleanKey = r2Key.startsWith('/') ? r2Key.slice(1) : r2Key;
    
    // Remove trailing slash from endpoint if present
    const cleanEndpoint = this.r2PublicEndpoint.endsWith('/') 
      ? this.r2PublicEndpoint.slice(0, -1) 
      : this.r2PublicEndpoint;

    return `${cleanEndpoint}/${cleanKey}`;
  }

  /**
   * Batch upload multiple files
   * 
   * Note: Each file still gets its own upload URL for proper progress tracking
   */
  async uploadBatch(
    files: Array<{ file: File; assetId: string; projectId: string }>,
    onProgress?: (assetId: string, progress: UploadProgress) => void
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    // Upload sequentially to avoid overwhelming the browser
    // For parallel uploads, call uploadFile multiple times and await Promise.all
    for (const { file, assetId, projectId } of files) {
      const result = await this.uploadFile(
        file,
        assetId,
        projectId,
        onProgress ? (progress) => onProgress(assetId, progress) : undefined
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Upload with image variant generation (thumbnail, preview)
   * 
   * This creates multiple R2 objects and registers them as variants
   */
  async uploadWithVariants(
    file: File,
    assetId: string,
    projectId: string,
    options: {
      generateThumbnail?: boolean;
      generatePreview?: boolean;
      thumbnailMaxSize?: number;
      previewMaxSize?: number;
    } = {},
    onProgress?: (stage: 'original' | 'thumbnail' | 'preview', progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const {
      generateThumbnail = true,
      generatePreview = true,
      thumbnailMaxSize = 200,
      previewMaxSize = 800
    } = options;

    try {
      // Only generate variants for images
      const isImage = file.type.startsWith('image/');
      const variants: Array<{ type: string; r2Key: string; size: number }> = [];

      // Upload original first
      const originalResult = await this.uploadFile(
        file,
        assetId,
        projectId,
        onProgress ? (progress) => onProgress('original', progress) : undefined
      );

      if (!originalResult.success) {
        return originalResult;
      }

      variants.push({
        type: 'original',
        r2Key: originalResult.r2Key!,
        size: file.size
      });

      // Generate and upload thumbnail if image
      if (isImage && generateThumbnail) {
        try {
          const thumbnailBlob = await this.createImageVariant(file, thumbnailMaxSize, thumbnailMaxSize, 0.8);
          const thumbnailId = `${assetId}-thumbnail`;
          
          const thumbnailResult = await this.uploadFile(
            new File([thumbnailBlob], `thumbnail-${file.name}`, { type: file.type }),
            thumbnailId,
            projectId,
            onProgress ? (progress) => onProgress('thumbnail', progress) : undefined
          );

          if (thumbnailResult.success) {
            variants.push({
              type: 'thumbnail',
              r2Key: thumbnailResult.r2Key!,
              size: thumbnailBlob.size
            });
          }
        } catch (error) {
          console.warn('[R2Upload] Thumbnail generation failed:', error);
          // Continue without thumbnail
        }
      }

      // Generate and upload preview if image
      if (isImage && generatePreview) {
        try {
          const previewBlob = await this.createImageVariant(file, previewMaxSize, previewMaxSize, 0.9);
          const previewId = `${assetId}-preview`;
          
          const previewResult = await this.uploadFile(
            new File([previewBlob], `preview-${file.name}`, { type: file.type }),
            previewId,
            projectId,
            onProgress ? (progress) => onProgress('preview', progress) : undefined
          );

          if (previewResult.success) {
            variants.push({
              type: 'preview',
              r2Key: previewResult.r2Key!,
              size: previewBlob.size
            });
          }
        } catch (error) {
          console.warn('[R2Upload] Preview generation failed:', error);
          // Continue without preview
        }
      }

      // Update the original registration with variants
      if (variants.length > 1) {
        await documentMutationService.registerFile(
          assetId,
          originalResult.r2Key!,
          file.size,
          file.type,
          variants
        );
      }

      return {
        success: true,
        r2Key: originalResult.r2Key,
        publicUrl: originalResult.publicUrl
      };

    } catch (error) {
      console.error('[R2Upload] Upload with variants failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Create resized image variant using canvas
   */
  private async createImageVariant(
    file: File,
    maxWidth: number,
    maxHeight: number,
    quality: number
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > maxWidth || height > maxHeight) {
          if (width / maxWidth > height / maxHeight) {
            width = maxWidth;
            height = width / aspectRatio;
          } else {
            height = maxHeight;
            width = height * aspectRatio;
          }
        }

        canvas.width = Math.round(width);
        canvas.height = Math.round(height);

        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          file.type,
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      
      // Create object URL and load
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      
      // Clean up object URL after loading
      img.onload = ((originalOnload) => {
        return () => {
          URL.revokeObjectURL(objectUrl);
          originalOnload();
        };
      })(img.onload.bind(img));
    });
  }

  /**
   * Check if R2 upload service is properly configured
   */
  isConfigured(): boolean {
    return !!this.r2PublicEndpoint;
  }
}

export const r2UploadService = R2UploadService.getInstance();
