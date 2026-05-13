/**
 * KANVAS STORE - Primary Runtime Store
 * 
 * This store contains canonical asset data ONLY - the source of truth during editing.
 * Runtime state is kept separate in other stores.
 * 
 * 🔒 CRITICAL: This store must NEVER contain UI state or sync state
 */

import { create } from 'zustand';
import { Asset, createCanonicalAsset, validateAssetStrict } from '@/types/Asset';
import { FORBIDDEN_ASSET_FIELDS } from '@/types/Safeguards';
import { SyncQueueEntry } from '@/types/SyncTypes';
import { db } from '@/storage/indexeddb';
import { useSyncStore } from '@/stores/syncStore';
import { timedAssetSaver } from '@/services/TimedAssetSaver';
import { createId } from '@/utils/id';

// Store interface for canonical asset data
export interface KanvasStore {
  // Runtime state (source of truth during editing)
  assets: Map<string, Asset>;
  currentProjectId: string | null;
  
  // Asset operations (immediate UI updates)
  getAsset: (id: string) => Asset | undefined;
  getProjectAssets: (projectId: string) => Asset[];
  
  createAsset: (assetData: Omit<Asset, 'id' | 'metadata'> & { id?: string; metadata?: Partial<Asset['metadata']> }) => Promise<string>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  
  // Project operations
  loadProject: (projectId: string) => Promise<void>;
  clearProject: () => void;
  
  // Bulk operations
  bulkUpdateAssets: (updates: Array<{ id: string; changes: Partial<Asset> }>) => Promise<void>;
}

export const useKanvasStore = create<KanvasStore>((set, get) => ({
  // Initial state
  assets: new Map(),
  currentProjectId: null,

  // Asset getters
  getAsset: (id: string) => get().assets.get(id),
  
  getProjectAssets: (projectId: string) => {
    return Array.from(get().assets.values()).filter(asset => asset.projectId === projectId);
  },

  // Asset creation with immediate UI update and timed persistence
  createAsset: async (assetData) => {
    const id = assetData.id || createId();
    const now = new Date().toISOString();
    
    const asset: Asset = createCanonicalAsset(assetData.projectId, {
      ...assetData,
      id,
      metadata: {
        ...assetData.metadata,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    });

    // Validate against anti-patterns
    validateAssetStrict(asset);

    // Update state immediately (UI updates)
    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.set(id, asset);
      return { assets: newAssets };
    });

    // Queue for timed persistence (non-blocking)
    timedAssetSaver.queueAssetUpdate(asset, 'create');

    return id;
  },

  // Asset update with immediate UI update and timed persistence
  updateAsset: async (id: string, updates: Partial<Asset>) => {
    const currentAsset = get().assets.get(id);
    if (!currentAsset) {
      throw new Error(`Asset ${id} not found`);
    }

    const updatedAsset: Asset = {
      ...currentAsset,
      ...updates,
      layout: {
        ...currentAsset.layout,
        ...updates.layout,
      },
      content: {
        ...currentAsset.content,
        ...updates.content,
      },
      style: {
        ...currentAsset.style,
        ...updates.style,
      },
      behavior: {
        ...currentAsset.behavior,
        ...updates.behavior,
      },
      metadata: {
        ...currentAsset.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString(),
        version: (currentAsset.metadata.version || 0) + 1,
      },
    };

    // Validate against anti-patterns
    validateAssetStrict(updatedAsset);

    // Update state immediately (UI updates)
    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.set(id, updatedAsset);
      return { assets: newAssets };
    });

    // Queue for timed persistence (non-blocking)
    timedAssetSaver.queueAssetUpdate(updatedAsset, 'update');
  },

  // Asset deletion with immediate UI update
  deleteAsset: async (id: string) => {
    const asset = get().assets.get(id);
    if (!asset) {
      throw new Error(`Asset ${id} not found`);
    }

    // Update state immediately (UI updates)
    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.delete(id);
      return { assets: newAssets };
    });

    // Persist to IndexedDB asynchronously
    try {
      await db.deleteAsset(id, asset.projectId);
    } catch (error) {
      console.error('Failed to delete asset:', error);
      // TODO: Handle persistence failure
    }
  },

  // Load project assets from IndexedDB
  loadProject: async (projectId: string) => {
    try {
      const assets = await db.getProjectAssets(projectId);
      const assetMap = new Map(assets.map(asset => [asset.id, asset]));
      
      set({
        assets: assetMap,
        currentProjectId: projectId,
      });
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  },

  // Clear current project from memory
  clearProject: () => {
    set({
      assets: new Map(),
      currentProjectId: null,
    });
  },

  // Bulk update for performance (e.g., dragging multiple assets)
  bulkUpdateAssets: async (updates: Array<{ id: string; changes: Partial<Asset> }>) => {
    const currentAssets = get().assets;
    const updatedAssets = new Map(currentAssets);

    // Apply all updates to local state immediately
    for (const { id, changes } of updates) {
      const currentAsset = currentAssets.get(id);
      if (!currentAsset) continue;

      const updatedAsset: Asset = {
        ...currentAsset,
        ...changes,
        metadata: {
          ...currentAsset.metadata,
          ...changes.metadata,
          updatedAt: new Date().toISOString(),
          version: (currentAsset.metadata.version || 0) + 1,
        },
      };

      validateAssetStrict(updatedAsset);
      updatedAssets.set(id, updatedAsset);
    }

    // Update state once (batch UI update)
    set({ assets: updatedAssets });

    // Persist all changes asynchronously
    try {
      await db.transaction('rw', db.assets, async () => {
        for (const { id, changes } of updates) {
          await db.updateAsset(id, changes);
          const asset = updatedAssets.get(id);
          if (asset) {
            useSyncStore.getState().markForSync(id, 'update', asset.projectId, asset);
          }
        }
      });
    } catch (error) {
      console.error('Failed to bulk update assets:', error);
      // TODO: Handle persistence failure
    }
  },
}));

// Selectors for derived state
export const selectProjectAssets = (state: KanvasStore) => 
  state.currentProjectId ? state.getProjectAssets(state.currentProjectId) : [];

export const selectAssetById = (id: string) => (state: KanvasStore) => 
  state.assets.get(id);

export const selectAssetsByParentId = (parentId?: string) => (state: KanvasStore) => 
  Array.from(state.assets.values()).filter(asset => asset.parentId === parentId);

// Utility functions for store operations
export const getAssetCount = (state: KanvasStore) => state.assets.size;

export const getProjectAssetCount = (projectId: string) => (state: KanvasStore) => 
  state.getProjectAssets(projectId).length;
