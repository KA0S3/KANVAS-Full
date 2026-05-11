import { documentMutationService } from './DocumentMutationService';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import type { Asset } from '@/types/assetInterfaces';
import type { BackgroundConfig } from '@/types/background';

// Sync operation types for coordinated updates
export type SyncOperationType = 
  | 'asset_change'
  | 'asset_position'
  | 'asset_background'
  | 'background_config'
  | 'viewport_change'
  | 'global_tags'
  | 'global_custom_fields';

interface SyncOperation {
  id: string;
  type: SyncOperationType;
  assetId?: string;
  data: any;
  timestamp: number;
  priority: 'high' | 'medium' | 'low';
}

interface StoreCoordinatorConfig {
  // Debounce timing per operation type (preserves existing behavior)
  backgroundConfigDebounceMs: number; // 500ms - preserve responsive background updates
  positionThrottleMs: number; // 2000ms - preserve current position throttling
  assetMetadataDebounceMs: number; // 40000ms - preserve low IO principle
  viewportDebounceMs: number; // 500ms - responsive viewport updates
  globalDataDebounceMs: number; // 40000ms - low IO for global data
}

class StoreCoordinator {
  private static instance: StoreCoordinator | null = null;
  private syncQueue: Map<string, SyncOperation> = new Map();
  private debounceTimers: Map<string, number> = new Map(); // Use string keys for batch operations
  private throttleTimers: Map<string, number> = new Map();
  private isProcessing: boolean = false;
  private config: StoreCoordinatorConfig;
  
  // Sync cooldown mechanism to prevent duplicate sync calls
  private lastSyncTimes: Map<string, number> = new Map();
  private readonly SYNC_COOLDOWN_MS = 5000; // 5 seconds cooldown between identical syncs

  // Configuration preserving current timing behavior
  private readonly defaultConfig: StoreCoordinatorConfig = {
    backgroundConfigDebounceMs: 500, // From backgroundStore.ts
    positionThrottleMs: 2000, // From DocumentMutationService POSITION_SAVE_THROTTLE
    assetMetadataDebounceMs: 40000, // From DocumentMutationService AUTO_SAVE_MS
    viewportDebounceMs: 500, // Responsive viewport updates
    globalDataDebounceMs: 40000, // Low IO for global data
  };

  private constructor(config?: Partial<StoreCoordinatorConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    console.log('[StoreCoordinator] Initialized with config:', this.config);
  }

  public static getInstance(config?: Partial<StoreCoordinatorConfig>): StoreCoordinator {
    if (!StoreCoordinator.instance) {
      StoreCoordinator.instance = new StoreCoordinator(config);
    }
    return StoreCoordinator.instance;
  }

  private static ensureInstance(): StoreCoordinator {
    if (!StoreCoordinator.instance) {
      StoreCoordinator.instance = StoreCoordinator.getInstance();
    }
    return StoreCoordinator.instance;
  }

  /**
   * Queue a sync operation with appropriate debouncing/throttling
   */
  public queueSyncOperation(operation: Omit<SyncOperation, 'id' | 'timestamp'>): void {
    const id = this.generateOperationId(operation);
    const syncOp: SyncOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
    };

    // Handle different timing strategies based on operation type
    switch (operation.type) {
      case 'asset_position':
        this.handleThrottledOperation(syncOp);
        break;
      case 'background_config':
      case 'viewport_change':
        this.handleDebouncedOperation(syncOp);
        break;
      case 'asset_change':
      case 'global_tags':
      case 'global_custom_fields':
        this.handleBatchedOperation(syncOp);
        break;
      default:
        this.handleImmediateOperation(syncOp);
    }
  }

  /**
   * Handle throttled operations (position changes)
   */
  private handleThrottledOperation(operation: SyncOperation): void {
    const key = `${operation.type}_${operation.assetId}`;
    
    // Clear existing throttle timer
    if (this.throttleTimers.has(key)) {
      clearTimeout(this.throttleTimers.get(key)!);
    }

    // Set new throttle timer
    this.throttleTimers.set(key, window.setTimeout(() => {
      this.syncQueue.set(operation.id, operation);
      this.processSyncQueue();
      this.throttleTimers.delete(key);
    }, this.config.positionThrottleMs));
  }

  /**
   * Handle debounced operations (background, viewport)
   */
  private handleDebouncedOperation(operation: SyncOperation): void {
    // Clear existing debounce timer for this operation type
    const opTypeKey = operation.type as string;
    if (this.debounceTimers.has(opTypeKey)) {
      clearTimeout(this.debounceTimers.get(opTypeKey)!);
    }

    // Replace existing operation in queue with new data
    this.syncQueue.set(operation.id, operation);

    // Set new debounce timer
    const debounceMs = operation.type === 'background_config' 
      ? this.config.backgroundConfigDebounceMs 
      : this.config.viewportDebounceMs;

    this.debounceTimers.set(opTypeKey, window.setTimeout(() => {
      this.processSyncQueue();
      this.debounceTimers.delete(opTypeKey);
    }, debounceMs));
  }

  /**
   * Handle batched operations (asset metadata, global data)
   */
  private handleBatchedOperation(operation: SyncOperation): void {
    // Add to queue immediately, but process with debounce
    this.syncQueue.set(operation.id, operation);

    // Clear existing timer for batched operations
    const batchKey = `batch_${operation.type}`;
    if (this.debounceTimers.has(batchKey)) {
      clearTimeout(this.debounceTimers.get(batchKey)!);
    }

    // Set batch processing timer
    const batchMs = operation.type === 'asset_change' 
      ? this.config.assetMetadataDebounceMs 
      : this.config.globalDataDebounceMs;

    this.debounceTimers.set(batchKey, window.setTimeout(() => {
      this.processSyncQueue();
      this.debounceTimers.delete(batchKey);
    }, batchMs));
  }

  /**
   * Handle immediate operations (high priority)
   */
  private handleImmediateOperation(operation: SyncOperation): void {
    this.syncQueue.set(operation.id, operation);
    this.processSyncQueue();
  }

  /**
   * Process the sync queue and coordinate updates across stores
   */
  private async processSyncQueue(): Promise<void> {
    if (this.isProcessing) {
      return; // Prevent concurrent processing
    }

    // Check cooldown for each operation type to prevent duplicate syncs
    const now = Date.now();
    const operationsToProcess: SyncOperation[] = [];
    
    for (const [id, operation] of this.syncQueue) {
      const cooldownKey = `${operation.type}_${operation.assetId || 'global'}`;
      const lastSyncTime = this.lastSyncTimes.get(cooldownKey) || 0;
      
      // Allow high-priority operations to bypass cooldown
      if (operation.priority === 'high' || now - lastSyncTime >= this.SYNC_COOLDOWN_MS) {
        operationsToProcess.push(operation);
        this.lastSyncTimes.set(cooldownKey, now);
      } else {
        console.log(`[StoreCoordinator] Skipping ${operation.type} due to cooldown (${Math.round((this.SYNC_COOLDOWN_MS - (now - lastSyncTime)) / 1000)}s remaining)`);
      }
    }

    if (operationsToProcess.length === 0) {
      return; // Nothing to process
    }

    this.isProcessing = true;
    console.log(`[StoreCoordinator] Processing ${operationsToProcess.length} sync operations (${this.syncQueue.size - operationsToProcess.length} skipped by cooldown)`);

    try {
      // Remove only the operations we're processing from the queue
      operationsToProcess.forEach(op => this.syncQueue.delete(op.id));

      // Group operations by type for coordinated processing
      const groupedOps = this.groupOperationsByType(operationsToProcess);

      // Process each group in priority order
      await this.processOperationGroups(groupedOps);

    } catch (error) {
      console.error('[StoreCoordinator] Error processing sync queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Group operations by type for coordinated processing
   */
  private groupOperationsByType(operations: SyncOperation[]): Map<SyncOperationType, SyncOperation[]> {
    const groups = new Map<SyncOperationType, SyncOperation[]>();

    operations.forEach(op => {
      if (!groups.has(op.type)) {
        groups.set(op.type, []);
      }
      groups.get(op.type)!.push(op);
    });

    return groups;
  }

  /**
   * Process grouped operations in the correct order
   */
  private async processOperationGroups(groups: Map<SyncOperationType, SyncOperation[]>): Promise<void> {
    // Process in priority order: viewport -> background -> assets -> global data
    const priorityOrder: SyncOperationType[] = [
      'viewport_change',
      'background_config', 
      'asset_position',
      'asset_background',
      'asset_change',
      'global_tags',
      'global_custom_fields'
    ];

    for (const type of priorityOrder) {
      const operations = groups.get(type);
      if (operations && operations.length > 0) {
        await this.processOperationType(type, operations);
        groups.delete(type);
      }
    }

    // Process any remaining operations
    for (const [type, operations] of groups) {
      await this.processOperationType(type, operations);
    }
  }

  /**
   * Process operations of a specific type
   */
  private async processOperationType(type: SyncOperationType, operations: SyncOperation[]): Promise<void> {
    console.log(`[StoreCoordinator] Processing ${operations.length} ${type} operations`);

    switch (type) {
      case 'asset_change':
        await this.processAssetChanges(operations);
        break;
      case 'asset_position':
        await this.processAssetPositions(operations);
        break;
      case 'asset_background':
        await this.processAssetBackgrounds(operations);
        break;
      case 'background_config':
        await this.processBackgroundConfigs(operations);
        break;
      case 'viewport_change':
        await this.processViewportChanges(operations);
        break;
      case 'global_tags':
        await this.processGlobalTags(operations);
        break;
      case 'global_custom_fields':
        await this.processGlobalCustomFields(operations);
        break;
    }
  }

  /**
   * Process asset metadata changes
   */
  private async processAssetChanges(operations: SyncOperation[]): Promise<void> {
    // Use existing DocumentMutationService for cloud sync
    operations.forEach(op => {
      if (op.assetId && op.data.asset) {
        documentMutationService.markAssetChanged(op.assetId, op.data.asset);
      }
    });

    // Trigger immediate sync for high-priority changes
    const hasHighPriority = operations.some(op => op.priority === 'high');
    if (hasHighPriority) {
      setTimeout(() => {
        documentMutationService.syncNow();
      }, 100);
    }
  }

  /**
   * Process asset position changes
   */
  private async processAssetPositions(operations: SyncOperation[]): Promise<void> {
    operations.forEach(op => {
      if (op.assetId && op.data.position) {
        const { x, y, z = 0 } = op.data.position;
        documentMutationService.markPositionChanged(op.assetId, x, y, z);
      }
    });
  }

  /**
   * Process asset background changes
   */
  private async processAssetBackgrounds(operations: SyncOperation[]): Promise<void> {
    operations.forEach(op => {
      if (op.assetId && op.data.background_config) {
        // Update asset with new background config
        const assetStore = useAssetStore.getState();
        const asset = assetStore.getAssetById(op.assetId);
        if (asset) {
          const updatedAsset = {
            ...asset,
            background_config: op.data.background_config
          };
          documentMutationService.markAssetChanged(op.assetId, updatedAsset);
        }
      }
    });
  }

  /**
   * Process background config changes
   */
  private async processBackgroundConfigs(operations: SyncOperation[]): Promise<void> {
    const backgroundStore = useBackgroundStore.getState();
    const updatedConfigs = { ...backgroundStore.configs };

    operations.forEach(op => {
      if (op.assetId && op.data.config) {
        const key = `asset:${op.assetId}`;
        updatedConfigs[key] = op.data.config;
      }
    });

    // Use DocumentMutationService for global backgrounds sync
    if (documentMutationService.getCurrentProjectId()) {
      documentMutationService.saveGlobalBackgrounds(updatedConfigs);
    }
  }

  /**
   * Process viewport changes
   */
  private async processViewportChanges(operations: SyncOperation[]): Promise<void> {
    const latestOp = operations[operations.length - 1]; // Use most recent viewport state
    if (latestOp.data.viewport) {
      const { offsetX, offsetY, scale } = latestOp.data.viewport;
      await documentMutationService.saveViewport(offsetX, offsetY, scale);
    }
  }

  /**
   * Process global tags changes
   */
  private async processGlobalTags(operations: SyncOperation[]): Promise<void> {
    const latestOp = operations[operations.length - 1]; // Use most recent tags
    if (latestOp.data.tags) {
      documentMutationService.saveGlobalTags(latestOp.data.tags);
    }
  }

  /**
   * Process global custom fields changes
   */
  private async processGlobalCustomFields(operations: SyncOperation[]): Promise<void> {
    // Global custom fields are handled through asset changes
    // This ensures they're saved with the asset data
    console.log('[StoreCoordinator] Processing global custom fields through asset changes');
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(operation: Omit<SyncOperation, 'id' | 'timestamp'>): string {
    const parts: string[] = [operation.type];
    if (operation.assetId) parts.push(operation.assetId);
    parts.push(Date.now().toString());
    return parts.join('_');
  }

  /**
   * Force immediate processing of all pending operations
   */
  public async flushSyncQueue(): Promise<void> {
    // Clear all debounce/throttle timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.throttleTimers.clear();

    // Process any remaining operations
    await this.processSyncQueue();
  }

  /**
   * Get current sync queue status
   */
  public getSyncStatus(): {
    queueSize: number;
    isProcessing: boolean;
    pendingTimers: number;
  } {
    return {
      queueSize: this.syncQueue.size,
      isProcessing: this.isProcessing,
      pendingTimers: this.debounceTimers.size + this.throttleTimers.size,
    };
  }

  /**
   * Clean up all timers and reset state
   */
  public cleanup(): void {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.throttleTimers.clear();
    this.syncQueue.clear();
    this.isProcessing = false;
    console.log('[StoreCoordinator] Cleaned up all timers and queues');
  }
}

// Lazy initialization methods
/**
 * Initialize the StoreCoordinator - should be called when first store mutation is needed
 */
export const initializeStoreCoordinator = (config?: Partial<StoreCoordinatorConfig>): StoreCoordinator => {
  const instance = StoreCoordinator.getInstance(config);
  console.log('[StoreCoordinator] Lazy initialized on demand');
  return instance;
};

/**
 * Get the StoreCoordinator instance - will initialize if needed
 */
export const getStoreCoordinator = (config?: Partial<StoreCoordinatorConfig>): StoreCoordinator => {
  return StoreCoordinator.getInstance(config);
};

// Legacy export for backward compatibility
let _storeCoordinatorInstance: StoreCoordinator | null = null;
export const storeCoordinator = new Proxy({} as StoreCoordinator, {
  get(target, prop) {
    if (!_storeCoordinatorInstance) {
      _storeCoordinatorInstance = initializeStoreCoordinator();
    }
    return _storeCoordinatorInstance[prop as keyof StoreCoordinator];
  }
});

// Export types for use in stores
export type { SyncOperation, StoreCoordinatorConfig };
