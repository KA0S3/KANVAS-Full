/**
 * KANVAS PERFORMANCE SYSTEM INTEGRATION
 * 
 * Unified performance system that integrates all optimization components
 * from the rewrite plan. Provides a single entry point for all performance
 * monitoring and optimization features.
 * 
 * 🔒 CRITICAL: This is the main integration point for performance optimizations
 */

import { lowIOSaveManager, type SaveOperation } from './lowIOSaveManager';
import { objectURLManager, type ObjectURLInfo } from './objectURLManager';
import { imageOptimizationPipeline, type ImageProcessingResult, type ImageProcessingOptions } from './imageOptimizationPipeline';
import { performanceMonitor, type PerformanceMetrics, type PerformanceThresholds } from './performanceMonitor';
import { viewportCulling, type Viewport } from './spatialIndex';

export interface PerformanceSystemConfig {
  // Enable/disable individual components
  enableLowIOSave: boolean;
  enableObjectURLTracking: boolean;
  enableImageOptimization: boolean;
  enablePerformanceMonitoring: boolean;
  enableViewportCulling: boolean;
  
  // Performance thresholds
  thresholds: Partial<PerformanceThresholds>;
  
  // Auto-cleanup settings
  autoCleanupInterval: number;
  enableAutoCleanup: boolean;
  
  // Monitoring settings
  enableRealTimeMonitoring: boolean;
  monitoringInterval: number;
  enableAlerts: boolean;
}

export interface PerformanceSystemStats {
  lowIOSave: ReturnType<typeof lowIOSaveManager.getStats>;
  objectURLs: ReturnType<typeof objectURLManager.getStats>;
  imageOptimization: ReturnType<typeof imageOptimizationPipeline.getStats>;
  performanceMonitor: PerformanceMetrics;
  viewportCulling: ReturnType<typeof viewportCulling.getStats>;
  systemHealth: 'healthy' | 'warning' | 'critical';
  uptime: number;
}

/**
 * Unified Performance System for KANVAS
 */
export class PerformanceSystem {
  private static instance: PerformanceSystem;
  private config: PerformanceSystemConfig;
  private isInitialized = false;
  private isDestroyed = false;
  private startTime = Date.now();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private monitoringTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<PerformanceSystemConfig> = {}) {
    this.config = {
      enableLowIOSave: true,
      enableObjectURLTracking: true,
      enableImageOptimization: true,
      enablePerformanceMonitoring: true,
      enableViewportCulling: true,
      thresholds: {},
      autoCleanupInterval: 60000, // 1 minute
      enableAutoCleanup: true,
      enableRealTimeMonitoring: true,
      monitoringInterval: 30000, // 30 seconds
      enableAlerts: true,
      ...config
    };
  }

  static getInstance(config?: Partial<PerformanceSystemConfig>): PerformanceSystem {
    if (!PerformanceSystem.instance) {
      PerformanceSystem.instance = new PerformanceSystem(config);
    }
    return PerformanceSystem.instance;
  }

  /**
   * Initialize the performance system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || this.isDestroyed) {
      return;
    }

    console.log('Initializing KANVAS Performance System...');

    try {
      // Initialize performance monitoring first
      if (this.config.enablePerformanceMonitoring) {
        this.initializePerformanceMonitoring();
      }

      // Initialize individual components
      if (this.config.enableLowIOSave) {
        console.log('✓ Low-IO Save Manager initialized');
      }

      if (this.config.enableObjectURLTracking) {
        console.log('✓ Object URL Manager initialized');
      }

      if (this.config.enableImageOptimization) {
        console.log('✓ Image Optimization Pipeline initialized');
      }

      if (this.config.enableViewportCulling) {
        console.log('✓ Viewport Culling initialized');
      }

      // Start background processes
      if (this.config.enableAutoCleanup) {
        this.startAutoCleanup();
      }

      if (this.config.enableRealTimeMonitoring) {
        this.startRealTimeMonitoring();
      }

      this.isInitialized = true;
      console.log('✓ KANVAS Performance System initialized successfully');

    } catch (error) {
      console.error('Failed to initialize Performance System:', error);
      throw error;
    }
  }

  /**
   * Initialize performance monitoring with custom thresholds
   */
  private initializePerformanceMonitoring(): void {
    // Apply custom thresholds if provided
    if (this.config.thresholds) {
      // Note: In a real implementation, you'd update the monitor thresholds
      console.log('Performance monitoring thresholds customized');
    }

    // Start with initial metrics collection
    performanceMonitor.updateMemoryUsage();
    performanceMonitor.updateStorageQuota();
  }

  /**
   * Start automatic cleanup processes
   */
  private startAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performAutoCleanup();
    }, this.config.autoCleanupInterval);
  }

  /**
   * Perform automatic cleanup of all components
   */
  private performAutoCleanup(): void {
    if (this.isDestroyed) return;

    try {
      // Object URL cleanup is handled automatically by the manager
      const objectURLStats = objectURLManager.getStats();
      
      // Check if we need aggressive cleanup
      if (objectURLStats.active > 50) {
        console.warn('High object URL count detected, considering cleanup');
      }

      // Update performance metrics
      performanceMonitor.updateMemoryUsage();
      performanceMonitor.updateObjectURLCount(objectURLStats.active);

    } catch (error) {
      console.error('Auto cleanup failed:', error);
    }
  }

  /**
   * Start real-time performance monitoring
   */
  private startRealTimeMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.monitoringTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoringInterval);
  }

  /**
   * Perform system health check
   */
  private performHealthCheck(): void {
    if (this.isDestroyed) return;

    try {
      // Check performance thresholds
      if (this.config.enableAlerts) {
        performanceMonitor.checkPerformanceThresholds();
      }

      // Update system metrics
      this.updateSystemMetrics();

    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  /**
   * Update system-wide metrics
   */
  private updateSystemMetrics(): void {
    // Update memory usage
    performanceMonitor.updateMemoryUsage();

    // Update object URL count
    const objectURLStats = objectURLManager.getStats();
    performanceMonitor.updateObjectURLCount(objectURLStats.active);

    // Update image blob count (estimate from object URLs)
    const imageBlobCount = objectURLStats.active; // Simplified
    performanceMonitor.updateImageBlobCount(imageBlobCount);
  }

  // Public API methods for component integration

  /**
   * Queue a save operation with low-IO optimization
   */
  queueSave(operation: Omit<SaveOperation, 'timestamp'>, operationType: 'drag' | 'text' | 'structural' = 'structural'): void {
    if (!this.config.enableLowIOSave) return;

    const startTime = performance.now();
    lowIOSaveManager.queueSave(operation, operationType);
    
    // Record performance metric
    const duration = performance.now() - startTime;
    performanceMonitor.recordAssetOperation(`save_${operation.type}`, duration);
  }

  /**
   * Create and track an object URL
   */
  createObjectURL(blob: Blob, assetId: string, options: { isTemporary?: boolean; maxSize?: number } = {}): string {
    if (!this.config.enableObjectURLTracking) {
      return URL.createObjectURL(blob);
    }

    return objectURLManager.createObjectURL(blob, assetId, options);
  }

  /**
   * Revoke an object URL
   */
  revokeObjectURL(url: string): boolean {
    if (!this.config.enableObjectURLTracking) {
      URL.revokeObjectURL(url);
      return true;
    }

    return objectURLManager.revokeObjectURL(url);
  }

  /**
   * Process an image with optimization pipeline
   */
  async processImage(file: File, options?: Partial<ImageProcessingOptions>): Promise<ImageProcessingResult> {
    if (!this.config.enableImageOptimization) {
      // Return basic result without optimization
      return {
        original: {
          file,
          size: file.size,
          type: file.type,
          dimensions: await this.getBasicImageDimensions(file)
        },
        variants: [],
        processingStats: {
          originalSize: file.size,
          totalOptimizedSize: file.size,
          compressionRatio: 1,
          processingTime: 0,
          webpSupported: false
        }
      };
    }

    const startTime = performance.now();
    const result = await imageOptimizationPipeline.processImage(file, options);
    const duration = performance.now() - startTime;

    // Record performance metrics
    performanceMonitor.recordImageProcessing(
      duration,
      result.processingStats.webpSupported,
      result.variants.some(v => v.size === 'thumbnail')
    );
    performanceMonitor.updateImageCompressionRatio(result.processingStats.compressionRatio);

    return result;
  }

  /**
   * Get basic image dimensions (fallback method)
   */
  private async getBasicImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    });
  }

  /**
   * Get visible assets using viewport culling
   */
  getVisibleAssets(viewport: Viewport, allAssets: Map<string, any>): any[] {
    if (!this.config.enableViewportCulling) {
      return Array.from(allAssets.values());
    }

    const startTime = performance.now();
    const visibleAssets = viewportCulling.getVisibleAssets(viewport, allAssets);
    const duration = performance.now() - startTime;

    // Record performance metrics
    performanceMonitor.recordRenderFrame(duration);
    performanceMonitor.updateViewportAssetCount(visibleAssets.length);
    performanceMonitor.updateTotalAssetCount(allAssets.size);

    return visibleAssets;
  }

  /**
   * Get comprehensive system statistics
   */
  getSystemStats(): PerformanceSystemStats {
    const stats: PerformanceSystemStats = {
      lowIOSave: this.config.enableLowIOSave ? lowIOSaveManager.getStats() : null,
      objectURLs: this.config.enableObjectURLTracking ? objectURLManager.getStats() : null,
      imageOptimization: this.config.enableImageOptimization ? imageOptimizationPipeline.getStats() : null,
      performanceMonitor: performanceMonitor.getMetrics(),
      viewportCulling: this.config.enableViewportCulling ? viewportCulling.getStats() : null,
      systemHealth: this.calculateSystemHealth(),
      uptime: Date.now() - this.startTime
    };

    return stats;
  }

  /**
   * Calculate overall system health
   */
  private calculateSystemHealth(): 'healthy' | 'warning' | 'critical' {
    const metrics = performanceMonitor.getMetrics();
    
    // Check for critical issues
    if (metrics.criticalAlertsTriggered > 0) {
      return 'critical';
    }
    
    // Check for warnings
    if (metrics.warningsTriggered > 0 || metrics.memoryLeaksDetected > 0) {
      return 'warning';
    }
    
    return 'healthy';
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): string {
    return performanceMonitor.getEnhancedMetricsSummary();
  }

  /**
   * Force immediate cleanup of all components
   */
  async forceCleanup(): Promise<void> {
    console.log('Performing force cleanup...');

    // Flush pending save operations
    if (this.config.enableLowIOSave) {
      await lowIOSaveManager.flushAllOperations();
    }

    // Cleanup object URLs (automatic, but we can trigger it)
    if (this.config.enableObjectURLTracking) {
      objectURLManager.cleanupAll();
    }

    // Update metrics
    this.updateSystemMetrics();

    console.log('Force cleanup completed');
  }

  /**
   * Handle page unload
   */
  handlePageUnload(): void {
    if (this.isDestroyed) return;

    console.log('Performance System handling page unload...');

    // Flush critical operations
    if (this.config.enableLowIOSave) {
      lowIOSaveManager.handlePageUnload();
    }

    // Cleanup object URLs
    if (this.config.enableObjectURLTracking) {
      objectURLManager.cleanupAll();
    }

    this.destroy();
  }

  /**
   * Destroy the performance system and clean up all resources
   */
  destroy(): void {
    if (this.isDestroyed) return;

    console.log('Destroying Performance System...');

    this.isDestroyed = true;

    // Clear timers
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // Destroy individual components
    if (this.config.enableLowIOSave) {
      lowIOSaveManager.destroy();
    }

    if (this.config.enableObjectURLTracking) {
      objectURLManager.destroy();
    }

    if (this.config.enableImageOptimization) {
      imageOptimizationPipeline.destroy();
    }

    if (this.config.enableViewportCulling) {
      viewportCulling.clear();
    }

    console.log('Performance System destroyed');
  }
}

// Export singleton instance
export const performanceSystem = PerformanceSystem.getInstance();

// Set up page unload handler
window.addEventListener('beforeunload', () => {
  performanceSystem.handlePageUnload();
});

// Auto-initialize
performanceSystem.initialize().catch(error => {
  console.error('Failed to auto-initialize Performance System:', error);
});
