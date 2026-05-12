/**
 * LAZY ASSET LOADER
 * 
 * Implements viewport-based lazy loading for performance optimization
 * Only loads assets visible in current viewport area
 */

import { db } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

interface AssetWithChildren extends Asset {
  children: AssetWithChildren[];
}

interface AssetTreeResult {
  rootAssets: AssetWithChildren[];
  assetMap: Record<string, AssetWithChildren>;
}

export class LazyAssetLoader {
  private loadedViewport = { x: 0, y: 0, width: 0, height: 0 };
  private loadedAssets = new Set<string>();
  private assetCache = new Map<string, Asset>();
  private maxCacheSize = 1000;

  /**
   * Load assets for current viewport
   * Only loads assets not already cached and within viewport bounds
   */
  async loadAssetsForViewport(viewport: Viewport, projectId: string): Promise<Asset[]> {
    // Check if viewport changed significantly
    if (this.viewportChanged(viewport)) {
      // Get assets in new viewport area
      const assetsInViewport = await this.getAssetsInViewport(viewport, projectId);
      
      // Load only assets not already loaded
      const newAssets = assetsInViewport.filter(asset => 
        !this.loadedAssets.has(asset.id)
      );
      
      // Add to loaded set and cache
      newAssets.forEach(asset => {
        this.loadedAssets.add(asset.id);
        this.cacheAsset(asset);
      });
      
      // Update viewport
      this.loadedViewport = { ...viewport };
      
      return newAssets;
    }
    
    return []; // No new assets needed
  }

  /**
   * Build asset tree from flat asset list
   * Reconstructs parent-child hierarchy from database flat structure
   */
  async buildAssetTree(projectId: string): Promise<AssetTreeResult> {
    // Get all assets for project
    const flatAssets = await db.assets
      .where('projectId')
      .equals(projectId)
      .toArray();

    const assetMap: Record<string, AssetWithChildren> = {};
    const rootAssets: AssetWithChildren[] = [];
    
    // First pass: Create map with empty children arrays
    flatAssets.forEach(asset => {
      assetMap[asset.id] = { ...asset, children: [] };
    });
    
    // Second pass: Build parent-child relationships
    flatAssets.forEach(asset => {
      if (asset.parentId) {
        const parent = assetMap[asset.parentId];
        if (parent) {
          parent.children.push(assetMap[asset.id]);
        }
      } else {
        rootAssets.push(assetMap[asset.id]);
      }
    });
    
    return { rootAssets, assetMap };
  }

  /**
   * Get assets within viewport bounds
   * Uses spatial indexing for efficient queries
   */
  private async getAssetsInViewport(viewport: Viewport, projectId: string): Promise<Asset[]> {
    // Use compound index for efficient spatial queries
    return await db.assets
      .where('[projectId+layout.x+layout.y]')
      .between([
        projectId, viewport.x, viewport.y
      ], [
        projectId, viewport.x + viewport.width, viewport.y + viewport.height
      ])
      .toArray();
  }

  /**
   * Check if viewport changed significantly
   */
  private viewportChanged(newViewport: Viewport): boolean {
    const tolerance = 50; // 50px tolerance
    return (
      Math.abs(newViewport.x - this.loadedViewport.x) > tolerance ||
      Math.abs(newViewport.y - this.loadedViewport.y) > tolerance ||
      Math.abs(newViewport.width - this.loadedViewport.width) > tolerance ||
      Math.abs(newViewport.height - this.loadedViewport.height) > tolerance
    );
  }

  /**
   * Cache asset with LRU eviction
   */
  private cacheAsset(asset: Asset): void {
    // Evict if cache is full
    if (this.assetCache.size >= this.maxCacheSize) {
      const oldestId = this.assetCache.keys().next().value;
      if (oldestId) {
        this.assetCache.delete(oldestId);
      }
    }
    
    this.assetCache.set(asset.id, asset);
  }

  /**
   * Get cached asset
   */
  getCachedAsset(id: string): Asset | undefined {
    return this.assetCache.get(id);
  }

  /**
   * Clear cache and loaded assets
   */
  clearCache(): void {
    this.loadedAssets.clear();
    this.assetCache.clear();
    this.loadedViewport = { x: 0, y: 0, width: 0, height: 0 };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): { cacheSize: number; loadedCount: number } {
    return {
      cacheSize: this.assetCache.size,
      loadedCount: this.loadedAssets.size
    };
  }
}

// Export singleton instance
export const lazyAssetLoader = new LazyAssetLoader();
