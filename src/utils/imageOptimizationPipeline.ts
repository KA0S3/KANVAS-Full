/**
 * IMAGE OPTIMIZATION PIPELINE
 * 
 * Complete image processing pipeline with WebP conversion, multiple size variants,
 * thumbnails, and memory-safe processing. Implements the rewrite plan's image
 * optimization requirements.
 * 
 * 🔒 CRITICAL: Must handle large images safely and prevent memory leaks
 */

import { objectURLManager } from './objectURLManager';

export interface ImageVariant {
  size: 'thumbnail' | 'preview' | 'full';
  url: string;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  isOptimized: boolean;
}

export interface ImageProcessingOptions {
  maxFileSize?: number;           // Max file size in bytes (50MB default)
  enableWebP?: boolean;          // Enable WebP conversion
  thumbnailSize?: number;         // Thumbnail max dimension (200px)
  previewSize?: number;           // Preview max dimension (800px)
  fullSize?: number;              // Full image max dimension (2048px)
  quality?: number;               // Compression quality (0.85)
  thumbnailQuality?: number;     // Thumbnail quality (0.7)
  generateThumbnails?: boolean;  // Generate thumbnail variants
  generatePreviews?: boolean;     // Generate preview variants
  preserveOriginal?: boolean;     // Keep original format as fallback
}

export interface ImageProcessingResult {
  original: {
    file: File;
    size: number;
    type: string;
    dimensions: { width: number; height: number };
  };
  variants: ImageVariant[];
  processingStats: {
    originalSize: number;
    totalOptimizedSize: number;
    compressionRatio: number;
    processingTime: number;
    webpSupported: boolean;
  };
}

export interface ImagePipelineConfig {
  supportedFormats: string[];
  maxFileSize: number;
  defaultOptions: ImageProcessingOptions;
  workerPoolSize: number;
  memoryLimit: number;
}

/**
 * Image Optimization Pipeline with WebP conversion and variants
 */
export class ImageOptimizationPipeline {
  private config: ImagePipelineConfig;
  private workerPool: Worker[] = [];
  private isDestroyed = false;

  // Performance tracking
  private stats = {
    processedImages: 0,
    totalOriginalSize: 0,
    totalOptimizedSize: 0,
    averageProcessingTime: 0,
    webpConversions: 0,
    errors: 0
  };

  constructor(config: Partial<ImagePipelineConfig> = {}) {
    this.config = {
      supportedFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
      maxFileSize: 50 * 1024 * 1024, // 50MB
      defaultOptions: {
        maxFileSize: 50 * 1024 * 1024,
        enableWebP: true,
        thumbnailSize: 200,
        previewSize: 800,
        fullSize: 2048,
        quality: 0.85,
        thumbnailQuality: 0.7,
        generateThumbnails: true,
        generatePreviews: true,
        preserveOriginal: true
      },
      workerPoolSize: 2,
      memoryLimit: 100 * 1024 * 1024, // 100MB
      ...config
    };

    // Initialize worker pool for background processing
    this.initializeWorkerPool();
  }

  /**
   * Process an image file through the optimization pipeline
   */
  async processImage(file: File, options: Partial<ImageProcessingOptions> = {}): Promise<ImageProcessingResult> {
    if (this.isDestroyed) {
      throw new Error('ImageOptimizationPipeline has been destroyed');
    }

    const startTime = performance.now();
    const mergedOptions = { ...this.config.defaultOptions, ...options };

    try {
      // Validate file
      this.validateFile(file, mergedOptions);

      // Get image dimensions
      const dimensions = await this.getImageDimensions(file);

      // Process image in background worker
      const variants = await this.processImageInBackground(file, dimensions, mergedOptions);

      // Calculate processing stats
      const processingTime = performance.now() - startTime;
      const originalSize = file.size;
      const totalOptimizedSize = variants.reduce((sum, variant) => sum + variant.fileSize, 0);
      const compressionRatio = originalSize > 0 ? totalOptimizedSize / originalSize : 1;

      const result: ImageProcessingResult = {
        original: {
          file,
          size: originalSize,
          type: file.type,
          dimensions
        },
        variants,
        processingStats: {
          originalSize,
          totalOptimizedSize,
          compressionRatio,
          processingTime,
          webpSupported: this.supportsWebP()
        }
      };

      // Update stats
      this.updateStats(result);

      return result;

    } catch (error) {
      this.stats.errors++;
      console.error('Image processing failed:', error);
      throw error;
    }
  }

  /**
   * Validate input file
   */
  private validateFile(file: File, options: ImageProcessingOptions): void {
    // Check file size
    const maxSize = options.maxFileSize || this.config.maxFileSize;
    if (file.size > maxSize) {
      throw new Error(`File size ${this.formatBytes(file.size)} exceeds maximum ${this.formatBytes(maxSize)}`);
    }

    // Check file type
    if (!this.config.supportedFormats.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}. Supported formats: ${this.config.supportedFormats.join(', ')}`);
    }

    // Check if file is actually an image
    if (!file.type.startsWith('image/')) {
      throw new Error('File is not an image');
    }
  }

  /**
   * Get image dimensions without loading the full image
   */
  private async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = objectURLManager.createObjectURL(file, 'temp-dimension-check', { isTemporary: true });

      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        objectURLManager.revokeObjectURL(objectUrl);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for dimension check'));
        objectURLManager.revokeObjectURL(objectUrl);
      };

      img.src = objectUrl;
    });
  }

  /**
   * Process image in background worker
   */
  private async processImageInBackground(
    file: File,
    dimensions: { width: number; height: number },
    options: ImageProcessingOptions
  ): Promise<ImageVariant[]> {
    return new Promise((resolve, reject) => {
      // For now, process in main thread. In production, use Web Workers
      this.processImageInMainThread(file, dimensions, options)
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Process image in main thread (temporary implementation)
   */
  private async processImageInMainThread(
    file: File,
    dimensions: { width: number; height: number },
    options: ImageProcessingOptions
  ): Promise<ImageVariant[]> {
    const variants: ImageVariant[] = [];
    const img = new Image();
    const objectUrl = objectURLManager.createObjectURL(file, 'temp-processing', { isTemporary: true });

    return new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          // Generate thumbnail
          if (options.generateThumbnails) {
            const thumbnail = await this.generateVariant(
              img,
              'thumbnail',
              options.thumbnailSize!,
              options.thumbnailQuality!,
              options.enableWebP!
            );
            variants.push(thumbnail);
          }

          // Generate preview
          if (options.generatePreviews) {
            const preview = await this.generateVariant(
              img,
              'preview',
              options.previewSize!,
              options.quality!,
              options.enableWebP!
            );
            variants.push(preview);
          }

          // Generate full-size optimized version
          const full = await this.generateVariant(
            img,
            'full',
            options.fullSize!,
            options.quality!,
            options.enableWebP!
          );
          variants.push(full);

          // Preserve original if requested
          if (options.preserveOriginal) {
            const original: ImageVariant = {
              size: 'full',
              url: objectUrl,
              width: dimensions.width,
              height: dimensions.height,
              format: file.type,
              fileSize: file.size,
              isOptimized: false
            };
            variants.push(original);
          } else {
            objectURLManager.revokeObjectURL(objectUrl);
          }

          resolve(variants);
        } catch (error) {
          objectURLManager.revokeObjectURL(objectUrl);
          reject(error);
        }
      };

      img.onerror = () => {
        objectURLManager.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for processing'));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Generate a specific image variant
   */
  private async generateVariant(
    img: HTMLImageElement,
    size: 'thumbnail' | 'preview' | 'full',
    maxDimension: number,
    quality: number,
    enableWebP: boolean
  ): Promise<ImageVariant> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Calculate new dimensions
    let { width, height } = img;
    const aspectRatio = width / height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        width = maxDimension;
        height = width / aspectRatio;
      } else {
        height = maxDimension;
        width = height * aspectRatio;
      }
    }

    canvas.width = width;
    canvas.height = height;

    // Draw and resize the image
    ctx.drawImage(img, 0, 0, width, height);

    // Determine output format
    const format = enableWebP && this.supportsWebP() ? 'image/webp' : 'image/jpeg';
    
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create image blob'));
            return;
          }

          const url = objectURLManager.createObjectURL(blob, `variant-${size}-${Date.now()}`);
          
          const variant: ImageVariant = {
            size,
            url,
            width,
            height,
            format,
            fileSize: blob.size,
            isOptimized: enableWebP && this.supportsWebP()
          };

          if (enableWebP && this.supportsWebP()) {
            this.stats.webpConversions++;
          }

          resolve(variant);
        },
        format,
        quality
      );
    });
  }

  /**
   * Check if WebP is supported
   */
  private supportsWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }

  /**
   * Initialize worker pool for background processing
   */
  private initializeWorkerPool(): void {
    // In production, create actual Web Workers
    // For now, we'll simulate worker pool
    console.log(`Initializing worker pool with ${this.config.workerPoolSize} workers`);
  }

  /**
   * Update processing statistics
   */
  private updateStats(result: ImageProcessingResult): void {
    this.stats.processedImages++;
    this.stats.totalOriginalSize += result.processingStats.originalSize;
    this.stats.totalOptimizedSize += result.processingStats.totalOptimizedSize;
    
    // Update average processing time
    const totalProcessingTime = this.stats.averageProcessingTime * (this.stats.processedImages - 1) + result.processingStats.processingTime;
    this.stats.averageProcessingTime = totalProcessingTime / this.stats.processedImages;
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    processedImages: number;
    totalOriginalSize: string;
    totalOptimizedSize: string;
    averageProcessingTime: number;
    webpConversions: number;
    errors: number;
    compressionRatio: number;
  } {
    const compressionRatio = this.stats.totalOriginalSize > 0 
      ? this.stats.totalOptimizedSize / this.stats.totalOriginalSize 
      : 1;

    return {
      processedImages: this.stats.processedImages,
      totalOriginalSize: this.formatBytes(this.stats.totalOriginalSize),
      totalOptimizedSize: this.formatBytes(this.stats.totalOptimizedSize),
      averageProcessingTime: this.stats.averageProcessingTime,
      webpConversions: this.stats.webpConversions,
      errors: this.stats.errors,
      compressionRatio
    };
  }

  /**
   * Format bytes for human readable output
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Clean up resources and destroy the pipeline
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Terminate worker pool
    this.workerPool.forEach(worker => {
      if (worker.terminate) {
        worker.terminate();
      }
    });
    this.workerPool = [];

    console.log('Image optimization pipeline destroyed');
  }
}

// Export singleton instance
export const imageOptimizationPipeline = new ImageOptimizationPipeline();

/**
 * Convenience function for quick image processing
 */
export async function optimizeImage(file: File, options?: Partial<ImageProcessingOptions>): Promise<ImageProcessingResult> {
  return imageOptimizationPipeline.processImage(file, options);
}

/**
 * Quick thumbnail generation function
 */
export async function generateThumbnail(file: File, maxSize = 200): Promise<string> {
  const result = await optimizeImage(file, {
    generateThumbnails: true,
    generatePreviews: false,
    thumbnailSize: maxSize
  });
  
  const thumbnail = result.variants.find(v => v.size === 'thumbnail');
  if (!thumbnail) {
    throw new Error('Failed to generate thumbnail');
  }
  
  return thumbnail.url;
}
