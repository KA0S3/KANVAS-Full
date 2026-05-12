/**
 * OBJECT URL MEMORY MANAGER
 * 
 * Prevents memory leaks from object URLs by tracking and automatically
 * cleaning up blob URLs that are no longer needed.
 * 
 * 🔒 CRITICAL: Memory leak prevention is essential for large image handling
 */

export interface ObjectURLInfo {
  url: string;
  assetId: string;
  createdAt: number;
  size?: number;
  type?: string;
  isTemporary?: boolean;
}

export interface ObjectURLConfig {
  maxAge: number;           // Max age before automatic cleanup (ms)
  maxConcurrentURLs: number; // Max concurrent URLs per asset
  cleanupInterval: number;   // Cleanup check interval (ms)
  memoryThreshold: number;   // Memory threshold for aggressive cleanup (bytes)
  enableMonitoring: boolean;  // Enable performance monitoring
}

/**
 * Object URL Memory Manager with automatic cleanup
 */
export class ObjectURLManager {
  private trackedURLs = new Map<string, ObjectURLInfo>();
  private assetURLs = new Map<string, Set<string>>(); // assetId -> URLs
  private cleanupTimer: NodeJS.Timeout | null = null;
  private config: ObjectURLConfig;
  private isDestroyed = false;

  // Performance tracking
  private stats = {
    created: 0,
    revoked: 0,
    active: 0,
    memoryUsage: 0,
    cleanupRuns: 0,
    warnings: 0
  };

  constructor(config: Partial<ObjectURLConfig> = {}) {
    this.config = {
      maxAge: 30000,              // 30 seconds max age
      maxConcurrentURLs: 3,      // Max 3 URLs per asset
      cleanupInterval: 10000,    // Check every 10 seconds
      memoryThreshold: 100 * 1024 * 1024, // 100MB threshold
      enableMonitoring: true,
      ...config
    };

    // Start automatic cleanup
    this.startCleanupTimer();
    
    // Set up page unload cleanup
    this.setupPageUnloadCleanup();
    
    // Set up memory monitoring
    if (this.config.enableMonitoring) {
      this.startMemoryMonitoring();
    }
  }

  /**
   * Create and track an object URL
   */
  createObjectURL(blob: Blob, assetId: string, options: {
    isTemporary?: boolean;
    maxSize?: number;
  } = {}): string {
    if (this.isDestroyed) {
      throw new Error('ObjectURLManager has been destroyed');
    }

    // Check if we've exceeded concurrent URL limit for this asset
    const assetURLSet = this.assetURLs.get(assetId) || new Set();
    if (assetURLSet.size >= this.config.maxConcurrentURLs) {
      // Clean up oldest URL for this asset
      const oldestURL = this.getOldestURLForAsset(assetId);
      if (oldestURL) {
        this.revokeObjectURL(oldestURL);
      }
    }

    // Check blob size if provided
    if (options.maxSize && blob.size > options.maxSize) {
      console.warn(`Blob size ${blob.size} exceeds max size ${options.maxSize}`);
    }

    // Create the object URL
    const url = URL.createObjectURL(blob);
    const urlInfo: ObjectURLInfo = {
      url,
      assetId,
      createdAt: Date.now(),
      size: blob.size,
      type: blob.type,
      isTemporary: options.isTemporary || false
    };

    // Track the URL
    this.trackedURLs.set(url, urlInfo);
    
    // Track by asset
    if (!this.assetURLs.has(assetId)) {
      this.assetURLs.set(assetId, new Set());
    }
    this.assetURLs.get(assetId)!.add(url);

    // Update stats
    this.stats.created++;
    this.stats.active++;
    this.stats.memoryUsage += blob.size || 0;

    // Log if we're approaching memory threshold
    if (this.stats.memoryUsage > this.config.memoryThreshold) {
      this.stats.warnings++;
      console.warn(`Object URL memory usage (${this.formatBytes(this.stats.memoryUsage)}) exceeds threshold (${this.formatBytes(this.config.memoryThreshold)})`);
      this.aggressiveCleanup();
    }

    return url;
  }

  /**
   * Manually revoke an object URL
   */
  revokeObjectURL(url: string): boolean {
    const urlInfo = this.trackedURLs.get(url);
    if (!urlInfo) {
      return false; // URL not tracked
    }

    try {
      // Revoke the URL
      URL.revokeObjectURL(url);

      // Remove from tracking
      this.trackedURLs.delete(url);
      
      // Remove from asset tracking
      const assetURLSet = this.assetURLs.get(urlInfo.assetId);
      if (assetURLSet) {
        assetURLSet.delete(url);
        if (assetURLSet.size === 0) {
          this.assetURLs.delete(urlInfo.assetId);
        }
      }

      // Update stats
      this.stats.revoked++;
      this.stats.active--;
      this.stats.memoryUsage -= urlInfo.size || 0;

      return true;
    } catch (error) {
      console.error('Failed to revoke object URL:', error);
      return false;
    }
  }

  /**
   * Revoke all URLs for a specific asset
   */
  revokeAssetURLs(assetId: string): number {
    const assetURLSet = this.assetURLs.get(assetId);
    if (!assetURLSet) {
      return 0;
    }

    let revokedCount = 0;
    const urls = Array.from(assetURLSet);
    
    for (const url of urls) {
      if (this.revokeObjectURL(url)) {
        revokedCount++;
      }
    }

    console.log(`Revoked ${revokedCount} URLs for asset ${assetId}`);
    return revokedCount;
  }

  /**
   * Get the oldest URL for an asset
   */
  private getOldestURLForAsset(assetId: string): string | null {
    const assetURLSet = this.assetURLs.get(assetId);
    if (!assetURLSet || assetURLSet.size === 0) {
      return null;
    }

    let oldestURL: string | null = null;
    let oldestTime = Date.now();

    for (const url of assetURLSet) {
      const urlInfo = this.trackedURLs.get(url);
      if (urlInfo && urlInfo.createdAt < oldestTime) {
        oldestTime = urlInfo.createdAt;
        oldestURL = url;
      }
    }

    return oldestURL;
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.isDestroyed) return;

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Perform automatic cleanup of old URLs
   */
  private performCleanup(): void {
    if (this.isDestroyed) return;

    this.stats.cleanupRuns++;
    const now = Date.now();
    const urlsToRevoke: string[] = [];

    // Find URLs that need cleanup
    for (const [url, urlInfo] of this.trackedURLs) {
      const age = now - urlInfo.createdAt;
      
      // Clean up old URLs
      if (age > this.config.maxAge) {
        urlsToRevoke.push(url);
      }
      
      // Clean up temporary URLs more aggressively
      if (urlInfo.isTemporary && age > this.config.maxAge / 3) {
        urlsToRevoke.push(url);
      }
    }

    // Revoke old URLs
    let revokedCount = 0;
    for (const url of urlsToRevoke) {
      if (this.revokeObjectURL(url)) {
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      console.log(`Cleanup: revoked ${revokedCount} old object URLs`);
    }
  }

  /**
   * Aggressive cleanup when memory threshold is exceeded
   */
  private aggressiveCleanup(): void {
    const now = Date.now();
    const urlsToRevoke: string[] = [];

    // Prioritize cleanup of:
    // 1. Temporary URLs
    // 2. Oldest URLs
    // 3. Large URLs
    
    const sortedURLs = Array.from(this.trackedURLs.entries())
      .sort(([, a], [, b]) => {
        // Temporary URLs first
        if (a.isTemporary && !b.isTemporary) return -1;
        if (!a.isTemporary && b.isTemporary) return 1;
        
        // Then by age (oldest first)
        return a.createdAt - b.createdAt;
      });

    // Revoke URLs until we're under the threshold
    let targetReduction = this.stats.memoryUsage - (this.config.memoryThreshold * 0.7); // Reduce to 70% of threshold
    
    for (const [url, urlInfo] of sortedURLs) {
      if (targetReduction <= 0) break;
      
      urlsToRevoke.push(url);
      targetReduction -= urlInfo.size || 0;
    }

    // Revoke the URLs
    let revokedCount = 0;
    for (const url of urlsToRevoke) {
      if (this.revokeObjectURL(url)) {
        revokedCount++;
      }
    }

    console.warn(`Aggressive cleanup: revoked ${revokedCount} URLs to reduce memory usage`);
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (this.isDestroyed) return;

    setInterval(() => {
      this.checkMemoryHealth();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check memory health and log warnings
   */
  private checkMemoryHealth(): void {
    if (this.isDestroyed) return;

    const memoryUsage = this.stats.memoryUsage;
    const activeURLs = this.stats.active;

    // Log memory usage warnings
    if (memoryUsage > this.config.memoryThreshold * 0.8) {
      console.warn(`High object URL memory usage: ${this.formatBytes(memoryUsage)} with ${activeURLs} active URLs`);
    }

    // Log if we have too many active URLs
    if (activeURLs > 100) {
      console.warn(`High number of active object URLs: ${activeURLs}`);
    }

    // Log performance stats periodically
    if (this.stats.cleanupRuns % 10 === 0) {
      console.log('Object URL Manager Stats:', this.getStats());
    }
  }

  /**
   * Set up page unload cleanup
   */
  private setupPageUnloadCleanup(): void {
    window.addEventListener('beforeunload', () => {
      this.cleanupAll();
    });

    // Also clean up on page visibility change (tab background)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Clean up temporary URLs when tab goes to background
        this.cleanupTemporaryURLs();
      }
    });
  }

  /**
   * Clean up all temporary URLs
   */
  private cleanupTemporaryURLs(): void {
    const temporaryURLs: string[] = [];
    
    for (const [url, urlInfo] of this.trackedURLs) {
      if (urlInfo.isTemporary) {
        temporaryURLs.push(url);
      }
    }

    let revokedCount = 0;
    for (const url of temporaryURLs) {
      if (this.revokeObjectURL(url)) {
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      console.log(`Background cleanup: revoked ${revokedCount} temporary URLs`);
    }
  }

  /**
   * Clean up all tracked URLs
   */
  cleanupAll(): void {
    const urls = Array.from(this.trackedURLs.keys());
    let revokedCount = 0;

    for (const url of urls) {
      if (this.revokeObjectURL(url)) {
        revokedCount++;
      }
    }

    console.log(`Full cleanup: revoked ${revokedCount} URLs`);
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    active: number;
    created: number;
    revoked: number;
    memoryUsage: string;
    cleanupRuns: number;
    warnings: number;
    config: ObjectURLConfig;
  } {
    return {
      active: this.stats.active,
      created: this.stats.created,
      revoked: this.stats.revoked,
      memoryUsage: this.formatBytes(this.stats.memoryUsage),
      cleanupRuns: this.stats.cleanupRuns,
      warnings: this.stats.warnings,
      config: { ...this.config }
    };
  }

  /**
   * Get URLs for a specific asset
   */
  getAssetURLs(assetId: string): string[] {
    const assetURLSet = this.assetURLs.get(assetId);
    return assetURLSet ? Array.from(assetURLSet) : [];
  }

  /**
   * Check if a URL is being tracked
   */
  isTracked(url: string): boolean {
    return this.trackedURLs.has(url);
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
   * Destroy the manager and clean up all resources
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clean up all URLs
    this.cleanupAll();

    // Clear tracking maps
    this.trackedURLs.clear();
    this.assetURLs.clear();
  }
}

// Export singleton instance
export const objectURLManager = new ObjectURLManager();
