/**
 * FIFO SYNC QUEUE - Simple Deterministic Sync
 * 
 * Implements a simple FIFO queue for asset synchronization.
 * No complex conflict resolution - just last-write-wins.
 * 
 * 🔒 CRITICAL: This queue must remain simple and deterministic
 */

import { SyncQueueEntry, RuntimeSyncState } from '@/types/SyncTypes';
import { db } from '@/storage/indexeddb';
import { useSyncStore } from '@/stores/syncStore';
import { supabaseStorage } from '@/storage/supabase';
import { Asset } from '@/types/Asset';

export class SyncQueue {
  private isProcessing = false;
  private processingTimer: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL = 3000; // 3 seconds
  private readonly MAX_RETRY_COUNT = 5;
  private readonly BATCH_SIZE = 10;

  constructor() {
    this.startBackgroundProcessor();
  }

  /**
   * Start the background sync processor
   */
  private startBackgroundProcessor(): void {
    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, this.SYNC_INTERVAL);
  }

  /**
   * Stop the background processor
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
  }

  /**
   * Process the sync queue (FIFO order)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing
    }

    const currentProjectId = this.getCurrentProjectId();
    if (!currentProjectId) {
      return; // No active project
    }

    this.isProcessing = true;
    useSyncStore.getState().setSyncStatus('syncing');

    try {
      const queue = await db.getSyncQueue(currentProjectId);
      const dirtyEntries = queue.filter(entry => entry.status === 'dirty');
      
      if (dirtyEntries.length === 0) {
        useSyncStore.getState().setSyncStatus('idle');
        return;
      }

      // Process in batches (FIFO order)
      const batch = dirtyEntries.slice(0, this.BATCH_SIZE);
      await this.processBatch(batch);

    } catch (error) {
      console.error('Sync queue processing failed:', error);
      useSyncStore.getState().setSyncStatus('error');
      useSyncStore.getState().incrementErrorCount();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch of sync entries
   */
  private async processBatch(entries: SyncQueueEntry[]): Promise<void> {
    for (const entry of entries) {
      try {
        await this.processEntry(entry);
        await db.markSyncProcessed(entry.id);
        
        // Update local sync store
        useSyncStore.getState().markForSync(entry.assetId, entry.operation as any, entry.projectId);
        
      } catch (error) {
        console.error(`Failed to sync entry ${entry.id}:`, error);
        await this.handleSyncFailure(entry, error as Error);
      }
    }
  }

  /**
   * Process a single sync entry
   */
  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    switch (entry.operation) {
      case 'create':
        await this.processCreate(entry);
        break;
      case 'update':
        await this.processUpdate(entry);
        break;
      case 'delete':
        await this.processDelete(entry);
        break;
      default:
        throw new Error(`Unknown operation: ${entry.operation}`);
    }
  }

  /**
   * Process asset creation
   */
  private async processCreate(entry: SyncQueueEntry): Promise<void> {
    if (!entry.assetData) {
      throw new Error('Create operation requires asset data');
    }

    const asset = entry.assetData as Asset;
    await supabaseStorage.createAsset(asset);
  }

  /**
   * Process asset update
   */
  private async processUpdate(entry: SyncQueueEntry): Promise<void> {
    if (!entry.assetData) {
      throw new Error('Update operation requires asset data');
    }

    const asset = entry.assetData as Asset;
    await supabaseStorage.updateAsset(asset);
  }

  /**
   * Process asset deletion
   */
  private async processDelete(entry: SyncQueueEntry): Promise<void> {
    await supabaseStorage.deleteAsset(entry.assetId, entry.projectId);
  }

  /**
   * Handle sync failure with retry logic
   */
  private async handleSyncFailure(entry: SyncQueueEntry, error: Error): Promise<void> {
    const retryCount = (entry.retryCount || 0) + 1;
    
    if (retryCount >= this.MAX_RETRY_COUNT) {
      // Max retries reached - mark as permanently failed
      await db.markSyncFailed(entry.id, `Max retries exceeded: ${error.message}`);
      console.error(`Sync failed permanently for entry ${entry.id}`);
    } else {
      // Increment retry count and keep in queue
      await db.markSyncFailed(entry.id, error.message);
      
      // Exponential backoff for next retry
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      setTimeout(() => {
        // Reset status to dirty for retry
        db.syncQueue.update(entry.id, { status: 'dirty' });
      }, backoffDelay);
    }
  }

  /**
   * Get current project ID from stores
   */
  private getCurrentProjectId(): string | null {
    // This would typically come from a project store
    // For now, return a placeholder
    return localStorage.getItem('currentProjectId') || null;
  }

  /**
   * Force immediate sync (for destructive operations)
   */
  async forceSync(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    await this.processQueue();
  }

  /**
   * Get sync queue statistics
   */
  async getQueueStats(): Promise<{
    total: number;
    dirty: number;
    syncing: number;
    failed: number;
  }> {
    const currentProjectId = this.getCurrentProjectId();
    if (!currentProjectId) {
      return { total: 0, dirty: 0, syncing: 0, failed: 0 };
    }

    const queue = await db.getSyncQueue(currentProjectId);
    
    return {
      total: queue.length,
      dirty: queue.filter(e => e.status === 'dirty').length,
      syncing: queue.filter(e => e.status === 'syncing').length,
      failed: queue.filter(e => e.status === 'failed').length,
    };
  }

  /**
   * Clear processed entries from queue
   */
  async cleanupProcessedEntries(): Promise<number> {
    return await db.cleanupSyncedEntries();
  }

  /**
   * Retry failed entries
   */
  async retryFailedEntries(): Promise<void> {
    const currentProjectId = this.getCurrentProjectId();
    if (!currentProjectId) {
      return;
    }

    const failedEntries = await db.syncQueue
      .where('projectId')
      .equals(currentProjectId)
      .and(entry => entry.status === 'failed')
      .toArray();

    for (const entry of failedEntries) {
      await db.syncQueue.update(entry.id, {
        status: 'dirty',
        retryCount: 0,
        error: undefined,
      });
    }

    // Trigger immediate processing
    this.processQueue();
  }
}

// Singleton instance
export const syncQueue = new SyncQueue();
