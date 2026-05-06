// DEPRECATED: This service is no longer used. Use R2UploadService instead.
// Kept for backward compatibility only.
import { supabase } from '@/lib/supabase';
import { useCloudStore } from '@/stores/cloudStore';
import { useAuthStore } from '@/stores/authStore';
import { withUploadRateLimit } from '@/services/rateLimitMiddleware';

export interface AssetVariant {
  id: string;
  type: 'thumbnail' | 'preview' | 'original';
  size: number;
  blob: Blob;
  mimeType: string;
}

export interface UploadRequest {
  assetId: string;
  variants: AssetVariant[];
  projectId: string;
}

export interface UploadUrlsResponse {
  uploadUrls: Array<{
    asset_id: string;
    signedUrl: string;
    path: string;
  }>;
}

export interface CloudAssetMetadata {
  id: string;
  project_id: string;
  user_id: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  cloud_path: string;
  variants: Array<{
    type: string;
    path: string;
    size: number;
  }>;
  created_at: string;
  updated_at: string;
}

class AssetUploadService {
  private static instance: AssetUploadService;

  static getInstance(): AssetUploadService {
    if (!AssetUploadService.instance) {
      AssetUploadService.instance = new AssetUploadService();
    }
    return AssetUploadService.instance;
  }

  /**
   * Check if upload is possible within quota
   */
  async canUpload(totalBytes: number): Promise<boolean> {
    const cloudStore = useCloudStore.getState();
    return cloudStore.canUpload(totalBytes);
  }

  /**
   * Generate variants for an asset (thumbnail, preview, original)
   */
  async generateVariants(file: File): Promise<AssetVariant[]> {
    const variants: AssetVariant[] = [];
    
    // Original variant
    variants.push({
      id: `${crypto.randomUUID()}-original`,
      type: 'original',
      size: file.size,
      blob: file,
      mimeType: file.type
    });

    // Generate thumbnail and preview for images
    if (file.type.startsWith('image/')) {
      try {
        // Thumbnail (max 200x200)
        const thumbnailBlob = await this.createImageVariant(file, 200, 200, 0.8);
        variants.push({
          id: `${crypto.randomUUID()}-thumbnail`,
          type: 'thumbnail',
          size: thumbnailBlob.size,
          blob: thumbnailBlob,
          mimeType: file.type
        });

        // Preview (max 800x800)
        const previewBlob = await this.createImageVariant(file, 800, 800, 0.9);
        variants.push({
          id: `${crypto.randomUUID()}-preview`,
          type: 'preview',
          size: previewBlob.size,
          blob: previewBlob,
          mimeType: file.type
        });
      } catch (error) {
        console.warn('Failed to generate image variants:', error);
        // Continue with just the original if variant generation fails
      }
    }

    return variants;
  }

  /**
   * Create resized image variant
   */
  private async createImageVariant(file: File, maxWidth: number, maxHeight: number, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        const aspectRatio = width / height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            width = maxWidth;
            height = width / aspectRatio;
          } else {
            height = maxHeight;
            width = height * aspectRatio;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and resize
        ctx?.drawImage(img, 0, 0, width, height);

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
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get signed URLs for upload
   */
  async getUploadUrls(assetId: string, variants: AssetVariant[], projectId: string): Promise<UploadUrlsResponse> {
    const authStore = useAuthStore.getState();
    if (!authStore.user || !authStore.isAuthenticated) {
      throw new Error('User not authenticated');
    }

    // Check quota before proceeding
    const totalBytes = variants.reduce((sum, variant) => sum + variant.size, 0);
    const canUpload = await this.canUpload(totalBytes);
    
    if (!canUpload) {
      throw new Error('Storage quota exceeded. Please upgrade your plan to continue uploading.');
    }

    // Apply rate limiting for uploads
    const uploadSizeMB = totalBytes / (1024 * 1024); // Convert bytes to MB
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const files = variants.map(variant => ({
      asset_id: `${assetId}-${variant.type}`,
      size_bytes: variant.size
    }));

    return await withUploadRateLimit(authStore.user.id, uploadSizeMB, async () => {
      const { data, error } = await supabase.functions.invoke<UploadUrlsResponse>('getUploadUrls', {
        body: {
          project_id: projectId,
          files
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Failed to get upload URLs:', error);
        throw new Error(`Failed to get upload URLs: ${error.message}`);
      }

      return data;
    }, {
      onWarning: (message) => {
        console.warn('[Upload Rate Limit]', message);
        // Could show toast notification here
      },
      onError: (message) => {
        console.error('[Upload Rate Limit]', message);
        // Could show error toast here
      }
    });
  }

  /**
   * Upload blob to signed URL
   */
  async uploadBlob(signedUrl: string, blob: Blob): Promise<void> {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': blob.type,
        'Content-Length': blob.size.toString()
      }
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  /**
   * Register file metadata in database
   */
  async registerFileMetadata(
    assetId: string,
    projectId: string,
    filename: string,
    fileSize: number,
    mimeType: string,
    cloudPath: string,
    variants: Array<{ type: string; path: string; size: number }>
  ): Promise<void> {
    const authStore = useAuthStore.getState();
    if (!authStore.user || !authStore.isAuthenticated) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase.from('cloud_assets').insert({
      id: assetId,
      project_id: projectId,
      user_id: authStore.user.id,
      original_filename: filename,
      file_size: fileSize,
      mime_type: mimeType,
      cloud_path: cloudPath,
      variants
    });

    if (error) {
      console.error('Failed to register file metadata:', error);
      throw new Error(`Failed to register file metadata: ${error.message}`);
    }
  }

  /**
   * Upload complete asset (all variants)
   */
  async uploadAsset(request: UploadRequest): Promise<{
    success: boolean;
    cloudPath?: string;
    error?: string;
  }> {
    try {
      // Check quota
      const totalBytes = request.variants.reduce((sum, variant) => sum + variant.size, 0);
      const cloudStore = useCloudStore.getState();
      const canUpload = cloudStore.canUpload(totalBytes);
      
      if (!canUpload) {
        return {
          success: false,
          error: 'Storage quota exceeded. Please upgrade your plan to continue uploading.'
        };
      }

      // Get upload URLs
      const uploadUrls = await this.getUploadUrls(
        request.assetId,
        request.variants,
        request.projectId
      );

      // Upload all variants
      const uploadPromises = request.variants.map(async (variant) => {
        const uploadUrl = uploadUrls.uploadUrls.find(
          url => url.asset_id === `${request.assetId}-${variant.type}`
        );
        
        if (!uploadUrl) {
          throw new Error(`No upload URL found for variant ${variant.type}`);
        }

        await this.uploadBlob(uploadUrl.signedUrl, variant.blob);
        
        return {
          type: variant.type,
          path: uploadUrl.path,
          size: variant.size
        };
      });

      const uploadedVariants = await Promise.all(uploadPromises);

      // Register metadata
      const originalVariant = request.variants.find(v => v.type === 'original');
      if (!originalVariant) {
        throw new Error('Original variant is required');
      }

      await this.registerFileMetadata(
        request.assetId,
        request.projectId,
        originalVariant.blob instanceof File ? originalVariant.blob.name : 'unknown',
        originalVariant.size,
        originalVariant.mimeType,
        uploadedVariants.find(v => v.type === 'original')?.path || '',
        uploadedVariants
      );

      // Note: Cloud store update would be handled by the store itself
      // The addAsset method doesn't exist on CloudStore, so we skip this step
      // The store will be updated through other mechanisms (real-time subscriptions, etc.)

      return {
        success: true,
        cloudPath: uploadedVariants.find(v => v.type === 'original')?.path
      };
    } catch (error) {
      console.error('Upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }
}

export const assetUploadService = AssetUploadService.getInstance();
