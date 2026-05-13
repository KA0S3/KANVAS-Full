/**
 * BACKGROUND SYNC PROCESSOR
 * 
 * Handles background synchronization with automatic retry logic
 * and proper error handling. Works with the FIFO sync queue.
 * 
 * 🔒 CRITICAL: Must remain simple and deterministic
 */

import { SyncQueueEntry } from '@/types/SyncTypes';
import { db } from '@/storage/indexeddb';
import { useSyncStore } from '@/stores/syncStore';
import { supabaseStorage } from '@/storage/supabase';
import { Asset } from '@/types/Asset';

export interface SyncProcessorConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  batchSize: number;
  syncInterval: number;
}

export class SyncProcessor {
  private config: SyncProcessorConfig;
  private isRunning = false;
  private processingTimer: NodeJS.Timeout | null = null;
  private currentBatch: string[] = [];
  private processedCount = 0;
  private failedCount = 0;

  constructor(config: Partial<SyncProcessorConfig> = {}) {
    this.config = {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      batchSize: 10,
      syncInterval: 3000,
      ...config,
    };
  }

  /**
   * Start the background processor
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.processingTimer = setInterval(() => {
      this.processNextBatch();
    }, this.config.syncInterval);

    console.log('Sync processor started');
  }

  /**
   * Stop the background processor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    console.log('Sync processor stopped');
  }

  /**
   * Process the next batch of sync entries
   */
  private async processNextBatch(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const currentProjectId = await this.getCurrentProjectId();
    if (!currentProjectId) {
      return;
    }

    try {
      // Get next batch of dirty entries
      const entries = await this.getNextBatch(currentProjectId);
      
      if (entries.length === 0) {
        useSyncStore.getState().setSyncStatus('idle');
        return;
      }

      this.currentBatch = entries.map(e => e.id);
      useSyncStore.getState().setSyncStatus('syncing');

      // Process each entry in the batch
      for (const entry of entries) {
        await this.processEntry(entry);
      }

      this.processedCount += entries.length;
      this.currentBatch = [];

    } catch (error) {
      console.error('Batch processing failed:', error);
      this.failedCount++;
      useSyncStore.getState().setSyncStatus('error');
      useSyncStore.getState().incrementErrorCount();
    }
  }

  /**
   * Get the next batch of sync entries
   */
  private async getNextBatch(projectId: string): Promise<SyncQueueEntry[]> {
    const entries = await db.getSyncQueue(projectId);
    return entries.slice(0, this.config.batchSize);
  }

  /**
   * Process a single sync entry
   */
  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    try {
      // Mark as processing
      await db.syncQueue.update(entry.id, {
        status: 'syncing',
        lastAttempt: new Date().toISOString(),
      });

      // Process the operation
      await this.executeOperation(entry);

      // Mark as completed
      await db.markSyncProcessed(entry.id);
      
      // Update local sync store
      useSyncStore.getState().markSynced(entry.assetId);

    } catch (error) {
      await this.handleProcessingError(entry, error as Error);
    }
  }

  /**
   * Execute the actual sync operation
   */
  private async executeOperation(entry: SyncQueueEntry): Promise<void> {
    switch (entry.operation) {
      case 'create':
        await this.executeCreate(entry);
        break;
      case 'update':
        await this.executeUpdate(entry);
        break;
      case 'delete':
        await this.executeDelete(entry);
        break;
      default:
        throw new Error(`Unknown operation: ${entry.operation}`);
    }
  }

  /**
   * Execute create operation
   */
  private async executeCreate(entry: SyncQueueEntry): Promise<void> {
    if (!entry.assetData) {
      throw new Error('Create operation requires asset data');
    }

    await supabaseStorage.upsertAsset(entry.assetData as Asset);
  }

  /**
   * Execute update operation
   */
  private async executeUpdate(entry: SyncQueueEntry): Promise<void> {
    if (!entry.assetData) {
      throw new Error('Update operation requires asset data');
    }

    await supabaseStorage.upsertAsset(entry.assetData as Asset);
  }

  /**
   * Execute delete operation
   */
  private async executeDelete(entry: SyncQueueEntry): Promise<void> {
    // Use ProjectService RPC for delete operation
    await supabase.rpc('delete_assets', {
      p_asset_ids: [entry.assetId]
    });
  }

  /**
   * Handle processing errors with retry logic
   */
  private async handleProcessingError(entry: SyncQueueEntry, error: Error): Promise<void> {
    const retryCount = (entry.retryCount || 0) + 1;
    
    if (retryCount >= this.config.maxRetries) {
      // Max retries reached - mark as permanently failed
      await db.markSyncFailed(entry.id, `Max retries exceeded: ${error.message}`);
      useSyncStore.getState().markFailed(entry.assetId, error.message);
      console.error(`Sync failed permanently for entry ${entry.id}: ${error.message}`);
    } else {
      // Calculate exponential backoff delay
      const backoffDelay = Math.min(
        this.config.baseDelay * Math.pow(2, retryCount),
        this.config.maxDelay
      );

      // Mark as failed but keep in queue for retry
      await db.markSyncFailed(entry.id, error.message);

      // Schedule retry
      setTimeout(async () => {
        await db.syncQueue.update(entry.id, {
          status: 'dirty',
          retryCount: 0,
          error: undefined,
        });
      }, backoffDelay);

      console.log(`Entry ${entry.id} scheduled for retry in ${backoffDelay}ms`);
    }
  }

  /**
   * Get current project ID
   */
  private async getCurrentProjectId(): Promise<string | null> {
    // Get from KanvasStore to maintain zone separation
    const { useKanvasStore } = await import('@/stores/kanvasStore');
    return useKanvasStore.getState().currentProjectId;
  }

  /**
   * Force immediate processing
   */
  async forceProcess(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    await this.processNextBatch();
  }

  /**
   * Get processor statistics
   */
  getStats(): {
    isRunning: boolean;
    currentBatch: string[];
    processedCount: number;
    failedCount: number;
    config: SyncProcessorConfig;
  } {
    return {
      isRunning: this.isRunning,
      currentBatch: this.currentBatch,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      config: { ...this.config },
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.processedCount = 0;
    this.failedCount = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SyncProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart processor if interval changed
    if (newConfig.syncInterval && this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

// Default processor instance
export const syncProcessor = new SyncProcessor();
