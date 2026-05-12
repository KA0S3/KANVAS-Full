/**
 * SYNC STORE - Runtime Sync State Only
 * 
 * This store contains runtime sync state ONLY - never mixed with canonical asset data.
 * Follows strict zone separation principles.
 * 
 * 🔒 CRITICAL: This store must NEVER contain canonical asset data or UI state
 */

import { create } from 'zustand';
import { RuntimeSyncState, SyncStoreState, createRuntimeSyncState } from '@/types/SyncTypes';
import { db } from '@/storage/indexeddb';

export interface SyncStore extends SyncStoreState {
  // Sync queue operations
  markForSync: (assetId: string, operation: 'create' | 'update' | 'delete', projectId: string) => void;
  getSyncStatus: (assetId: string) => RuntimeSyncState | undefined;
  clearSyncQueue: () => void;
  
  // Sync status management
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  incrementErrorCount: () => void;
  setErrorCount: (count: number) => void;
  
  // Load sync state from IndexedDB
  loadSyncQueue: (projectId: string) => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  // Initial state
  syncQueue: new Map(),
  syncStatus: 'idle',
  errorCount: 0,

  // Mark asset for sync
  markForSync: (assetId: string, operation: 'create' | 'update' | 'delete', projectId: string) => {
    const syncState = createRuntimeSyncState(assetId, operation);
    
    set(state => {
      const newQueue = new Map(state.syncQueue);
      newQueue.set(assetId, syncState);
      return { syncQueue: newQueue };
    });

    // Add to IndexedDB sync queue
    db.addToSyncQueue({
      assetId,
      operation,
      status: 'dirty',
      retryCount: 0,
      createdAt: syncState.createdAt,
      projectId,
    }).catch(error => {
      console.error('Failed to add to sync queue:', error);
    });
  },

  // Get sync status for specific asset
  getSyncStatus: (assetId: string) => {
    return get().syncQueue.get(assetId);
  },

  // Clear entire sync queue
  clearSyncQueue: () => {
    set({ syncQueue: new Map() });
  },

  // Set overall sync status
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => {
    set({ syncStatus: status });
  },

  // Increment error count
  incrementErrorCount: () => {
    set(state => ({ errorCount: state.errorCount + 1 }));
  },

  // Set error count
  setErrorCount: (count: number) => {
    set({ errorCount: count });
  },

  // Load sync queue from IndexedDB
  loadSyncQueue: async (projectId: string) => {
    try {
      const queueEntries = await db.getSyncQueue(projectId);
      const queueMap = new Map<string, RuntimeSyncState>();
      
      queueEntries.forEach(entry => {
        queueMap.set(entry.assetId, {
          assetId: entry.assetId,
          operation: entry.operation,
          status: entry.status,
          retryCount: entry.retryCount,
          lastAttempt: entry.lastAttempt,
          error: entry.error,
          createdAt: entry.createdAt,
          processedAt: entry.processedAt,
        });
      });
      
      set({ syncQueue: queueMap });
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  },
}));

// Selectors for derived state
export const selectDirtyAssets = (state: SyncStore) => 
  Array.from(state.syncQueue.values()).filter(entry => entry.status === 'dirty');

export const selectFailedAssets = (state: SyncStore) => 
  Array.from(state.syncQueue.values()).filter(entry => entry.status === 'failed');

export const selectSyncingAssets = (state: SyncStore) => 
  Array.from(state.syncQueue.values()).filter(entry => entry.status === 'syncing');

export const selectSyncQueueSize = (state: SyncStore) => state.syncQueue.size;

export const selectHasDirtyAssets = (state: SyncStore) => 
  Array.from(state.syncQueue.values()).some(entry => entry.status === 'dirty');

// Utility functions
export const getAssetSyncStatus = (assetId: string) => (state: SyncStore) => 
  state.syncQueue.get(assetId);

export const isAssetDirty = (assetId: string) => (state: SyncStore) => {
  const syncState = state.syncQueue.get(assetId);
  return syncState?.status === 'dirty';
};

export const isAssetSyncing = (assetId: string) => (state: SyncStore) => {
  const syncState = state.syncQueue.get(assetId);
  return syncState?.status === 'syncing';
};

export const isAssetFailed = (assetId: string) => (state: SyncStore) => {
  const syncState = state.syncQueue.get(assetId);
  return syncState?.status === 'failed';
};
