/**
 * Centralized Type Migration Utility
 * Handles migration of asset types for database compatibility
 */

import type { Asset } from '@/types/assetInterfaces';

/**
 * Migrates a single asset's type from 'other' to 'card' for database compatibility
 * @param asset - The asset to migrate
 * @returns The migrated asset (unchanged if type is not 'other')
 */
export function migrateAssetType(asset: Asset): Asset {
  return asset.type === 'other' 
    ? { ...asset, type: 'card' as const }
    : asset;
}

/**
 * Migrates multiple assets' types from 'other' to 'card' for database compatibility
 * @param assets - Record of assets to migrate
 * @returns Record of migrated assets with updated types
 */
export function migrateAssetTypes(assets: Record<string, Asset>): Record<string, Asset> {
  const migratedAssets: Record<string, Asset> = {};
  let migratedCount = 0;

  Object.entries(assets).forEach(([id, asset]) => {
    if (asset.type === 'other') {
      migratedAssets[id] = { ...asset, type: 'card' as const };
      migratedCount++;
    } else {
      migratedAssets[id] = asset;
    }
  });

  if (migratedCount > 0) {
    console.log(`[TypeMigration] Migrated ${migratedCount} assets from 'other' to 'card' type`);
  }

  return migratedAssets;
}

/**
 * Gets the migrated asset type (returns 'card' for 'other' type)
 * @param assetType - The original asset type
 * @returns The migrated asset type
 */
export function getMigratedAssetType(assetType: string): string {
  return assetType === 'other' ? 'card' : assetType;
}
