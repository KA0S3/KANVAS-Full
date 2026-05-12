/**
 * TIMED ASSET SAVER
 * 
 * Implements debounced persistence to reduce database I/O
 * Assets are saved on intervals, not every change
 */

import { db } from '@/storage/indexeddb';
import { useSyncStore } from '@/stores/syncStore';
import { assetToAssetInput } from '@/services/ProjectService';
import type { Asset } from '@/types/Asset';

export class TimedAssetSaver {
  private saveQueue = new Map<string, Asset>();
  private saveInterval = 5000; // 5 seconds
  private saveTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Queue asset update for timed persistence
   */
  queueAssetUpdate(asset: Asset): void {
    this.saveQueue.set(asset.id, asset);
    
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
      useSyncStore.getState().markForSync(asset.id, 'update', asset.projectId);
    });
  }

  /**
   * Flush save queue to IndexedDB
   */
  private async flushSaveQueue(): Promise<void> {
    if (this.saveQueue.size === 0 || this.isProcessing) return;
    
    this.isProcessing = true;
    const assetsToSave = Array.from(this.saveQueue.values());
    this.saveQueue.clear();
    
    try {
      // Batch save to IndexedDB
      await db.transaction('rw', db.assets, () => {
        assetsToSave.forEach(asset => {
          db.assets.put(asset);
        });
      });

      // Mark for sync
      assetsToSave.forEach(asset => {
        useSyncStore.getState().markForSync(asset.id, 'update', asset.projectId);
      });
      
      console.log(`[TimedAssetSaver] Saved ${assetsToSave.length} assets to IndexedDB`);
    } catch (error) {
      console.error('[TimedAssetSaver] Failed to save assets:', error);
      
      // Re-queue failed assets
      assetsToSave.forEach(asset => {
        this.saveQueue.set(asset.id, asset);
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
