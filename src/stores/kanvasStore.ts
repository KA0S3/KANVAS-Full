/**
 * KANVAS STORE - Primary Runtime Store
 * 
 * This store contains canonical asset data ONLY - the source of truth during editing.
 * Runtime state is kept separate in other stores.
 * 
 * 🔒 CRITICAL: This store must NEVER contain UI state or sync state
 */

import { create } from 'zustand';
import { loadProject as loadProjectBundle } from '@/persistence';
import { Asset, createCanonicalAsset, validateAssetStrict } from '@/types/Asset';
import { generateAssetId } from '@/lib/idGenerator';
import { db } from '@/storage/indexeddb';
import { timedAssetSaver } from '@/services/TimedAssetSaver';

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
  
  // Runtime-only helpers
  setAssets: (assets: Asset[]) => void;
  addAsset: (asset: Asset) => void;
  replaceAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  
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

  // Asset creation with immediate UI update
  createAsset: async (assetData) => {
    // Ensure we have required data
    const finalProjectId = assetData.projectId || get().currentProjectId || 'default';
    if (!finalProjectId) {
      throw new Error('Cannot create asset: no project ID available');
    }

    const asset: Asset = createCanonicalAsset(finalProjectId, assetData);
    const id = asset.id;

    // Final validation before storing
    validateAssetStrict(asset);

    // Store in UI state immediately
    await timedAssetSaver.forceSave(asset);

    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.set(id, asset);
      return { assets: newAssets };
    });

    return id;
  },

  // Asset update with immediate UI update
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

    validateAssetStrict(updatedAsset);

    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.set(id, updatedAsset);
      return { assets: newAssets };
    });

    timedAssetSaver.queueAssetUpdate(updatedAsset, 'update');
  },

  // Asset deletion with immediate UI update
  deleteAsset: async (id: string) => {
    const asset = get().assets.get(id);
    if (!asset) {
      throw new Error(`Asset ${id} not found`);
    }

    await timedAssetSaver.flushAll();
    await db.deleteAsset(id, asset.projectId);

    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.delete(id);
      return { assets: newAssets };
    });
  },

  // Runtime-only helpers
  setAssets: (assets: Asset[]) => {
    const assetMap = new Map(assets.map(asset => [asset.id, asset]));
    set({ assets: assetMap });
  },

  addAsset: (asset: Asset) => {
    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.set(asset.id, asset);
      return { assets: newAssets };
    });
  },

  replaceAsset: (asset: Asset) => {
    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.set(asset.id, asset);
      return { assets: newAssets };
    });
  },

  removeAsset: (id: string) => {
    set(state => {
      const newAssets = new Map(state.assets);
      newAssets.delete(id);
      return { assets: newAssets };
    });
  },

  setCurrentProjectId: (projectId: string | null) => {
    set({ currentProjectId: projectId });
  },

  // Load project assets from persistence layer only
  loadProject: async (projectId: string) => {
    try {
      const bundle = await loadProjectBundle(projectId);
      const assetMap = new Map(bundle.assets.map(asset => [asset.id, asset]));

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

    for (const { id, changes } of updates) {
      const currentAsset = currentAssets.get(id);
      if (!currentAsset) continue;

      const updatedAsset: Asset = {
        ...currentAsset,
        ...changes,
        layout: {
          ...currentAsset.layout,
          ...changes.layout,
        },
        content: {
          ...currentAsset.content,
          ...changes.content,
        },
        style: {
          ...currentAsset.style,
          ...changes.style,
        },
        behavior: {
          ...currentAsset.behavior,
          ...changes.behavior,
        },
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

    set({ assets: updatedAssets });

    for (const [id, asset] of updatedAssets.entries()) {
      if (currentAssets.get(id) !== asset) {
        timedAssetSaver.queueAssetUpdate(asset, 'update');
      }
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
