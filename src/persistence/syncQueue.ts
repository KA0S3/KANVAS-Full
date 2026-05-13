/**
 * SYNC QUEUE PERSISTENCE - Runtime Sync State
 * 
 * This module handles sync queue persistence operations following plan.
 * Runtime sync state ONLY - never mixed with canonical asset data.
 * 
 * 🔒 CRITICAL: Only sync state - no asset data, no UI state
 */

import { db } from '@/storage/indexeddb';
import { RuntimeSyncState, createRuntimeSyncState, SyncQueueEntry } from '@/types/SyncTypes';
import { createId } from '@/utils/id';

/**
 * Sync queue persistence operations
 */
export class SyncQueuePersistence {
  /**
   * Add entry to sync queue
   */
  static async add(entry: Omit<SyncQueueEntry, 'id'>): Promise<string> {
    const syncEntry: SyncQueueEntry = {
      ...entry,
      id: createId(),
    };

    await db.addToSyncQueue(syncEntry);
    return syncEntry.id;
  }

  /**
   * Get sync queue for a project
   */
  static async getProjectQueue(projectId: string): Promise<SyncQueueEntry[]> {
    return await db.getSyncQueue(projectId);
  }

  /**
   * Get entry by ID
   */
  static async get(id: string): Promise<SyncQueueEntry | undefined> {
    return await db.syncQueue.get(id);
  }

  /**
   * Mark entry as processed
   */
  static async markProcessed(id: string): Promise<void> {
    await db.markSyncProcessed(id);
  }

  /**
   * Mark entry as failed
   */
  static async markFailed(id: string, error: string): Promise<void> {
    await db.markSyncFailed(id, error);
  }

  /**
   * Update entry status
   */
  static async updateStatus(id: string, status: 'dirty' | 'syncing' | 'synced' | 'failed'): Promise<void> {
    const updates: Partial<SyncQueueEntry> = {
      status,
    };

    if (status === 'syncing') {
      updates.lastAttempt = new Date().toISOString();
    } else if (status === 'synced') {
      updates.processedAt = new Date().toISOString();
    }

    await db.syncQueue.update(id, updates);
  }

  /**
   * Get entries by status
   */
  static async getByStatus(projectId: string, status: string): Promise<SyncQueueEntry[]> {
    const queue = await this.getProjectQueue(projectId);
    return queue.filter(entry => entry.status === status);
  }

  /**
   * Get dirty entries (ready to sync)
   */
  static async getDirtyEntries(projectId: string): Promise<SyncQueueEntry[]> {
    return await this.getByStatus(projectId, 'dirty');
  }

  /**
   * Get failed entries (ready to retry)
   */
  static async getFailedEntries(projectId: string): Promise<SyncQueueEntry[]> {
    return await this.getByStatus(projectId, 'failed');
  }

  /**
   * Get processing entries (currently syncing)
   */
  static async getProcessingEntries(projectId: string): Promise<SyncQueueEntry[]> {
    return await this.getByStatus(projectId, 'syncing');
  }

  /**
   * Delete entry
   */
  static async delete(id: string): Promise<void> {
    await db.syncQueue.delete(id);
  }

  /**
   * Clear entire project queue
   */
  static async clearProjectQueue(projectId: string): Promise<void> {
    const entries = await this.getProjectQueue(projectId);
    
    await db.transaction('rw', db.syncQueue, async () => {
      for (const entry of entries) {
        await db.syncQueue.delete(entry.id);
      }
    });
  }

  /**
   * Clear processed entries (cleanup)
   */
  static async clearProcessedEntries(projectId: string): Promise<number> {
    return await db.cleanupSyncedEntries();
  }

  /**
   * Retry failed entries
   */
  static async retryFailedEntries(projectId: string): Promise<void> {
    const failedEntries = await this.getFailedEntries(projectId);
    
    await db.transaction('rw', db.syncQueue, async () => {
      for (const entry of failedEntries) {
        await db.syncQueue.update(entry.id, {
          status: 'dirty',
          retryCount: 0,
          error: undefined,
        });
      }
    });
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(projectId: string): Promise<{
    total: number;
    dirty: number;
    processing: number;
    synced: number;
    failed: number;
  }> {
    const queue = await this.getProjectQueue(projectId);
    
    return {
      total: queue.length,
      dirty: queue.filter(e => e.status === 'dirty').length,
      processing: queue.filter(e => e.status === 'syncing').length,
      synced: queue.filter(e => e.status === 'synced').length,
      failed: queue.filter(e => e.status === 'failed').length,
    };
  }

  /**
   * Get entries that need retry (with exponential backoff)
   */
  static async getRetryableEntries(projectId: string): Promise<SyncQueueEntry[]> {
    const failedEntries = await this.getFailedEntries(projectId);
    const now = Date.now();
    
    return failedEntries.filter(entry => {
      const retryCount = entry.retryCount || 0;
      const lastAttempt = entry.lastAttempt ? new Date(entry.lastAttempt).getTime() : 0;
      
      // Exponential backoff: 2^retryCount seconds, max 30 seconds
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
      const nextRetryAt = lastAttempt + backoffMs;
      
      return now >= nextRetryAt;
    });
  }

  /**
   * Add asset to sync queue
   */
  static async addAsset(
    assetId: string,
    operation: 'create' | 'update' | 'delete',
    projectId: string,
    assetData?: any
  ): Promise<string> {
    // Check if asset is already in queue
    const existingEntries = await this.getProjectQueue(projectId);
    const existingEntry = existingEntries.find(
      entry => entry.assetId === assetId && entry.status === 'dirty'
    );

    if (existingEntry) {
      // Update existing entry
      await db.syncQueue.update(existingEntry.id, {
        operation,
        assetData,
        createdAt: new Date().toISOString(),
      });
      return existingEntry.id;
    }

    // Add new entry
    const entry: Omit<SyncQueueEntry, 'id'> = {
      projectId,
      assetId,
      operation,
      status: 'dirty',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      assetData,
    };

    return await this.add(entry);
  }

  /**
   * Remove asset from queue (if sync is no longer needed)
   */
  static async removeAsset(projectId: string, assetId: string): Promise<void> {
    const entries = await this.getProjectQueue(projectId);
    const entriesToRemove = entries.filter(entry => entry.assetId === assetId);
    
    await db.transaction('rw', db.syncQueue, async () => {
      for (const entry of entriesToRemove) {
        await db.syncQueue.delete(entry.id);
      }
    });
  }

  /**
   * Validate sync queue entry
   */
  static validateEntry(entry: Partial<SyncQueueEntry>): void {
    if (!entry.assetId) {
      throw new Error('Sync entry must have assetId');
    }

    if (!entry.operation) {
      throw new Error('Sync entry must have operation');
    }

    if (!entry.status) {
      throw new Error('Sync entry must have status');
    }

    if (!entry.projectId) {
      throw new Error('Sync entry must have projectId');
    }

    const validOperations = ['create', 'update', 'delete'];
    if (!validOperations.includes(entry.operation)) {
      throw new Error(`Invalid operation: ${entry.operation}`);
    }

    const validStatuses = ['dirty', 'syncing', 'synced', 'failed'];
    if (!validStatuses.includes(entry.status)) {
      throw new Error(`Invalid status: ${entry.status}`);
    }
  }

  /**
   * Convert to runtime sync state
   */
  static toRuntimeState(entry: SyncQueueEntry): RuntimeSyncState {
    return {
      assetId: entry.assetId,
      operation: entry.operation,
      status: entry.status,
      retryCount: entry.retryCount,
      lastAttempt: entry.lastAttempt,
      error: entry.error,
      createdAt: entry.createdAt,
      processedAt: entry.processedAt,
    };
  }

  /**
   * Bulk update entries
   */
  static async bulkUpdate(updates: Array<{
    id: string;
    changes: Partial<SyncQueueEntry>;
  }>): Promise<void> {
    await db.transaction('rw', db.syncQueue, async () => {
      for (const { id, changes } of updates) {
        await db.syncQueue.update(id, changes);
      }
    });
  }
}

// Export singleton instance
export const syncQueuePersistence = SyncQueuePersistence;
