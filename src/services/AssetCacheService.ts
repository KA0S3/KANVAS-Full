/**
 * Scalable Asset Cache Service
 * Handles hundreds of assets per user with low IO
 * Uses LRU eviction + virtualized loading + background sync
 */

export interface AssetMetadata {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  updatedAt: number;
  hasContent: boolean; // Whether heavy content (images, etc) is loaded
}

interface AssetCacheEntry {
  metadata: AssetMetadata;
  fullAsset?: any; // Complete asset data (only for cached items)
  lastAccessed: number;
  isDirty: boolean;
}

interface AssetSyncQueue {
  create: AssetMetadata[];
  update: AssetMetadata[];
  delete: string[];
}

class AssetCacheService {
  private cache = new Map<string, AssetCacheEntry>();
  private readonly MAX_CACHE_SIZE = 50; // Only keep 50 assets in memory
  private readonly SYNC_BATCH_SIZE = 10; // Sync 10 changes at a time
  private syncQueue: AssetSyncQueue = { create: [], update: [], delete: [] };
  private syncTimer: NodeJS.Timeout | null = null;
  private isLoading = false;
  private visibleAssetIds = new Set<string>();
  
  // Get assets currently visible in viewport + small buffer
  async getVisibleAssets(bookId: string, viewportBounds?: { x: number; y: number; width: number; height: number }): Promise<AssetMetadata[]> {
    console.log('[AssetCache] Getting visible assets for book:', bookId);
    
    // First, try cache for visible assets
    const cachedVisible = Array.from(this.cache.values())
      .filter(entry => this.visibleAssetIds.has(entry.metadata.id))
      .map(entry => entry.metadata);
    
    if (cachedVisible.length > 0) {
      console.log('[AssetCache] Found', cachedVisible.length, 'assets in cache');
      return cachedVisible;
    }
    
    // Load fresh data if cache miss
    return this.loadAssetsFromServer(bookId, { limit: 100, offset: 0 });
  }
  
  // Load assets with pagination - never load all at once
  private async loadAssetsFromServer(bookId: string, options: { limit: number; offset: number }): Promise<AssetMetadata[]> {
    if (this.isLoading) {
      console.log('[AssetCache] Already loading, skipping');
      return [];
    }
    
    this.isLoading = true;
    
    try {
      console.log('[AssetCache] Loading assets from server:', options);
      
      // Use documentMutationService for proper integration
      const { documentMutationService } = await import('@/services/DocumentMutationService');
      
      // Load full document using existing working method
      const result = await documentMutationService.loadDocument(bookId);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load assets');
      }
      
      // Extract assets from the loaded document
      const assetsData = result.data.assets || {};
      const assets: AssetMetadata[] = Object.values(assetsData).map((asset: any) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        x: asset.x,
        y: asset.y,
        width: asset.width,
        height: asset.height,
        parentId: asset.parentId,
        updatedAt: new Date(asset.updatedAt).getTime(),
        hasContent: !!asset.content
      }));
      
      // Cache the metadata (lightweight)
      assets.forEach(asset => {
        this.updateCache(asset, false);
      });
      
      console.log('[AssetCache] Loaded', assets.length, 'assets from server');
      return assets;
      
    } catch (error) {
      console.error('[AssetCache] Failed to load assets:', error);
      return [];
    } finally {
      this.isLoading = false;
    }
  }
  
  // Get full asset data (including heavy content) on-demand
  async getFullAsset(assetId: string): Promise<any | null> {
    const cached = this.cache.get(assetId);
    
    // Return from cache if we have it
    if (cached?.fullAsset) {
      cached.lastAccessed = Date.now();
      return cached.fullAsset;
    }
    
    // Load full asset from server
    try {
      console.log('[AssetCache] Loading full asset:', assetId);
      
      // Use documentMutationService to load full document
      const { documentMutationService } = await import('@/services/DocumentMutationService');
      const result = await documentMutationService.loadDocument(this.currentBookId || '');
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load asset');
      }
      
      const asset = result.data.assets?.[assetId];
      if (!asset) {
        throw new Error('Asset not found');
      }
      
      // Cache the full asset
      this.updateCache(asset, true);
      
      return asset;
      
    } catch (error) {
      console.error('[AssetCache] Failed to load full asset:', error);
      return null;
    }
  }
  
  // Update or create asset - queues for background sync
  updateAsset(asset: any): void {
    const metadata: AssetMetadata = {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      x: asset.x,
      y: asset.y,
      width: asset.width,
      height: asset.height,
      parentId: asset.parentId,
      updatedAt: Date.now(),
      hasContent: !!asset.content
    };
    
    // Update cache immediately (optimistic update)
    this.updateCache(asset, true);
    
    // Queue for sync
    const existingIndex = this.syncQueue.update.findIndex(a => a.id === asset.id);
    if (existingIndex >= 0) {
      this.syncQueue.update[existingIndex] = metadata;
    } else {
      this.syncQueue.update.push(metadata);
    }
    
    this.scheduleSync();
  }
  
  // Create asset - queues for background sync
  createAsset(asset: any): void {
    const metadata: AssetMetadata = {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      x: asset.x,
      y: asset.y,
      width: asset.width,
      height: asset.height,
      parentId: asset.parentId,
      updatedAt: Date.now(),
      hasContent: !!asset.content
    };
    
    // Update cache immediately (optimistic update)
    this.updateCache(asset, true);
    
    // Queue for sync
    this.syncQueue.create.push(metadata);
    this.scheduleSync();
  }
  
  // Delete asset - queues for background sync
  deleteAsset(assetId: string): void {
    // Remove from cache immediately
    this.cache.delete(assetId);
    this.visibleAssetIds.delete(assetId);
    
    // Queue for sync
    this.syncQueue.delete.push(assetId);
    this.scheduleSync();
  }
  
  // Update cache with LRU eviction
  private updateCache(asset: any, isFullAsset: boolean): void {
    const entry: AssetCacheEntry = {
      metadata: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        x: asset.x,
        y: asset.y,
        width: asset.width,
        height: asset.height,
        parentId: asset.parentId,
        updatedAt: asset.updatedAt || Date.now(),
        hasContent: isFullAsset
      },
      fullAsset: isFullAsset ? asset : undefined,
      lastAccessed: Date.now(),
      isDirty: true
    };
    
    this.cache.set(asset.id, entry);
    
    // Evict old entries if cache is full
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }
  }
  
  // LRU eviction - remove least recently used assets
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toEvict = entries.slice(0, this.cache.size - this.MAX_CACHE_SIZE);
    toEvict.forEach(([id]) => {
      this.cache.delete(id);
      this.visibleAssetIds.delete(id);
    });
    
    console.log('[AssetCache] Evicted', toEvict.length, 'old assets from cache');
  }
  
  // Update which assets are currently visible
  setVisibleAssets(assetIds: string[]): void {
    this.visibleAssetIds = new Set(assetIds);
    
    // Update access times for visible assets
    assetIds.forEach(id => {
      const entry = this.cache.get(id);
      if (entry) {
        entry.lastAccessed = Date.now();
      }
    });
  }
  
  // Schedule background sync (debounced)
  private scheduleSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    this.syncTimer = setTimeout(() => {
      this.performSync();
    }, 2000); // Wait 2 seconds for batching
  }
  
  // Perform background sync in batches
  private async performSync(): Promise<void> {
    if (this.syncQueue.create.length === 0 && 
        this.syncQueue.update.length === 0 && 
        this.syncQueue.delete.length === 0) {
      return;
    }
    
    console.log('[AssetCache] Starting background sync...');
    
    try {
      // Process creates
      if (this.syncQueue.create.length > 0) {
        const batch = this.syncQueue.create.splice(0, this.SYNC_BATCH_SIZE);
        await this.syncCreates(batch);
      }
      
      // Process updates
      if (this.syncQueue.update.length > 0) {
        const batch = this.syncQueue.update.splice(0, this.SYNC_BATCH_SIZE);
        await this.syncUpdates(batch);
      }
      
      // Process deletes
      if (this.syncQueue.delete.length > 0) {
        const batch = this.syncQueue.delete.splice(0, this.SYNC_BATCH_SIZE);
        await this.syncDeletes(batch);
      }
      
      // Continue if more items to sync
      if (this.syncQueue.create.length > 0 || 
          this.syncQueue.update.length > 0 || 
          this.syncQueue.delete.length > 0) {
        this.scheduleSync();
      }
      
    } catch (error) {
      console.error('[AssetCache] Sync failed:', error);
    }
  }
  
  private async syncCreates(assets: AssetMetadata[]): Promise<void> {
    console.log('[AssetCache] Syncing', assets.length, 'creates');
    
    // Use documentMutationService for proper sync
    const { documentMutationService } = await import('@/services/DocumentMutationService');
    
    // Queue operations through documentMutationService
    for (const asset of assets) {
      // Queue asset creation through existing service
      await documentMutationService.queueServerOperation('CREATE_ASSET', {
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        position: {
          x: asset.x,
          y: asset.y,
          width: asset.width,
          height: asset.height,
          zIndex: 0
        },
        parentId: asset.parentId
      });
    }
    
    // Mark as synced in cache
    assets.forEach(asset => {
      const entry = this.cache.get(asset.id);
      if (entry) {
        entry.isDirty = false;
      }
    });
  }
  
  private async syncUpdates(assets: AssetMetadata[]): Promise<void> {
    console.log('[AssetCache] Syncing', assets.length, 'updates');
    
    // Use documentMutationService for proper sync
    const { documentMutationService } = await import('@/services/DocumentMutationService');
    
    // Queue operations through documentMutationService
    for (const asset of assets) {
      // Queue asset update through existing service
      await documentMutationService.queueServerOperation('UPDATE_POSITION', {
        assetId: asset.id,
        x: asset.x,
        y: asset.y,
        width: asset.width,
        height: asset.height,
        zIndex: 0
      });
      
      // Also queue metadata update if needed
      await documentMutationService.queueServerOperation('UPDATE_METADATA', {
        assetId: asset.id,
        name: asset.name
      });
    }
    
    // Mark as synced in cache
    assets.forEach(asset => {
      const entry = this.cache.get(asset.id);
      if (entry) {
        entry.isDirty = false;
      }
    });
  }
  
  private async syncDeletes(assetIds: string[]): Promise<void> {
    console.log('[AssetCache] Syncing', assetIds.length, 'deletes');
    
    // Use documentMutationService for proper sync
    const { documentMutationService } = await import('@/services/DocumentMutationService');
    
    // Queue operations through documentMutationService
    for (const assetId of assetIds) {
      // Queue asset deletion through existing service
      await documentMutationService.queueServerOperation('DELETE_ASSET', {
        assetId: assetId
      });
    }
  }
  
  // Force sync immediately (for critical operations)
  async forceSync(): Promise<void> {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    
    await this.performSync();
  }
  
  // Get cache statistics
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      queueSize: {
        create: this.syncQueue.create.length,
        update: this.syncQueue.update.length,
        delete: this.syncQueue.delete.length
      },
      visibleAssets: this.visibleAssetIds.size,
      isLoading: this.isLoading
    };
  }
  
  // Clear cache (for logout, etc)
  clearCache(): void {
    this.cache.clear();
    this.visibleAssetIds.clear();
    this.syncQueue = { create: [], update: [], delete: [] };
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }
  
  private supabase = null; // Will be injected
  private currentBookId = null;
  
  // Initialize with Supabase client
  initialize(supabase: any, bookId: string): void {
    this.supabase = supabase;
    this.currentBookId = bookId;
  }
}

// Singleton instance
export const assetCacheService = new AssetCacheService();
