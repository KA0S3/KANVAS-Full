/**
 * UNIFIED UPLOAD SERVICE
 * 
 * Handles file uploads with unified interface
 * This is a simplified version for compatibility
 */

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
  metadata?: Record<string, any>;
}

interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  size?: number;
  metadata?: Record<string, any>;
  error?: string;
}

class UnifiedUploadService {
  private static instance: UnifiedUploadService;

  static getInstance(): UnifiedUploadService {
    if (!UnifiedUploadService.instance) {
      UnifiedUploadService.instance = new UnifiedUploadService();
    }
    return UnifiedUploadService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Upload a file
   */
  async uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Create upload key
      const key = this.generateUploadKey(file);

      // In a real implementation, this would upload to cloud storage
      // For now, simulate upload with progress
      const result = await this.simulateUpload(file, key, options);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      options.onError?.(error instanceof Error ? error : new Error(errorMessage));
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(files: File[], options: UploadOptions = {}): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.uploadFile(file, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Upload from URL
   */
  async uploadFromUrl(url: string, options: UploadOptions = {}): Promise<UploadResult> {
    try {
      // Fetch the file from URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const blob = await response.blob();
      const filename = this.extractFilenameFromUrl(url) || 'download';
      const file = new File([blob], filename, { type: blob.type });

      return await this.uploadFile(file, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Cancel upload by key
   */
  cancelUpload(key: string): boolean {
    // In a real implementation, this would cancel the upload
    console.log(`Would cancel upload: ${key}`);
    return true;
  }

  /**
   * Get upload status
   */
  getUploadStatus(key: string): {
    status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
    progress?: UploadProgress;
    result?: UploadResult;
  } {
    // In a real implementation, this would return actual status
    return {
      status: 'completed',
      progress: { loaded: 100, total: 100, percentage: 100 }
    };
  }

  // Private helper methods
  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds limit of ${maxSize / 1024 / 1024}MB`
      };
    }

    // Check file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'application/pdf',
      'application/json'
    ];

    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      return {
        valid: false,
        error: `File type ${file.type} is not supported`
      };
    }

    return { valid: true };
  }

  private generateUploadKey(file: File): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const extension = file.name.split('.').pop() || 'bin';
    return `uploads/${timestamp}-${random}.${extension}`;
  }

  private async simulateUpload(file: File, key: string, options: UploadOptions): Promise<UploadResult> {
    const total = file.size;
    let loaded = 0;
    const chunkSize = 1024 * 1024; // 1MB chunks

    return new Promise((resolve) => {
      const uploadInterval = setInterval(() => {
        loaded += chunkSize;
        if (loaded > total) loaded = total;

        const progress: UploadProgress = {
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100)
        };

        options.onProgress?.(progress);

        if (loaded >= total) {
          clearInterval(uploadInterval);

          const result: UploadResult = {
            success: true,
            url: `https://example.com/${key}`,
            key,
            size: file.size,
            metadata: {
              originalName: file.name,
              mimeType: file.type,
              uploadedAt: new Date().toISOString(),
              ...options.metadata
            }
          };

          options.onComplete?.(result);
          resolve(result);
        }
      }, 100); // Simulate upload progress
    });
  }

  private extractFilenameFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || null;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const unifiedUploadService = UnifiedUploadService.getInstance();
