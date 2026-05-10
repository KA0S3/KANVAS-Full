/**
 * Backward Compatibility Layer for Asset Store Consolidation
 * Provides compatibility exports during migration period
 * Allows gradual transition from assetStoreSimple and AssetCacheService
 */

import { useAssetStore } from './assetStore';

// Re-export main store as default for existing imports
export { useAssetStore as default };

// AssetCacheService compatibility layer
export const assetCacheService = {
  // Map to integrated store methods
  initialize: (supabase: any, bookId: string) => {
    console.warn('[AssetCacheService] initialize() - Use useAssetStore.enableVirtualizedMode() instead');
    const store = useAssetStore.getState();
    if (store.getCurrentBookId() === bookId && !store.isVirtualizedMode) {
      store.enableVirtualizedMode();
    }
  },

  getVisibleAssets: async (bookId: string, bounds?: { x: number; y: number; width: number; height: number }) => {
    console.warn('[AssetCacheService] getVisibleAssets() - Use useAssetStore.getVisibleAssets() instead');
    const store = useAssetStore.getState();
    if (store.getCurrentBookId() === bookId) {
      return store.getVisibleAssets(bounds);
    }
    return [];
  },

  getFullAsset: async (assetId: string): Promise<any | null> => {
    console.warn('[AssetCacheService] getFullAsset() - Use useAssetStore.getAssetById() instead');
    const store = useAssetStore.getState();
    return store.getAssetById(assetId);
  },

  updateAsset: (asset: any) => {
    console.warn('[AssetCacheService] updateAsset() - Use useAssetStore.updateAsset() instead');
    const store = useAssetStore.getState();
    store.updateAsset(asset.id, asset);
  },

  createAsset: (asset: any) => {
    console.warn('[AssetCacheService] createAsset() - Use useAssetStore.createAsset() instead');
    const store = useAssetStore.getState();
    store.createAsset(asset, asset.parentId);
  },

  deleteAsset: (assetId: string) => {
    console.warn('[AssetCacheService] deleteAsset() - Use useAssetStore.deleteAsset() instead');
    const store = useAssetStore.getState();
    store.deleteAsset(assetId);
  },

  setVisibleAssets: (assetIds: string[]) => {
    console.warn('[AssetCacheService] setVisibleAssets() - Use useAssetStore methods instead');
    const store = useAssetStore.getState();
    // Update visible assets in store
    useAssetStore.setState({ visibleAssetIds: new Set(assetIds) });
  },

  getCacheStats: () => {
    console.warn('[AssetCacheService] getCacheStats() - Use useAssetStore.getCacheStats() instead');
    const store = useAssetStore.getState();
    return store.getCacheStats();
  },

  clearCache: () => {
    console.warn('[AssetCacheService] clearCache() - Use useAssetStore.clearCache() instead');
    const store = useAssetStore.getState();
    store.clearCache();
  },

  forceSync: async () => {
    console.warn('[AssetCacheService] forceSync() - Sync is now handled automatically');
    // No-op - sync is handled by documentMutationService
  }
};

// Export types for compatibility
export type { AssetMetadata } from './assetStore';
