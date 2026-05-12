// Enhanced performance monitoring utility for IO optimization
// Implements comprehensive monitoring from rewrite plan

export interface PerformanceThresholds {
  ASSET_OPERATION_TIME: number;    // ms
  SYNC_QUEUE_DEPTH: number;         // count
  MEMORY_USAGE: number;            // bytes
  RENDER_FRAME_TIME: number;       // ms (60fps target)
  DATABASE_OPERATION_TIME: number; // ms
  IMAGE_PROCESSING_TIME: number;   // ms
  WARNING_THRESHOLD: number;        // percentage
  CRITICAL_THRESHOLD: number;       // percentage
}

export interface PerformanceMetrics {
  // Basic operation metrics
  databaseRequests: number;
  authRequests: number;
  syncOperations: number;
  bookCreations: number;
  lastResetTime: number;
  
  // IO operation metrics
  autosaveOperations: number;
  manualSaveOperations: number;
  batchOperations: number;
  deduplicatedRequests: number;
  cancelledRequests: number;
  
  // Asset operation metrics
  assetOperations: Map<string, number>; // operation type -> count
  assetOperationTimes: Map<string, number>; // operation type -> avg time
  
  // Timing metrics
  totalAutosaveTime: number;
  totalBatchTime: number;
  averageAutosaveTime: number;
  averageBatchTime: number;
  slowOperationsCount: number;
  
  // Memory metrics
  memoryUsage: number;
  memoryPeak: number;
  objectURLCount: number;
  imageBlobCount: number;
  memoryLeaksDetected: number;
  
  // Storage metrics
  localStorageWrites: number;
  localStorageReads: number;
  localStorageSize: number;
  storageQuotaUsed: number;
  storageQuotaLimit: number;
  indexedDBSize: number;
  
  // Sync queue metrics
  syncQueueDepth: number;
  syncQueueMaxDepth: number;
  syncOperationsCompleted: number;
  syncOperationsFailed: number;
  averageSyncTime: number;
  
  // Rendering performance metrics
  renderFrameTime: number;
  renderFrameCount: number;
  droppedFrames: number;
  viewportAssetCount: number;
  totalAssetCount: number;
  
  // Image processing metrics
  imagesProcessed: number;
  imageProcessingTime: number;
  webpConversions: number;
  thumbnailGenerations: number;
  imageCompressionRatio: number;
  
  // Rate limiting metrics
  requestsPerMinute: number;
  peakRequestsPerMinute: number;
  rateLimitExceeded: number;
  
  // Alert metrics
  warningsTriggered: number;
  criticalAlertsTriggered: number;
  performanceDegradationEvents: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private thresholds: PerformanceThresholds = {
    ASSET_OPERATION_TIME: 100,     // ms
    SYNC_QUEUE_DEPTH: 100,         // count
    MEMORY_USAGE: 500 * 1024 * 1024, // 500MB
    RENDER_FRAME_TIME: 16,         // ms (60fps)
    DATABASE_OPERATION_TIME: 50,   // ms
    IMAGE_PROCESSING_TIME: 1000,   // ms
    WARNING_THRESHOLD: 80,         // percentage
    CRITICAL_THRESHOLD: 95         // percentage
  };

  private metrics: PerformanceMetrics = {
    // Basic operation metrics
    databaseRequests: 0,
    authRequests: 0,
    syncOperations: 0,
    bookCreations: 0,
    lastResetTime: Date.now(),
    
    // IO operation metrics
    autosaveOperations: 0,
    manualSaveOperations: 0,
    batchOperations: 0,
    deduplicatedRequests: 0,
    cancelledRequests: 0,
    
    // Asset operation metrics
    assetOperations: new Map(),
    assetOperationTimes: new Map(),
    
    // Timing metrics
    totalAutosaveTime: 0,
    totalBatchTime: 0,
    averageAutosaveTime: 0,
    averageBatchTime: 0,
    slowOperationsCount: 0,
    
    // Memory metrics
    memoryUsage: 0,
    memoryPeak: 0,
    objectURLCount: 0,
    imageBlobCount: 0,
    memoryLeaksDetected: 0,
    
    // Storage metrics
    localStorageWrites: 0,
    localStorageReads: 0,
    localStorageSize: 0,
    storageQuotaUsed: 0,
    storageQuotaLimit: 0,
    indexedDBSize: 0,
    
    // Sync queue metrics
    syncQueueDepth: 0,
    syncQueueMaxDepth: 0,
    syncOperationsCompleted: 0,
    syncOperationsFailed: 0,
    averageSyncTime: 0,
    
    // Rendering performance metrics
    renderFrameTime: 0,
    renderFrameCount: 0,
    droppedFrames: 0,
    viewportAssetCount: 0,
    totalAssetCount: 0,
    
    // Image processing metrics
    imagesProcessed: 0,
    imageProcessingTime: 0,
    webpConversions: 0,
    thumbnailGenerations: 0,
    imageCompressionRatio: 0,
    
    // Rate limiting metrics
    requestsPerMinute: 0,
    peakRequestsPerMinute: 0,
    rateLimitExceeded: 0,
    
    // Alert metrics
    warningsTriggered: 0,
    criticalAlertsTriggered: 0,
    performanceDegradationEvents: 0,
  };

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  incrementDatabaseRequests(): void {
    this.metrics.databaseRequests++;
  }

  incrementAuthRequests(): void {
    this.metrics.authRequests++;
  }

  incrementSyncOperations(): void {
    this.metrics.syncOperations++;
  }

  incrementBookCreations(): void {
    this.metrics.bookCreations++;
  }

  // IO operation tracking methods
  incrementAutosaveOperations(): void {
    this.metrics.autosaveOperations++;
  }

  incrementManualSaveOperations(): void {
    this.metrics.manualSaveOperations++;
  }

  incrementBatchOperations(): void {
    this.metrics.batchOperations++;
  }

  incrementDeduplicatedRequests(): void {
    this.metrics.deduplicatedRequests++;
  }

  incrementCancelledRequests(): void {
    this.metrics.cancelledRequests++;
  }

  // Timing tracking methods
  recordAutosaveTime(duration: number): void {
    this.metrics.totalAutosaveTime += duration;
    this.metrics.averageAutosaveTime = this.metrics.totalAutosaveTime / this.metrics.autosaveOperations;
    
    // Track slow operations (over 5 seconds)
    if (duration > 5000) {
      this.metrics.slowOperationsCount++;
    }
  }

  recordBatchTime(duration: number): void {
    this.metrics.totalBatchTime += duration;
    this.metrics.averageBatchTime = this.metrics.totalBatchTime / this.metrics.batchOperations;
  }

  // Storage tracking methods
  incrementLocalStorageWrites(): void {
    this.metrics.localStorageWrites++;
    this.updateLocalStorageSize();
  }

  incrementLocalStorageReads(): void {
    this.metrics.localStorageReads++;
  }

  private updateLocalStorageSize(): void {
    try {
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length + key.length;
        }
      }
      this.metrics.localStorageSize = totalSize;
    } catch (error) {
      console.warn('[Performance] Failed to calculate localStorage size:', error);
    }
  }

  async updateStorageQuota(): Promise<void> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        this.metrics.storageQuotaUsed = estimate.usage || 0;
        this.metrics.storageQuotaLimit = estimate.quota || 0;
      } catch (error) {
        console.warn('[Performance] Failed to get storage quota:', error);
      }
    }
  }

  // Rate limiting methods
  updateRequestsPerMinute(): void {
    const now = Date.now();
    const elapsedMinutes = (now - this.metrics.lastResetTime) / 60000;
    const totalRequests = this.metrics.databaseRequests + this.metrics.autosaveOperations + this.metrics.manualSaveOperations;
    
    this.metrics.requestsPerMinute = totalRequests / elapsedMinutes;
    this.metrics.peakRequestsPerMinute = Math.max(this.metrics.peakRequestsPerMinute, this.metrics.requestsPerMinute);
  }

  incrementRateLimitExceeded(): void {
    this.metrics.rateLimitExceeded++;
  }

  // Enhanced monitoring methods for rewrite plan metrics
  
  // Asset operation tracking
  recordAssetOperation(operation: string, duration: number): void {
    const currentCount = this.metrics.assetOperations.get(operation) || 0;
    this.metrics.assetOperations.set(operation, currentCount + 1);
    
    const currentAvgTime = this.metrics.assetOperationTimes.get(operation) || 0;
    const newAvgTime = (currentAvgTime * currentCount + duration) / (currentCount + 1);
    this.metrics.assetOperationTimes.set(operation, newAvgTime);
    
    // Check thresholds
    if (duration > this.thresholds.ASSET_OPERATION_TIME) {
      this.metrics.warningsTriggered++;
      console.warn(`Slow asset operation: ${operation} took ${duration}ms`);
    }
  }

  // Memory monitoring
  updateMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize;
      this.metrics.memoryPeak = Math.max(this.metrics.memoryPeak, memory.usedJSHeapSize);
      
      if (this.metrics.memoryUsage > this.thresholds.MEMORY_USAGE) {
        this.metrics.criticalAlertsTriggered++;
        console.error(`Memory usage exceeded threshold: ${this.formatBytes(this.metrics.memoryUsage)}`);
      }
    }
  }

  updateObjectURLCount(count: number): void {
    this.metrics.objectURLCount = count;
  }

  updateImageBlobCount(count: number): void {
    this.metrics.imageBlobCount = count;
  }

  detectMemoryLeak(): void {
    this.metrics.memoryLeaksDetected++;
    console.warn('Memory leak detected');
  }

  // Sync queue monitoring
  updateSyncQueueDepth(depth: number): void {
    this.metrics.syncQueueDepth = depth;
    this.metrics.syncQueueMaxDepth = Math.max(this.metrics.syncQueueMaxDepth, depth);
    
    if (depth > this.thresholds.SYNC_QUEUE_DEPTH) {
      this.metrics.warningsTriggered++;
      console.warn(`Sync queue depth exceeded threshold: ${depth}`);
    }
  }

  recordSyncOperation(completed: boolean, duration: number): void {
    if (completed) {
      this.metrics.syncOperationsCompleted++;
    } else {
      this.metrics.syncOperationsFailed++;
    }
    
    // Update average sync time
    const totalSyncOps = this.metrics.syncOperationsCompleted + this.metrics.syncOperationsFailed;
    if (totalSyncOps > 0) {
      this.metrics.averageSyncTime = (this.metrics.averageSyncTime * (totalSyncOps - 1) + duration) / totalSyncOps;
    }
  }

  // Rendering performance monitoring
  recordRenderFrame(frameTime: number): void {
    this.metrics.renderFrameTime = frameTime;
    this.metrics.renderFrameCount++;
    
    if (frameTime > this.thresholds.RENDER_FRAME_TIME) {
      this.metrics.droppedFrames++;
    }
  }

  updateViewportAssetCount(count: number): void {
    this.metrics.viewportAssetCount = count;
  }

  updateTotalAssetCount(count: number): void {
    this.metrics.totalAssetCount = count;
  }

  // Image processing monitoring
  recordImageProcessing(duration: number, webpConverted: boolean, thumbnailGenerated: boolean): void {
    this.metrics.imagesProcessed++;
    this.metrics.imageProcessingTime = (this.metrics.imageProcessingTime * (this.metrics.imagesProcessed - 1) + duration) / this.metrics.imagesProcessed;
    
    if (webpConverted) {
      this.metrics.webpConversions++;
    }
    
    if (thumbnailGenerated) {
      this.metrics.thumbnailGenerations++;
    }
    
    if (duration > this.thresholds.IMAGE_PROCESSING_TIME) {
      this.metrics.warningsTriggered++;
      console.warn(`Slow image processing: ${duration}ms`);
    }
  }

  updateImageCompressionRatio(ratio: number): void {
    this.metrics.imageCompressionRatio = ratio;
  }

  // IndexedDB monitoring
  updateIndexedDBSize(size: number): void {
    this.metrics.indexedDBSize = size;
  }

  // Alert system
  checkPerformanceThresholds(): void {
    this.updateMemoryUsage();
    
    // Check various thresholds and trigger alerts
    const checks = [
      { metric: this.metrics.memoryUsage, threshold: this.thresholds.MEMORY_USAGE, type: 'critical' as const, name: 'Memory Usage' },
      { metric: this.metrics.syncQueueDepth, threshold: this.thresholds.SYNC_QUEUE_DEPTH, type: 'warning' as const, name: 'Sync Queue Depth' },
      { metric: this.metrics.renderFrameTime, threshold: this.thresholds.RENDER_FRAME_TIME, type: 'warning' as const, name: 'Render Frame Time' },
    ];

    checks.forEach(check => {
      const percentage = (check.metric / check.threshold) * 100;
      
      if (percentage >= this.thresholds.CRITICAL_THRESHOLD) {
        this.metrics.criticalAlertsTriggered++;
        console.error(`CRITICAL: ${check.name} at ${percentage.toFixed(1)}% of threshold`);
      } else if (percentage >= this.thresholds.WARNING_THRESHOLD) {
        this.metrics.warningsTriggered++;
        console.warn(`WARNING: ${check.name} at ${percentage.toFixed(1)}% of threshold`);
      }
    });
  }

  // Utility methods
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  // Enhanced summary with new metrics
  getEnhancedMetricsSummary(): string {
    const elapsed = (Date.now() - this.metrics.lastResetTime) / 1000 / 60; // minutes
    const storageUsagePercent = this.metrics.storageQuotaLimit > 0 
      ? ((this.metrics.storageQuotaUsed / this.metrics.storageQuotaLimit) * 100).toFixed(1)
      : 'N/A';
    
    return `
Enhanced Performance Summary (${elapsed.toFixed(1)} minutes):

Basic Operations:
- Database Requests: ${this.metrics.databaseRequests}
- Auth Requests: ${this.metrics.authRequests}
- Sync Operations: ${this.metrics.syncOperations}
- Book Creations: ${this.metrics.bookCreations}

IO Optimization:
- Autosave Operations: ${this.metrics.autosaveOperations} (avg: ${this.metrics.averageAutosaveTime.toFixed(0)}ms)
- Manual Save Operations: ${this.metrics.manualSaveOperations}
- Batch Operations: ${this.metrics.batchOperations} (avg: ${this.metrics.averageBatchTime.toFixed(0)}ms)
- Deduplicated Requests: ${this.metrics.deduplicatedRequests}
- Cancelled Requests: ${this.metrics.cancelledRequests}

Memory Performance:
- Current Usage: ${this.formatBytes(this.metrics.memoryUsage)}
- Peak Usage: ${this.formatBytes(this.metrics.memoryPeak)}
- Object URLs: ${this.metrics.objectURLCount}
- Image Blobs: ${this.metrics.imageBlobCount}
- Memory Leaks Detected: ${this.metrics.memoryLeaksDetected}

Storage Metrics:
- LocalStorage: ${this.formatBytes(this.metrics.localStorageSize)}
- IndexedDB: ${this.formatBytes(this.metrics.indexedDBSize)}
- Storage Quota: ${storageUsagePercent}% (${this.formatBytes(this.metrics.storageQuotaUsed)}/${this.formatBytes(this.metrics.storageQuotaLimit)})

Sync Queue Performance:
- Current Depth: ${this.metrics.syncQueueDepth}
- Max Depth: ${this.metrics.syncQueueMaxDepth}
- Completed: ${this.metrics.syncOperationsCompleted}
- Failed: ${this.metrics.syncOperationsFailed}
- Avg Sync Time: ${this.metrics.averageSyncTime.toFixed(0)}ms

Rendering Performance:
- Frame Time: ${this.metrics.renderFrameTime.toFixed(2)}ms
- Total Frames: ${this.metrics.renderFrameCount}
- Dropped Frames: ${this.metrics.droppedFrames}
- Viewport Assets: ${this.metrics.viewportAssetCount}/${this.metrics.totalAssetCount}

Image Processing:
- Images Processed: ${this.metrics.imagesProcessed}
- Avg Processing Time: ${this.metrics.imageProcessingTime.toFixed(0)}ms
- WebP Conversions: ${this.metrics.webpConversions}
- Thumbnails Generated: ${this.metrics.thumbnailGenerations}
- Compression Ratio: ${(this.metrics.imageCompressionRatio * 100).toFixed(1)}%

Alerts:
- Warnings: ${this.metrics.warningsTriggered}
- Critical Alerts: ${this.metrics.criticalAlertsTriggered}
- Performance Degradation Events: ${this.metrics.performanceDegradationEvents}
    `.trim();
  }

  getMetricsSummary(): string {
    const elapsed = (Date.now() - this.metrics.lastResetTime) / 1000 / 60; // minutes
    const storageUsagePercent = this.metrics.storageQuotaLimit > 0 
      ? ((this.metrics.storageQuotaUsed / this.metrics.storageQuotaLimit) * 100).toFixed(1)
      : 'N/A';
    
    return `
Performance Summary (${elapsed.toFixed(1)} minutes):

Basic Metrics:
- Database Requests: ${this.metrics.databaseRequests}
- Auth Requests: ${this.metrics.authRequests}
- Sync Operations: ${this.metrics.syncOperations}
- Book Creations: ${this.metrics.bookCreations}

IO Optimization Metrics:
- Autosave Operations: ${this.metrics.autosaveOperations}
- Manual Save Operations: ${this.metrics.manualSaveOperations}
- Batch Operations: ${this.metrics.batchOperations}
- Deduplicated Requests: ${this.metrics.deduplicatedRequests}
- Cancelled Requests: ${this.metrics.cancelledRequests}

Timing Metrics:
- Average Autosave Time: ${this.metrics.averageAutosaveTime.toFixed(0)}ms
- Average Batch Time: ${this.metrics.averageBatchTime.toFixed(0)}ms
- Slow Operations Count: ${this.metrics.slowOperationsCount}

Storage Metrics:
- LocalStorage Writes: ${this.metrics.localStorageWrites}
- LocalStorage Reads: ${this.metrics.localStorageReads}
- LocalStorage Size: ${(this.metrics.localStorageSize / 1024).toFixed(1)}KB
- Storage Quota Used: ${(this.metrics.storageQuotaUsed / 1024 / 1024).toFixed(1)}MB
- Storage Quota Limit: ${(this.metrics.storageQuotaLimit / 1024 / 1024).toFixed(1)}MB
- Storage Usage: ${storageUsagePercent}%

Rate Limiting Metrics:
- Requests/min: ${this.metrics.requestsPerMinute.toFixed(1)}
- Peak Requests/min: ${this.metrics.peakRequestsPerMinute.toFixed(1)}
- Rate Limit Exceeded: ${this.metrics.rateLimitExceeded}

Rates:
- DB Requests/min: ${(this.metrics.databaseRequests / elapsed).toFixed(1)}
- Auth Requests/min: ${(this.metrics.authRequests / elapsed).toFixed(1)}
- Autosaves/min: ${(this.metrics.autosaveOperations / elapsed).toFixed(1)}
    `.trim();
  }

  reset(): void {
    this.metrics = {
      // Basic operation metrics
      databaseRequests: 0,
      authRequests: 0,
      syncOperations: 0,
      bookCreations: 0,
      lastResetTime: Date.now(),
      
      // IO operation metrics
      autosaveOperations: 0,
      manualSaveOperations: 0,
      batchOperations: 0,
      deduplicatedRequests: 0,
      cancelledRequests: 0,
      
      // Asset operation metrics
      assetOperations: new Map(),
      assetOperationTimes: new Map(),
      
      // Timing metrics
      totalAutosaveTime: 0,
      totalBatchTime: 0,
      averageAutosaveTime: 0,
      averageBatchTime: 0,
      slowOperationsCount: 0,
      
      // Memory metrics
      memoryUsage: 0,
      memoryPeak: 0,
      objectURLCount: 0,
      imageBlobCount: 0,
      memoryLeaksDetected: 0,
      
      // Storage metrics
      localStorageWrites: 0,
      localStorageReads: 0,
      localStorageSize: 0,
      storageQuotaUsed: 0,
      storageQuotaLimit: 0,
      indexedDBSize: 0,
      
      // Sync queue metrics
      syncQueueDepth: 0,
      syncQueueMaxDepth: 0,
      syncOperationsCompleted: 0,
      syncOperationsFailed: 0,
      averageSyncTime: 0,
      
      // Rendering performance metrics
      renderFrameTime: 0,
      renderFrameCount: 0,
      droppedFrames: 0,
      viewportAssetCount: 0,
      totalAssetCount: 0,
      
      // Image processing metrics
      imagesProcessed: 0,
      imageProcessingTime: 0,
      webpConversions: 0,
      thumbnailGenerations: 0,
      imageCompressionRatio: 0,
      
      // Rate limiting metrics
      requestsPerMinute: 0,
      peakRequestsPerMinute: 0,
      rateLimitExceeded: 0,
      
      // Alert metrics
      warningsTriggered: 0,
      criticalAlertsTriggered: 0,
      performanceDegradationEvents: 0,
    };
    console.log('[Performance] Metrics reset');
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
