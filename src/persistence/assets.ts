/**
 * ASSET PERSISTENCE OPERATIONS - Canonical Asset CRUD
 * 
 * This module handles all asset persistence operations following the plan.
 * Uses only canonical asset structure with proper zone separation.
 * 
 * 🔒 CRITICAL: Only canonical Asset data - no sync state, no UI state
 */

import { Asset, createCanonicalAsset } from '@/types/Asset';
import { validateAssetStrict } from '@/types/Safeguards';
import { db } from '@/storage/indexeddb';

/**
 * Asset persistence operations
 */
export class AssetPersistence {
  /**
   * Create a new asset
   */
  static async create(assetData: Omit<Asset, 'id' | 'metadata'>): Promise<string> {
    const asset = createCanonicalAsset(assetData.projectId, assetData);
    
    // Validate against anti-patterns
    validateAssetStrict(asset);
    
    // Persist to IndexedDB
    const id = await db.createAsset(asset);
    
    return id;
  }

  /**
   * Get asset by ID
   */
  static async get(id: string): Promise<Asset | undefined> {
    return await db.getAsset(id);
  }

  /**
   * Get all assets for a project
   */
  static async getProjectAssets(projectId: string): Promise<Asset[]> {
    return await db.getProjectAssets(projectId);
  }

  /**
   * Update an asset
   */
  static async update(id: string, updates: Partial<Asset>): Promise<void> {
    // Get current asset to merge updates
    const currentAsset = await db.getAsset(id);
    if (!currentAsset) {
      throw new Error(`Asset ${id} not found`);
    }

    // Create updated asset with proper metadata
    const updatedAsset: Asset = {
      ...currentAsset,
      ...updates,
      metadata: {
        ...currentAsset.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString(),
        version: (currentAsset.metadata.version || 0) + 1,
      },
    };

    // Validate against anti-patterns
    validateAssetStrict(updatedAsset);

    // Persist to IndexedDB
    await db.updateAsset(id, updates);
  }

  /**
   * Delete an asset
   */
  static async delete(id: string, projectId: string): Promise<void> {
    await db.deleteAsset(id, projectId);
  }

  /**
   * Bulk update assets (for performance)
   */
  static async bulkUpdate(updates: Array<{ id: string; changes: Partial<Asset> }>): Promise<void> {
    await db.transaction('rw', db.assets, async () => {
      for (const { id, changes } of updates) {
        const currentAsset = await db.getAsset(id);
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
        await db.updateAsset(id, changes);
      }
    });
  }

  /**
   * Get assets by parent ID
   */
  static async getAssetsByParent(projectId: string, parentId?: string): Promise<Asset[]> {
    const allAssets = await db.getProjectAssets(projectId);
    return allAssets.filter(asset => asset.parentId === parentId);
  }

  /**
   * Search assets by content
   */
  static async searchAssets(projectId: string, query: string): Promise<Asset[]> {
    const allAssets = await db.getProjectAssets(projectId);
    const lowerQuery = query.toLowerCase();
    
    return allAssets.filter(asset => 
      asset.content.title?.toLowerCase().includes(lowerQuery) ||
      asset.content.description?.toLowerCase().includes(lowerQuery) ||
      asset.content.text?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get assets by tags
   */
  static async getAssetsByTags(projectId: string, tags: string[]): Promise<Asset[]> {
    const allAssets = await db.getProjectAssets(projectId);
    
    return allAssets.filter(asset => {
      if (!asset.metadata.tags) return false;
      return tags.some(tag => asset.metadata.tags!.includes(tag));
    });
  }

  /**
   * Count assets in project
   */
  static async countProjectAssets(projectId: string): Promise<number> {
    const assets = await db.getProjectAssets(projectId);
    return assets.length;
  }

  /**
   * Validate asset structure before persistence
   */
  static validateAsset(asset: Asset): void {
    validateAssetStrict(asset);
  }
}

// Export singleton instance
export const assetPersistence = AssetPersistence;
