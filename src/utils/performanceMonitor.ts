// Enhanced performance monitoring utility for IO optimization
interface PerformanceMetrics {
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
  
  // Timing metrics
  totalAutosaveTime: number;
  totalBatchTime: number;
  averageAutosaveTime: number;
  averageBatchTime: number;
  slowOperationsCount: number;
  
  // Storage metrics
  localStorageWrites: number;
  localStorageReads: number;
  localStorageSize: number;
  storageQuotaUsed: number;
  storageQuotaLimit: number;
  
  // Rate limiting metrics
  requestsPerMinute: number;
  peakRequestsPerMinute: number;
  rateLimitExceeded: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {
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
    
    // Timing metrics
    totalAutosaveTime: 0,
    totalBatchTime: 0,
    averageAutosaveTime: 0,
    averageBatchTime: 0,
    slowOperationsCount: 0,
    
    // Storage metrics
    localStorageWrites: 0,
    localStorageReads: 0,
    localStorageSize: 0,
    storageQuotaUsed: 0,
    storageQuotaLimit: 0,
    
    // Rate limiting metrics
    requestsPerMinute: 0,
    peakRequestsPerMinute: 0,
    rateLimitExceeded: 0,
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

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
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
      
      // Timing metrics
      totalAutosaveTime: 0,
      totalBatchTime: 0,
      averageAutosaveTime: 0,
      averageBatchTime: 0,
      slowOperationsCount: 0,
      
      // Storage metrics
      localStorageWrites: 0,
      localStorageReads: 0,
      localStorageSize: 0,
      storageQuotaUsed: 0,
      storageQuotaLimit: 0,
      
      // Rate limiting metrics
      requestsPerMinute: 0,
      peakRequestsPerMinute: 0,
      rateLimitExceeded: 0,
    };
    console.log('[Performance] Metrics reset');
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
