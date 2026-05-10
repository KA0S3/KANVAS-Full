/**
 * Memory Pressure Monitor
 * 
 * Provides intelligent memory management with LRU cache eviction
 * and memory pressure detection for optimal performance
 */

export enum MemoryPressureLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface MemoryPressureInfo {
  level: MemoryPressureLevel;
  usedMemoryMB: number;
  availableMemoryMB: number;
  totalMemoryMB: number;
  usagePercentage: number;
  recommendations: string[];
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Estimated size in bytes
  key: string;
}

export interface LRUCacheOptions {
  maxSize: number; // Maximum number of entries
  maxMemoryMB: number; // Maximum memory usage in MB
  cleanupInterval: number; // Cleanup interval in ms
  memoryCheckInterval: number; // Memory pressure check interval in ms
  enableMemoryPressure: boolean; // Enable memory pressure monitoring
}

class MemoryPressureMonitor {
  private static instance: MemoryPressureMonitor;
  private currentPressureLevel: MemoryPressureLevel = MemoryPressureLevel.LOW;
  private lastMemoryCheck: number = 0;
  private memoryCheckInterval: number = 30000; // 30 seconds
  private listeners: Set<(pressure: MemoryPressureInfo) => void> = new Set();
  private isMonitoring: boolean = false;

  static getInstance(): MemoryPressureMonitor {
    if (!MemoryPressureMonitor.instance) {
      MemoryPressureMonitor.instance = new MemoryPressureMonitor();
    }
    return MemoryPressureMonitor.instance;
  }

  /**
   * Start memory pressure monitoring
   */
  startMonitoring(options: { interval?: number } = {}): void {
    this.memoryCheckInterval = options.interval || this.memoryCheckInterval;
    
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitorMemoryPressure();
    
    console.log('[MemoryPressure] Started monitoring');
  }

  /**
   * Stop memory pressure monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('[MemoryPressure] Stopped monitoring');
  }

  /**
   * Get current memory pressure information
   */
  async getMemoryPressure(): Promise<MemoryPressureInfo> {
    const memoryInfo = await this.getMemoryInfo();
    const pressureLevel = this.calculatePressureLevel(memoryInfo);
    const recommendations = this.getRecommendations(pressureLevel, memoryInfo);

    return {
      level: pressureLevel,
      ...memoryInfo,
      usagePercentage: memoryInfo.usagePercentage,
      recommendations
    };
  }

  /**
   * Subscribe to memory pressure changes
   */
  subscribe(listener: (pressure: MemoryPressureInfo) => void): () => void {
    this.listeners.add(listener);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Continuous memory pressure monitoring
   */
  private async monitorMemoryPressure(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      const pressure = await this.getMemoryPressure();
      
      // Notify listeners if pressure level changed
      if (pressure.level !== this.currentPressureLevel) {
        this.currentPressureLevel = pressure.level;
        this.notifyListeners(pressure);
      }

      // Schedule next check
      setTimeout(() => this.monitorMemoryPressure(), this.memoryCheckInterval);
    } catch (error) {
      console.error('[MemoryPressure] Error monitoring memory:', error);
      // Continue monitoring even on error
      setTimeout(() => this.monitorMemoryPressure(), this.memoryCheckInterval);
    }
  }

  /**
   * Get memory information from browser APIs
   */
  private async getMemoryInfo(): Promise<{
    usedMemoryMB: number;
    availableMemoryMB: number;
    totalMemoryMB: number;
    usagePercentage: number;
  }> {
    // Try to use performance.memory if available (Chrome)
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const usedJSHeapSize = memory.usedJSHeapSize || 0;
      const totalJSHeapSize = memory.totalJSHeapSize || 0;
      const jsHeapSizeLimit = memory.jsHeapSizeLimit || 0;

      return {
        usedMemoryMB: Math.round(usedJSHeapSize / (1024 * 1024)),
        availableMemoryMB: Math.round((jsHeapSizeLimit - usedJSHeapSize) / (1024 * 1024)),
        totalMemoryMB: Math.round(jsHeapSizeLimit / (1024 * 1024)),
        usagePercentage: (usedJSHeapSize / jsHeapSizeLimit) * 100
      };
    }

    // Fallback: Estimate based on performance timing
    const performanceNow = performance.now();
    const memoryEstimate = this.estimateMemoryUsage();
    
    return {
      usedMemoryMB: memoryEstimate.usedMB,
      availableMemoryMB: Math.max(0, memoryEstimate.totalMB - memoryEstimate.usedMB),
      totalMemoryMB: memoryEstimate.totalMB,
      usagePercentage: (memoryEstimate.usedMB / memoryEstimate.totalMB) * 100
    };
  }

  /**
   * Estimate memory usage when performance.memory is not available
   */
  private estimateMemoryUsage(): { usedMB: number; totalMB: number } {
    // This is a rough estimation for browsers without performance.memory
    // We'll use a combination of heuristics
    const deviceMemory = (navigator as any).deviceMemory;
    const estimatedTotalMB = deviceMemory ? deviceMemory * 1024 : 4096; // Default to 4GB
    
    // Estimate usage based on performance timing and heuristics
    const timing = performance.timing;
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    
    // Simple heuristic: longer load times and more complex pages use more memory
    const complexityFactor = Math.min(1, loadTime / 10000); // Normalize to 0-1
    const estimatedUsedMB = estimatedTotalMB * (0.1 + complexityFactor * 0.4); // 10-50% usage estimate
    
    return {
      usedMB: Math.round(estimatedUsedMB),
      totalMB: Math.round(estimatedTotalMB)
    };
  }

  /**
   * Calculate memory pressure level
   */
  private calculatePressureLevel(memoryInfo: {
    usedMemoryMB: number;
    totalMemoryMB: number;
    usagePercentage: number;
  }): MemoryPressureLevel {
    const { usagePercentage } = memoryInfo;

    if (usagePercentage >= 90) {
      return MemoryPressureLevel.CRITICAL;
    } else if (usagePercentage >= 75) {
      return MemoryPressureLevel.HIGH;
    } else if (usagePercentage >= 60) {
      return MemoryPressureLevel.MEDIUM;
    } else {
      return MemoryPressureLevel.LOW;
    }
  }

  /**
   * Get recommendations based on memory pressure
   */
  private getRecommendations(level: MemoryPressureLevel, memoryInfo: any): string[] {
    const recommendations: string[] = [];

    switch (level) {
      case MemoryPressureLevel.CRITICAL:
        recommendations.push('Immediate cache cleanup required');
        recommendations.push('Consider reducing cache sizes');
        recommendations.push('Close unused browser tabs');
        recommendations.push('Restart application if possible');
        break;
      
      case MemoryPressureLevel.HIGH:
        recommendations.push('Aggressive cache cleanup recommended');
        recommendations.push('Reduce cache sizes');
        recommendations.push('Monitor memory usage closely');
        break;
      
      case MemoryPressureLevel.MEDIUM:
        recommendations.push('Regular cache cleanup recommended');
        recommendations.push('Consider reducing cache sizes');
        break;
      
      case MemoryPressureLevel.LOW:
        recommendations.push('Normal operation');
        break;
    }

    return recommendations;
  }

  /**
   * Notify all listeners of memory pressure changes
   */
  private notifyListeners(pressure: MemoryPressureInfo): void {
    this.listeners.forEach(listener => {
      try {
        listener(pressure);
      } catch (error) {
        console.error('[MemoryPressure] Error in listener:', error);
      }
    });
  }
}

/**
 * LRU Cache with memory pressure awareness
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private options: LRUCacheOptions;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private memoryPressureUnsubscribe: (() => void) | null = null;

  constructor(options: Partial<LRUCacheOptions> = {}) {
    this.options = {
      maxSize: 100,
      maxMemoryMB: 50,
      cleanupInterval: 60000, // 1 minute
      memoryCheckInterval: 30000, // 30 seconds
      enableMemoryPressure: true,
      ...options
    };

    if (this.options.enableMemoryPressure) {
      this.setupMemoryPressureMonitoring();
    }

    this.startCleanupTimer();
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Update access information
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    // Move to end of access order (most recently used)
    this.updateAccessOrder(key);

    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, data: T): void {
    const size = this.estimateSize(data);
    const now = Date.now();

    // Check if we need to evict entries
    this.ensureCapacity(size);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
      size,
      key
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      this.removeFromAccessOrder(key);
    }
    
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    totalMemoryMB: number;
    averageAccessCount: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    if (this.cache.size === 0) {
      return {
        size: 0,
        totalMemoryMB: 0,
        averageAccessCount: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }

    const entries = Array.from(this.cache.values());
    const totalMemory = entries.reduce((sum, entry) => sum + entry.size, 0);
    const totalAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const timestamps = entries.map(entry => entry.timestamp);

    return {
      size: this.cache.size,
      totalMemoryMB: totalMemory / (1024 * 1024),
      averageAccessCount: totalAccessCount / entries.length,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps)
    };
  }

  /**
   * Force cleanup based on memory pressure
   */
  async forceCleanup(): Promise<void> {
    await this.performCleanup();
  }

  /**
   * Setup memory pressure monitoring
   */
  private setupMemoryPressureMonitoring(): void {
    const monitor = MemoryPressureMonitor.getInstance();
    
    this.memoryPressureUnsubscribe = monitor.subscribe((pressure) => {
      this.handleMemoryPressure(pressure);
    });

    monitor.startMonitoring();
  }

  /**
   * Handle memory pressure changes
   */
  private handleMemoryPressure(pressure: MemoryPressureInfo): void {
    switch (pressure.level) {
      case MemoryPressureLevel.CRITICAL:
        // Aggressive cleanup
        this.performAggressiveCleanup();
        break;
      
      case MemoryPressureLevel.HIGH:
        // Standard cleanup with reduced limits
        this.performCleanup({ reduceLimits: true });
        break;
      
      case MemoryPressureLevel.MEDIUM:
        // Standard cleanup
        this.performCleanup();
        break;
    }
  }

  /**
   * Ensure cache has capacity for new entry
   */
  private ensureCapacity(requiredSize: number): void {
    // Check size limit
    while (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }

    // Check memory limit
    const currentMemory = this.getCurrentMemoryUsage();
    const maxMemoryBytes = this.options.maxMemoryMB * 1024 * 1024;
    
    while (currentMemory + requiredSize > maxMemoryBytes && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
  }

  /**
   * Update access order
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Estimate size of data
   */
  private estimateSize(data: T): number {
    try {
      const jsonString = JSON.stringify(data);
      return jsonString.length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default 1KB estimate
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Perform cleanup
   */
  private async performCleanup(options: { reduceLimits?: boolean } = {}): Promise<void> {
    const now = Date.now();
    const ttl = this.options.cleanupInterval * 2; // 2x cleanup interval as TTL
    const maxSize = options.reduceLimits ? this.options.maxSize * 0.7 : this.options.maxSize;
    const maxMemory = options.reduceLimits ? this.options.maxMemoryMB * 0.7 : this.options.maxMemoryMB;

    // Remove expired entries
    const expiredKeys: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    });

    // Enforce size limits
    while (this.cache.size > maxSize) {
      this.evictLRU();
    }

    // Enforce memory limits
    const maxMemoryBytes = maxMemory * 1024 * 1024;
    while (this.getCurrentMemoryUsage() > maxMemoryBytes && this.cache.size > 0) {
      this.evictLRU();
    }

    if (expiredKeys.length > 0) {
      console.log(`[LRUCache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Perform aggressive cleanup for critical memory pressure
   */
  private performAggressiveCleanup(): void {
    // Remove least recently used 50% of entries
    const toRemove = Math.floor(this.cache.size * 0.5);
    
    for (let i = 0; i < toRemove; i++) {
      this.evictLRU();
    }

    console.log(`[LRUCache] Aggressive cleanup: removed ${toRemove} entries`);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.memoryPressureUnsubscribe) {
      this.memoryPressureUnsubscribe();
      this.memoryPressureUnsubscribe = null;
    }

    this.clear();
  }
}

// Export singleton instances
export const memoryPressureMonitor = MemoryPressureMonitor.getInstance();
export const createLRUCache = <T>(options?: Partial<LRUCacheOptions>) => new LRUCache<T>(options);
