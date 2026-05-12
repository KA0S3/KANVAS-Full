/**
 * LOW-IO SAVE FREQUENCY MANAGER
 * 
 * Implements aggressive debouncing and batching for persistence operations
 * to minimize database writes while maintaining data integrity.
 * 
 * 🔒 CRITICAL: Must preserve low IO principles from rewrite plan
 */

import { Asset } from '@/types/Asset';

export interface SaveOperation {
  type: 'create' | 'update' | 'delete';
  assetId: string;
  assetData?: Partial<Asset>;
  timestamp: number;
}

export interface LowIOConfig {
  // Debounce intervals (ms)
  dragDebounce: number;        // 250-500ms for dragging
  textDebounce: number;        // 500-1000ms for text editing
  structuralDebounce: number;  // 0ms for immediate persistence
  
  // Batch intervals (ms)
  batchInterval: number;       // 2000-5000ms for background sync
  immediateFlushThreshold: number; // 50ms for destructive ops
  
  // Memory management
  maxPendingOperations: number;
  memoryCleanupInterval: number;
}

/**
 * Low-IO Save Manager with aggressive debouncing
 */
export class LowIOSaveManager {
  private pendingOperations = new Map<string, SaveOperation>();
  private batchTimer: NodeJS.Timeout | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private config: LowIOConfig;
  private isDestroyed = false;
  
  // Performance tracking
  private operationCounts = {
    creates: 0,
    updates: 0,
    deletes: 0,
    batches: 0,
    immediateFlushes: 0
  };

  constructor(config: Partial<LowIOConfig> = {}) {
    this.config = {
      dragDebounce: 350,           // 350ms for dragging operations
      textDebounce: 750,           // 750ms for text editing
      structuralDebounce: 0,       // Immediate for structural changes
      batchInterval: 3000,         // 3s batch interval
      immediateFlushThreshold: 50, // 50ms threshold for immediate ops
      maxPendingOperations: 1000,  // Max operations before forced flush
      memoryCleanupInterval: 30000, // 30s cleanup interval
      ...config
    };

    // Start batch processor
    this.startBatchProcessor();
    
    // Start memory cleanup
    this.startMemoryCleanup();
  }

  /**
   * Queue a save operation with appropriate debouncing
   */
  queueSave(operation: Omit<SaveOperation, 'timestamp'>, operationType: 'drag' | 'text' | 'structural' = 'structural'): void {
    if (this.isDestroyed) return;

    const saveOp: SaveOperation = {
      ...operation,
      timestamp: Date.now()
    };

    // Clear existing debounce timer for this asset
    const existingTimer = this.debounceTimers.get(operation.assetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(operation.assetId);
    }

    // Determine debounce interval based on operation type
    let debounceMs = this.config.structuralDebounce;
    switch (operationType) {
      case 'drag':
        debounceMs = this.config.dragDebounce;
        break;
      case 'text':
        debounceMs = this.config.textDebounce;
        break;
      case 'structural':
        debounceMs = this.config.structuralDebounce;
        break;
    }

    // Track operation counts
    this.operationCounts[operation.type === 'create' ? 'creates' : 
                        operation.type === 'update' ? 'updates' : 'deletes']++;

    if (debounceMs === 0) {
      // Immediate persistence for structural changes
      this.persistOperation(saveOp);
      this.operationCounts.immediateFlushes++;
    } else {
      // Debounced persistence
      const timer = setTimeout(() => {
        this.persistOperation(saveOp);
        this.debounceTimers.delete(operation.assetId);
      }, debounceMs);
      
      this.debounceTimers.set(operation.assetId, timer);
    }

    // Check if we need to force flush due to too many pending operations
    if (this.pendingOperations.size >= this.config.maxPendingOperations) {
      this.flushAllOperations();
    }
  }

  /**
   * Persist a single operation to IndexedDB
   */
  private async persistOperation(operation: SaveOperation): Promise<void> {
    if (this.isDestroyed) return;

    try {
      const startTime = performance.now();
      
      // Store in pending operations for sync queue
      this.pendingOperations.set(operation.assetId, operation);

      // Persist to IndexedDB based on operation type
      switch (operation.type) {
        case 'create':
          await this.persistCreate(operation);
          break;
        case 'update':
          await this.persistUpdate(operation);
          break;
        case 'delete':
          await this.persistDelete(operation);
          break;
      }

      const duration = performance.now() - startTime;
      
      // Log performance warnings
      if (duration > this.config.immediateFlushThreshold) {
        console.warn(`Slow persistence operation: ${duration.toFixed(2)}ms for ${operation.type} ${operation.assetId}`);
      }

    } catch (error) {
      console.error('Failed to persist operation:', error);
      // Could implement retry logic here
    }
  }

  /**
   * Persist create operation
   */
  private async persistCreate(operation: SaveOperation): Promise<void> {
    if (!operation.assetData) {
      throw new Error('Create operation requires asset data');
    }

    // In a real implementation, this would use Dexie or similar
    // For now, we'll simulate the IndexedDB operation
    console.log('Creating asset:', operation.assetId, operation.assetData);
  }

  /**
   * Persist update operation
   */
  private async persistUpdate(operation: SaveOperation): Promise<void> {
    if (!operation.assetData) {
      throw new Error('Update operation requires asset data');
    }

    // In a real implementation, this would use Dexie or similar
    console.log('Updating asset:', operation.assetId, operation.assetData);
  }

  /**
   * Persist delete operation
   */
  private async persistDelete(operation: SaveOperation): Promise<void> {
    // In a real implementation, this would use Dexie or similar
    console.log('Deleting asset:', operation.assetId);
  }

  /**
   * Start the batch processor for background sync
   */
  private startBatchProcessor(): void {
    if (this.isDestroyed) return;

    this.batchTimer = setInterval(() => {
      if (this.pendingOperations.size > 0) {
        this.processBatch();
      }
    }, this.config.batchInterval);
  }

  /**
   * Process a batch of pending operations for sync
   */
  private async processBatch(): Promise<void> {
    if (this.isDestroyed || this.pendingOperations.size === 0) return;

    this.operationCounts.batches++;

    const operations = Array.from(this.pendingOperations.values());
    const batchSize = operations.length;

    try {
      // Process operations in order (FIFO)
      for (const operation of operations) {
        // Add to sync queue for background upload
        await this.addToSyncQueue(operation);
        this.pendingOperations.delete(operation.assetId);
      }

      console.log(`Processed batch of ${batchSize} operations for sync`);

    } catch (error) {
      console.error('Batch processing failed:', error);
      // Operations remain in pending queue for retry
    }
  }

  /**
   * Add operation to sync queue for background upload
   */
  private async addToSyncQueue(operation: SaveOperation): Promise<void> {
    // In a real implementation, this would add to a sync queue table
    console.log('Added to sync queue:', operation.assetId, operation.type);
  }

  /**
   * Force immediate flush of all pending operations
   */
  async flushAllOperations(): Promise<void> {
    if (this.isDestroyed) return;

    console.log(`Force flushing ${this.pendingOperations.size} operations`);

    // Clear all debounce timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Process all pending operations immediately
    const operations = Array.from(this.pendingOperations.values());
    
    for (const operation of operations) {
      await this.persistOperation(operation);
      this.pendingOperations.delete(operation.assetId);
    }

    this.operationCounts.immediateFlushes++;
  }

  /**
   * Start memory cleanup process
   */
  private startMemoryCleanup(): void {
    if (this.isDestroyed) return;

    setInterval(() => {
      this.cleanupMemory();
    }, this.config.memoryCleanupInterval);
  }

  /**
   * Clean up memory and prevent leaks
   */
  private cleanupMemory(): void {
    if (this.isDestroyed) return;

    const now = Date.now();
    const maxAge = 60000; // 1 minute max age for pending operations

    // Remove old pending operations
    for (const [assetId, operation] of this.pendingOperations) {
      if (now - operation.timestamp > maxAge) {
        console.warn(`Removing stale operation for ${assetId}`);
        this.pendingOperations.delete(assetId);
      }
    }

    // Clear orphaned debounce timers
    for (const [assetId, timer] of this.debounceTimers) {
      if (!this.pendingOperations.has(assetId)) {
        clearTimeout(timer);
        this.debounceTimers.delete(assetId);
      }
    }

    console.log(`Memory cleanup: ${this.pendingOperations.size} pending, ${this.debounceTimers.size} timers`);
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    pendingOperations: number;
    debounceTimers: number;
    operationCounts: typeof this.operationCounts;
    config: LowIOConfig;
  } {
    return {
      pendingOperations: this.pendingOperations.size,
      debounceTimers: this.debounceTimers.size,
      operationCounts: { ...this.operationCounts },
      config: { ...this.config }
    };
  }

  /**
   * Handle page unload to flush critical operations
   */
  handlePageUnload(): void {
    if (this.isDestroyed) return;

    // Clear debounce timers and flush immediately
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Only flush structural operations (creates/deletes)
    const criticalOps = Array.from(this.pendingOperations.values())
      .filter(op => op.type !== 'update');

    if (criticalOps.length > 0) {
      console.log(`Page unload: flushing ${criticalOps.length} critical operations`);
      // Use sendBeacon or similar for reliable unload persistence
    }
  }

  /**
   * Destroy the save manager and clean up resources
   */
  destroy(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // Clear all timers
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Flush remaining operations
    this.flushAllOperations();
  }
}

// Export singleton instance
export const lowIOSaveManager = new LowIOSaveManager();

// Set up page unload handler
window.addEventListener('beforeunload', () => {
  lowIOSaveManager.handlePageUnload();
});

// Set up visibility change handler for app background
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lowIOSaveManager.flushAllOperations();
  }
});
