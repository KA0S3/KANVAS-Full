/**
 * ASSET STORE - Asset management
 * 
 * Simple store for managing assets in the current project
 * This is a simplified version for compatibility with the new architecture
 */

import { create } from 'zustand';
import { Asset } from '@/types/Asset';

interface AssetStoreState {
  assets: Record<string, Asset>;
  selectedAssets: Set<string>;
  activeAsset: string | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  setAssets: (assets: Asset[]) => void;
  addAsset: (asset: Asset) => void;
  updateAsset: (assetId: string, updates: Partial<Asset>) => void;
  removeAsset: (assetId: string) => void;
  getAsset: (assetId: string) => Asset | undefined;
  getAllAssets: () => Asset[];
  selectAsset: (assetId: string) => void;
  deselectAsset: (assetId: string) => void;
  selectAllAssets: () => void;
  clearSelection: () => void;
  getSelectedAssets: () => Asset[];
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearAssets: () => void;
}

export const useAssetStore = create<AssetStoreState>()((set, get) => ({
  // Initial state
  assets: {},
  selectedAssets: new Set(),
  activeAsset: null,
  loading: false,
  error: null,

  // Set all assets (replace current state)
  setAssets: (assets: Asset[]) => {
    const assetMap = assets.reduce((map, asset) => {
      map[asset.id] = asset;
      return map;
    }, {} as Record<string, Asset>);
    
    set({ assets: assetMap });
  },

  // Add a single asset
  addAsset: (asset: Asset) => {
    set(state => ({
      assets: {
        ...state.assets,
        [asset.id]: asset
      }
    }));
  },

  // Update an asset
  updateAsset: (assetId: string, updates: Partial<Asset>) => {
    set(state => {
      const currentAsset = state.assets[assetId];
      if (!currentAsset) return state;

      const updatedAsset: Asset = {
        ...currentAsset,
        ...updates,
        metadata: {
          ...currentAsset.metadata,
          ...updates.metadata,
          updatedAt: new Date().toISOString(),
          version: (currentAsset.metadata.version || 0) + 1,
        }
      };

      return {
        assets: {
          ...state.assets,
          [assetId]: updatedAsset
        }
      };
    });
  },

  // Remove an asset
  removeAsset: (assetId: string) => {
    set(state => {
      const newAssets = { ...state.assets };
      delete newAssets[assetId];
      
      const newSelectedAssets = new Set(state.selectedAssets);
      newSelectedAssets.delete(assetId);
      
      return {
        assets: newAssets,
        selectedAssets: newSelectedAssets
      };
    });
  },

  // Get a specific asset
  getAsset: (assetId: string) => {
    return get().assets[assetId];
  },

  // Get all assets
  getAllAssets: () => {
    return Object.values(get().assets);
  },

  // Select an asset
  selectAsset: (assetId: string) => {
    set(state => ({
      selectedAssets: new Set(state.selectedAssets).add(assetId)
    }));
  },

  // Deselect an asset
  deselectAsset: (assetId: string) => {
    set(state => {
      const newSelectedAssets = new Set(state.selectedAssets);
      newSelectedAssets.delete(assetId);
      return { selectedAssets: newSelectedAssets };
    });
  },

  // Select all assets
  selectAllAssets: () => {
    const assetIds = Object.keys(get().assets);
    set({ selectedAssets: new Set(assetIds) });
  },

  // Clear selection
  clearSelection: () => {
    set({ selectedAssets: new Set() });
  },

  // Get selected assets
  getSelectedAssets: () => {
    const { assets, selectedAssets } = get();
    return Array.from(selectedAssets)
      .map(id => assets[id])
      .filter(Boolean) as Asset[];
  },

  // Set loading state
  setLoading: (loading: boolean) => {
    set({ loading });
  },

  // Set error state
  setError: (error: string | null) => {
    set({ error });
  },

  // Clear all assets
  clearAssets: () => {
    set({
      assets: {},
      selectedAssets: new Set(),
      loading: false,
      error: null,
      activeAsset: null
    });
  },

  // Set active asset
  setActiveAsset: (assetId: string | null) => {
    set({ activeAsset: assetId });
  },

  // Get asset children
  getAssetChildren: (parentId: string) => {
    const { assets } = get();
    return Object.values(assets).filter(asset => asset.parentId === parentId);
  },

  // Get current book assets (backward compatibility for V2 migration)
  getCurrentBookAssets: () => {
    const { assets } = get();
    const assetList = Object.values(assets) as any[];

    // Several V2 migration-era components treat this helper as an array,
    // while older modal/background code indexes it as a map by asset id.
    // Return an array with id properties so both call sites keep working.
    assetList.forEach(asset => {
      if (asset?.id) {
        assetList[asset.id] = asset;
      }
    });

    return assetList;
  }
}));
