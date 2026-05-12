/**
 * DEBOUNCED PERSISTENCE - Low-IO Save Rules
 * 
 * Implements intelligent debouncing and batching for persistence operations.
 * Follows aggressive low-IO principles for optimal performance.
 * 
 * 🔒 CRITICAL: Minimize database reads/writes ruthlessly
 */

import { Asset } from '@/types/Asset';
import { db } from '@/storage/indexeddb';
import { useSyncStore } from '@/stores/syncStore';

export interface PersistenceConfig {
  // Debounce delays (milliseconds)
  dragDebounceMs: number;
  textDebounceMs: number;
  resizeDebounceMs: number;
  
  // Batch settings
  maxBatchSize: number;
  batchIntervalMs: number;
  
  // Immediate operations (no debounce)
  immediateOperations: Set<string>;
}

export interface QueuedOperation {
  type: 'create' | 'update' | 'delete';
  assetId: string;
  projectId: string;
  data?: Partial<Asset>;
  timestamp: number;
  priority: 'immediate' | 'normal' | 'low';
}

/**
 * Debounced persistence manager for optimal IO
 */
export class DebouncedPersistence {
  private config: PersistenceConfig;
  private operationQueue = new Map<string, QueuedOperation>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private batchProcessorTimer: NodeJS.Timeout | null = null;
  
  // Performance tracking
  private stats = {
    operationsQueued: 0,
    operationsBatched: 0,
    operationsImmediate: 0,
    ioOperationsSaved: 0,
  };

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = {
      dragDebounceMs: 250,      // Fast drag updates
      textDebounceMs: 1000,      // Slower text updates
      resizeDebounceMs: 500,     // Medium resize updates
      maxBatchSize: 10,           // Batch up to 10 operations
      batchIntervalMs: 2000,      // Process batches every 2s
      immediateOperations: new Set([
        'create',    // Asset creation - immediate
        'delete',    // Asset deletion - immediate
        'reparent',  // Asset reparenting - immediate
        'fileUpload' // File uploads - immediate
      ]),
      ...config,
    };

    // Setup batch processor
    this.startBatchProcessor();
    
    // Setup cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushAll();
      });
      
      // Setup visibility API for tab switching
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.flushAll();
        }
      });
    }
  }

  /**
   * Queue asset creation (immediate)
   */
  async createAsset(asset: Asset): Promise<void> {
    const operation: QueuedOperation = {
      type: 'create',
      assetId: asset.id,
      projectId: asset.projectId,
      data: asset,
      timestamp: Date.now(),
      priority: 'immediate',
    };

    this.operationQueue.set(asset.id, operation);
    this.stats.operationsQueued++;
    this.stats.operationsImmediate++;

    // Immediate persistence for creation
    await this.executeOperation(operation);
    this.operationQueue.delete(asset.id);
  }

  /**
   * Queue asset update with intelligent debouncing
   */
  updateAsset(
    assetId: string, 
    projectId: string, 
    updates: Partial<Asset>,
    updateType: 'drag' | 'text' | 'resize' | 'style' | 'general' = 'general'
  ): void {
    const existing = this.operationQueue.get(assetId);
    
    // Merge with existing operation if present
    if (existing && existing.type === 'update') {
      existing.data = { ...existing.data, ...updates };
      existing.timestamp = Date.now();
      return;
    }

    const operation: QueuedOperation = {
      type: 'update',
      assetId,
      projectId,
      data: updates,
      timestamp: Date.now(),
      priority: this.getPriority(updateType),
    };

    this.operationQueue.set(assetId, operation);
    this.stats.operationsQueued++;

    // Handle based on priority
    if (operation.priority === 'immediate') {
      this.executeOperation(operation);
      this.operationQueue.delete(assetId);
      this.stats.operationsImmediate++;
    } else {
      this.scheduleDebouncedExecution(assetId, updateType);
    }
  }

  /**
   * Queue asset deletion (immediate)
   */
  async deleteAsset(assetId: string, projectId: string): Promise<void> {
    const operation: QueuedOperation = {
      type: 'delete',
      assetId,
      projectId,
      timestamp: Date.now(),
      priority: 'immediate',
    };

    this.operationQueue.set(assetId, operation);
    this.stats.operationsQueued++;
    this.stats.operationsImmediate++;

    // Immediate persistence for deletion
    await this.executeOperation(operation);
    this.operationQueue.delete(assetId);
  }

  /**
   * Queue multiple asset updates (bulk operations)
   */
  bulkUpdateAssets(updates: Array<{
    assetId: string;
    projectId: string;
    data: Partial<Asset>;
  }>): void {
    for (const update of updates) {
      this.updateAsset(update.assetId, update.projectId, update.data, 'drag');
    }
    
    // Force immediate batch processing for bulk operations
    this.processBatch();
  }

  /**
   * Get priority for update type
   */
  private getPriority(updateType: string): 'immediate' | 'normal' | 'low' {
    if (this.config.immediateOperations.has(updateType)) {
      return 'immediate';
    }
    
    switch (updateType) {
      case 'drag':
        return 'low';      // High frequency, low priority
      case 'text':
        return 'normal';   // Medium frequency, medium priority
      case 'resize':
        return 'normal';   // Medium frequency, medium priority
      case 'style':
        return 'low';      // Low frequency, low priority
      default:
        return 'normal';
    }
  }

  /**
   * Schedule debounced execution
   */
  private scheduleDebouncedExecution(assetId: string, updateType: string): void {
    // Clear existing timer for this asset
    const existingTimer = this.debounceTimers.get(assetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.stats.ioOperationsSaved++;
    }

    // Get debounce delay based on update type
    let delayMs: number;
    switch (updateType) {
      case 'drag':
        delayMs = this.config.dragDebounceMs;
        break;
      case 'text':
        delayMs = this.config.textDebounceMs;
        break;
      case 'resize':
        delayMs = this.config.resizeDebounceMs;
        break;
      default:
        delayMs = this.config.textDebounceMs;
        break;
    }

    // Schedule new timer
    const timer = setTimeout(() => {
      const operation = this.operationQueue.get(assetId);
      if (operation) {
        this.executeOperation(operation);
        this.operationQueue.delete(assetId);
      }
      this.debounceTimers.delete(assetId);
    }, delayMs);

    this.debounceTimers.set(assetId, timer);
  }

  /**
   * Execute single operation
   */
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    try {
      switch (operation.type) {
        case 'create':
          if (operation.data) {
            await db.createAsset(operation.data as Asset);
            useSyncStore.getState().markForSync(operation.assetId, 'create', operation.projectId);
          }
          break;

        case 'update':
          if (operation.data) {
            await db.updateAsset(operation.assetId, operation.data);
            useSyncStore.getState().markForSync(operation.assetId, 'update', operation.projectId);
          }
          break;

        case 'delete':
          await db.deleteAsset(operation.assetId, operation.projectId);
          useSyncStore.getState().markForSync(operation.assetId, 'delete', operation.projectId);
          break;
      }
    } catch (error) {
      console.error('Failed to execute persistence operation:', error);
      // Re-queue for retry
      if (operation.priority !== 'immediate') {
        setTimeout(() => {
          this.scheduleDebouncedExecution(operation.assetId, 'general');
        }, 1000);
      }
    }
  }

  /**
   * Start batch processor
   */
  private startBatchProcessor(): void {
    this.batchProcessorTimer = setInterval(() => {
      this.processBatch();
    }, this.config.batchIntervalMs);
  }

  /**
   * Process batch of normal/low priority operations
   */
  private async processBatch(): Promise<void> {
    const operations = Array.from(this.operationQueue.values())
      .filter(op => op.priority !== 'immediate')
      .sort((a, b) => {
        // Sort by priority first, then by timestamp
        const priorityOrder = { immediate: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      })
      .slice(0, this.config.maxBatchSize);

    if (operations.length === 0) {
      return;
    }

    try {
      // Execute operations in a single transaction
      await db.transaction('rw', db.assets, async () => {
        for (const operation of operations) {
          await this.executeOperation(operation);
          this.operationQueue.delete(operation.assetId);
          this.stats.operationsBatched++;
        }
      });
    } catch (error) {
      console.error('Batch operation failed:', error);
      // Operations will be retried individually on next cycle
    }
  }

  /**
   * Flush all operations immediately
   */
  async flushAll(): Promise<void> {
    console.log('Flushing all persistence operations...');
    
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Execute all remaining operations
    const operations = Array.from(this.operationQueue.values());
    
    try {
      await db.transaction('rw', db.assets, async () => {
        for (const operation of operations) {
          await this.executeOperation(operation);
          this.operationQueue.delete(operation.assetId);
        }
      });
    } catch (error) {
      console.error('Flush operations failed:', error);
    }

    console.log(`Flushed ${operations.length} operations`);
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    queued: number;
    batched: number;
    immediate: number;
    ioSaved: number;
    queueSize: number;
  } {
    return {
      queued: this.stats.operationsQueued,
      batched: this.stats.operationsBatched,
      immediate: this.stats.operationsImmediate,
      ioSaved: this.stats.ioOperationsSaved,
      queueSize: this.operationQueue.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      operationsQueued: 0,
      operationsBatched: 0,
      operationsImmediate: 0,
      ioOperationsSaved: 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PersistenceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart batch processor if interval changed
    if (newConfig.batchIntervalMs && this.batchProcessorTimer) {
      clearInterval(this.batchProcessorTimer);
      this.startBatchProcessor();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();

    if (this.batchProcessorTimer) {
      clearInterval(this.batchProcessorTimer);
      this.batchProcessorTimer = null;
    }

    // Clear queue
    this.operationQueue.clear();
  }
}

// Export singleton instance
export const debouncedPersistence = new DebouncedPersistence();
