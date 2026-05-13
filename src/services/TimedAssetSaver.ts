/**
 * TIMED ASSET SAVER
 * 
 * Implements debounced persistence to reduce database I/O
 * Assets are saved on intervals, not every change
 */

import { db } from '@/storage/indexeddb';
import { useSyncStore } from '@/stores/syncStore';
import type { Asset } from '@/types/Asset';

export class TimedAssetSaver {
  private saveQueue = new Map<string, { asset: Asset; operation: 'create' | 'update' }>();
  private saveInterval = 5000; // 5 seconds
  private saveTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Queue asset update for timed persistence
   */
  queueAssetUpdate(asset: Asset, operation: 'create' | 'update' = 'update'): void {
    const existing = this.saveQueue.get(asset.id);
    this.saveQueue.set(asset.id, {
      asset,
      operation: existing?.operation === 'create' ? 'create' : operation,
    });
    
    // Reset timer on every change
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    // Save after interval of inactivity
    this.saveTimer = setTimeout(() => {
      this.flushSaveQueue();
    }, this.saveInterval);
  }

  /**
   * Force immediate save for critical operations
   */
  async forceSave(asset: Asset): Promise<void> {
    this.saveQueue.delete(asset.id);
    
    return db.transaction('rw', db.assets, () => {
      db.assets.put(asset);
      useSyncStore.getState().markForSync(asset.id, 'update', asset.projectId, asset);
    });
  }

  /**
   * Flush save queue to IndexedDB
   */
  private async flushSaveQueue(): Promise<void> {
    if (this.saveQueue.size === 0 || this.isProcessing) return;
    
    this.isProcessing = true;
    const entriesToSave = Array.from(this.saveQueue.values());
    this.saveQueue.clear();
    
    try {
      // Batch save to IndexedDB
      await db.transaction('rw', db.assets, () => {
        entriesToSave.forEach(({ asset }) => {
          db.assets.put(asset);
        });
      });

      // Mark for sync
      entriesToSave.forEach(({ asset, operation }) => {
        useSyncStore.getState().markForSync(asset.id, operation, asset.projectId, asset);
      });
      
      console.log(`[TimedAssetSaver] Saved ${entriesToSave.length} assets to IndexedDB`);
    } catch (error) {
      console.error('[TimedAssetSaver] Failed to save assets:', error);
      
      // Re-queue failed assets
      entriesToSave.forEach(({ asset, operation }) => {
        this.saveQueue.set(asset.id, { asset, operation });
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): { 
    pendingCount: number; 
    isProcessing: boolean; 
    queuedAssets: string[] 
  } {
    return {
      pendingCount: this.saveQueue.size,
      isProcessing: this.isProcessing,
      queuedAssets: Array.from(this.saveQueue.keys())
    };
  }

  /**
   * Clear all pending saves
   */
  clearQueue(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    
    this.saveQueue.clear();
    this.isProcessing = false;
  }

  /**
   * Configure save interval
   */
  configure(intervalMs: number): void {
    this.saveInterval = intervalMs;
  }

  /**
   * Force flush all pending saves
   */
  async flushAll(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    
    await this.flushSaveQueue();
  }
}

// Export singleton instance
export const timedAssetSaver = new TimedAssetSaver();
