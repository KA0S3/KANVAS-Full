/**
 * SPATIAL INDEXING - Viewport Culling
 * 
 * Implements spatial indexing for efficient viewport culling.
 * Optimizes performance for large projects with 10k+ assets.
 * 
 * 🔒 CRITICAL: Must remain simple and performant
 */

import { Asset } from '@/types/Asset';

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialIndexConfig {
  cellSize: number;
  maxDepth: number;
  threshold: number; // Switch to spatial indexing after this many assets
}

/**
 * Grid-based spatial index for fast viewport queries
 */
export class SpatialIndex {
  private grid: Map<string, Set<string>> = new Map();
  private assetBounds: Map<string, Bounds> = new Map();
  private config: SpatialIndexConfig;
  private assetCount = 0;

  constructor(config: Partial<SpatialIndexConfig> = {}) {
    this.config = {
      cellSize: 1000, // 1000px grid cells
      maxDepth: 4,
      threshold: 1000, // Use spatial indexing after 1000 assets
      ...config,
    };
  }

  /**
   * Add an asset to the spatial index
   */
  addAsset(asset: Asset): void {
    const bounds = this.getAssetBounds(asset);
    const cells = this.getCellsForBounds(bounds);
    
    this.assetBounds.set(asset.id, bounds);
    
    cells.forEach(cell => {
      if (!this.grid.has(cell)) {
        this.grid.set(cell, new Set());
      }
      this.grid.get(cell)!.add(asset.id);
    });
    
    this.assetCount++;
  }

  /**
   * Remove an asset from the spatial index
   */
  removeAsset(assetId: string): void {
    const bounds = this.assetBounds.get(assetId);
    if (!bounds) return;
    
    const cells = this.getCellsForBounds(bounds);
    
    cells.forEach(cell => {
      const cellAssets = this.grid.get(cell);
      if (cellAssets) {
        cellAssets.delete(assetId);
        if (cellAssets.size === 0) {
          this.grid.delete(cell);
        }
      }
    });
    
    this.assetBounds.delete(assetId);
    this.assetCount--;
  }

  /**
   * Update an asset in the spatial index
   */
  updateAsset(asset: Asset): void {
    this.removeAsset(asset.id);
    this.addAsset(asset);
  }

  /**
   * Get assets within viewport
   */
  getAssetsInViewport(viewport: Viewport, allAssets: Map<string, Asset>): Asset[] {
    // If we have few assets, use simple filtering
    if (this.assetCount < this.config.threshold) {
      return this.simpleViewportFilter(viewport, allAssets);
    }

    // Use spatial indexing for large datasets
    const viewportBounds = this.getViewportBounds(viewport);
    const cells = this.getCellsForBounds(viewportBounds);
    const candidateAssetIds = new Set<string>();
    
    cells.forEach(cell => {
      const cellAssets = this.grid.get(cell);
      if (cellAssets) {
        cellAssets.forEach(id => candidateAssetIds.add(id));
      }
    });

    // Filter candidates by actual viewport bounds
    const result: Asset[] = [];
    candidateAssetIds.forEach(id => {
      const asset = allAssets.get(id);
      if (asset && this.isAssetInViewport(asset, viewportBounds)) {
        result.push(asset);
      }
    });

    return result;
  }

  /**
   * Simple viewport filtering for small datasets
   */
  private simpleViewportFilter(viewport: Viewport, allAssets: Map<string, Asset>): Asset[] {
    const viewportBounds = this.getViewportBounds(viewport);
    const result: Asset[] = [];
    
    allAssets.forEach(asset => {
      if (this.isAssetInViewport(asset, viewportBounds)) {
        result.push(asset);
      }
    });
    
    return result;
  }

  /**
   * Check if asset is in viewport
   */
  private isAssetInViewport(asset: Asset, viewportBounds: Bounds): boolean {
    const assetBounds = this.getAssetBounds(asset);
    
    return !(
      assetBounds.x + assetBounds.width < viewportBounds.x ||
      assetBounds.x > viewportBounds.x + viewportBounds.width ||
      assetBounds.y + assetBounds.height < viewportBounds.y ||
      assetBounds.y > viewportBounds.y + viewportBounds.height
    );
  }

  /**
   * Get asset bounds from layout
   */
  private getAssetBounds(asset: Asset): Bounds {
    return {
      x: asset.layout.x,
      y: asset.layout.y,
      width: asset.layout.width,
      height: asset.layout.height,
    };
  }

  /**
   * Get viewport bounds from viewport
   */
  private getViewportBounds(viewport: Viewport): Bounds {
    return {
      x: -viewport.x / viewport.zoom,
      y: -viewport.y / viewport.zoom,
      width: window.innerWidth / viewport.zoom,
      height: window.innerHeight / viewport.zoom,
    };
  }

  /**
   * Get grid cells for bounds
   */
  private getCellsForBounds(bounds: Bounds): string[] {
    const cells: string[] = [];
    const cellSize = this.config.cellSize;
    
    const startX = Math.floor(bounds.x / cellSize);
    const startY = Math.floor(bounds.y / cellSize);
    const endX = Math.floor((bounds.x + bounds.width) / cellSize);
    const endY = Math.floor((bounds.y + bounds.height) / cellSize);
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.push(`${x},${y}`);
      }
    }
    
    return cells;
  }

  /**
   * Clear the spatial index
   */
  clear(): void {
    this.grid.clear();
    this.assetBounds.clear();
    this.assetCount = 0;
  }

  /**
   * Get spatial index statistics
   */
  getStats(): {
    assetCount: number;
    cellCount: number;
    avgAssetsPerCell: number;
    config: SpatialIndexConfig;
  } {
    return {
      assetCount: this.assetCount,
      cellCount: this.grid.size,
      avgAssetsPerCell: this.grid.size > 0 ? this.assetCount / this.grid.size : 0,
      config: { ...this.config },
    };
  }

  /**
   * Rebuild the spatial index from assets
   */
  rebuild(assets: Map<string, Asset>): void {
    this.clear();
    assets.forEach(asset => this.addAsset(asset));
  }
}

/**
 * Quadtree implementation for more advanced spatial indexing
 */
export class QuadTree {
  private bounds: Bounds;
  private capacity: number;
  private assets: Asset[] = [];
  private divided = false;
  private northeast?: QuadTree;
  private northwest?: QuadTree;
  private southeast?: QuadTree;
  private southwest?: QuadTree;

  constructor(bounds: Bounds, capacity = 10) {
    this.bounds = bounds;
    this.capacity = capacity;
  }

  /**
   * Insert an asset into the quadtree
   */
  insert(asset: Asset): boolean {
    const assetBounds = {
      x: asset.layout.x,
      y: asset.layout.y,
      width: asset.layout.width,
      height: asset.layout.height,
    };

    if (!this.boundsIntersect(this.bounds, assetBounds)) {
      return false;
    }

    if (this.assets.length < this.capacity) {
      this.assets.push(asset);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
    }

    return (
      this.northeast!.insert(asset) ||
      this.northwest!.insert(asset) ||
      this.southeast!.insert(asset) ||
      this.southwest!.insert(asset)
    );
  }

  /**
   * Query assets in a given bounds
   */
  query(bounds: Bounds, found: Asset[] = []): Asset[] {
    if (!this.boundsIntersect(this.bounds, bounds)) {
      return found;
    }

    this.assets.forEach(asset => {
      const assetBounds = {
        x: asset.layout.x,
        y: asset.layout.y,
        width: asset.layout.width,
        height: asset.layout.height,
      };
      
      if (this.boundsIntersect(bounds, assetBounds)) {
        found.push(asset);
      }
    });

    if (this.divided) {
      this.northeast!.query(bounds, found);
      this.northwest!.query(bounds, found);
      this.southeast!.query(bounds, found);
      this.southwest!.query(bounds, found);
    }

    return found;
  }

  /**
   * Subdivide the quadtree into four quadrants
   */
  private subdivide(): void {
    const x = this.bounds.x;
    const y = this.bounds.y;
    const w = this.bounds.width / 2;
    const h = this.bounds.height / 2;

    const ne = { x: x + w, y: y, width: w, height: h };
    this.northeast = new QuadTree(ne, this.capacity);

    const nw = { x: x, y: y, width: w, height: h };
    this.northwest = new QuadTree(nw, this.capacity);

    const se = { x: x + w, y: y + h, width: w, height: h };
    this.southeast = new QuadTree(se, this.capacity);

    const sw = { x: x, y: y + h, width: w, height: h };
    this.southwest = new QuadTree(sw, this.capacity);

    this.divided = true;
  }

  /**
   * Check if two bounds intersect
   */
  private boundsIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      a.x > b.x + b.width ||
      a.y + a.height < b.y ||
      a.y > b.y + b.height
    );
  }

  /**
   * Clear the quadtree
   */
  clear(): void {
    this.assets = [];
    this.divided = false;
    this.northeast = undefined;
    this.northwest = undefined;
    this.southeast = undefined;
    this.southwest = undefined;
  }

  /**
   * Get quadtree statistics
   */
  getStats(): {
    assetCount: number;
    maxDepth: number;
    leafCount: number;
  } {
    let assetCount = this.assets.length;
    let maxDepth = this.divided ? 1 : 0;
    let leafCount = this.divided ? 0 : 1;

    if (this.divided) {
      const neStats = this.northeast!.getStats();
      const nwStats = this.northwest!.getStats();
      const seStats = this.southeast!.getStats();
      const swStats = this.southwest!.getStats();

      assetCount += neStats.assetCount + nwStats.assetCount + seStats.assetCount + swStats.assetCount;
      maxDepth = 1 + Math.max(neStats.maxDepth, nwStats.maxDepth, seStats.maxDepth, swStats.maxDepth);
      leafCount = neStats.leafCount + nwStats.leafCount + seStats.leafCount + swStats.leafCount;
    }

    return { assetCount, maxDepth, leafCount };
  }
}

/**
 * Viewport culling manager
 */
export class ViewportCulling {
  private spatialIndex: SpatialIndex;
  private quadtree?: QuadTree;
  private useQuadtree = false;
  private lastViewport: Viewport | null = null;
  private cachedResult: Asset[] = [];

  constructor(config: Partial<SpatialIndexConfig> = {}) {
    this.spatialIndex = new SpatialIndex(config);
  }

  /**
   * Initialize the culling system with assets
   */
  initialize(assets: Map<string, Asset>, useQuadtree = false): void {
    this.useQuadtree = useQuadtree;
    
    if (useQuadtree) {
      // Calculate bounds for quadtree
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      assets.forEach(asset => {
        minX = Math.min(minX, asset.layout.x);
        minY = Math.min(minY, asset.layout.y);
        maxX = Math.max(maxX, asset.layout.x + asset.layout.width);
        maxY = Math.max(maxY, asset.layout.y + asset.layout.height);
      });
      
      const bounds = {
        x: minX - 1000,
        y: minY - 1000,
        width: maxX - minX + 2000,
        height: maxY - minY + 2000,
      };
      
      this.quadtree = new QuadTree(bounds);
      assets.forEach(asset => this.quadtree!.insert(asset));
    } else {
      this.spatialIndex.rebuild(assets);
    }
  }

  /**
   * Get visible assets for viewport
   */
  getVisibleAssets(viewport: Viewport, allAssets: Map<string, Asset>): Asset[] {
    // Check if viewport changed significantly
    if (this.viewportChanged(viewport)) {
      this.lastViewport = { ...viewport };
      
      if (this.useQuadtree && this.quadtree) {
        const viewportBounds = this.getViewportBounds(viewport);
        this.cachedResult = this.quadtree.query(viewportBounds);
      } else {
        this.cachedResult = this.spatialIndex.getAssetsInViewport(viewport, allAssets);
      }
    }
    
    return this.cachedResult;
  }

  /**
   * Check if viewport changed significantly
   */
  private viewportChanged(viewport: Viewport): boolean {
    if (!this.lastViewport) return true;
    
    const threshold = 50; // 50px threshold
    const zoomThreshold = 0.1; // 10% zoom threshold
    
    return (
      Math.abs(viewport.x - this.lastViewport.x) > threshold ||
      Math.abs(viewport.y - this.lastViewport.y) > threshold ||
      Math.abs(viewport.zoom - this.lastViewport.zoom) > zoomThreshold
    );
  }

  /**
   * Get viewport bounds
   */
  private getViewportBounds(viewport: Viewport): Bounds {
    return {
      x: -viewport.x / viewport.zoom,
      y: -viewport.y / viewport.zoom,
      width: window.innerWidth / viewport.zoom,
      height: window.innerHeight / viewport.zoom,
    };
  }

  /**
   * Update assets in the culling system
   */
  updateAsset(asset: Asset): void {
    if (this.useQuadtree && this.quadtree) {
      // Quadtree doesn't support updates easily, rebuild
      // In production, you'd want a more sophisticated approach
    } else {
      this.spatialIndex.updateAsset(asset);
    }
    
    // Clear cache to force recalculation
    this.lastViewport = null;
  }

  /**
   * Add asset to culling system
   */
  addAsset(asset: Asset): void {
    if (this.useQuadtree && this.quadtree) {
      this.quadtree.insert(asset);
    } else {
      this.spatialIndex.addAsset(asset);
    }
    
    // Clear cache to force recalculation
    this.lastViewport = null;
  }

  /**
   * Remove asset from culling system
   */
  removeAsset(assetId: string): void {
    if (this.useQuadtree && this.quadtree) {
      // Quadtree doesn't support removal easily
      // In production, you'd want a more sophisticated approach
    } else {
      this.spatialIndex.removeAsset(assetId);
    }
    
    // Clear cache to force recalculation
    this.lastViewport = null;
  }

  /**
   * Get performance statistics
   */
  getStats(): any {
    if (this.useQuadtree && this.quadtree) {
      return {
        type: 'quadtree',
        ...this.quadtree.getStats(),
      };
    } else {
      return {
        type: 'grid',
        ...this.spatialIndex.getStats(),
      };
    }
  }

  /**
   * Clear the culling system
   */
  clear(): void {
    this.spatialIndex.clear();
    this.quadtree = undefined;
    this.lastViewport = null;
    this.cachedResult = [];
  }
}

// Export singleton instance
export const viewportCulling = new ViewportCulling();
