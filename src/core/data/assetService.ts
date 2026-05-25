/**
 * ASSET SERVICE - Canonical write orchestration
 *
 * This service is the official entry point for all asset write operations.
 * It coordinates:
 * - runtime asset state updates
 * - local persistence via the persistence layer
 * - sync queue enqueueing for cloud sync
 */

import { Asset, validateAssetStrict } from '@/types/Asset';
import { assetPersistence } from '@/persistence/assets';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useSyncStore } from '@/stores/syncStore';

export class AssetService {
  async createAsset(assetData: Omit<Asset, 'id' | 'metadata'>): Promise<string> {
    const assetId = await assetPersistence.create(assetData);
    const asset = await assetPersistence.get(assetId);

    if (!asset) {
      throw new Error(`Failed to load newly created asset ${assetId}`);
    }

    useKanvasStore.getState().addAsset(asset);
    useSyncStore.getState().markForSync(asset.id, 'create', asset.projectId, asset);

    return assetId;
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const runtimeAsset = useKanvasStore.getState().getAsset(id);
    if (runtimeAsset) return runtimeAsset;
    return await assetPersistence.get(id);
  }

  async updateAsset(id: string, updates: Partial<Asset>): Promise<void> {
    const currentAsset = useKanvasStore.getState().getAsset(id) ?? await assetPersistence.get(id);
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
    await assetPersistence.update(id, updatedAsset);

    useKanvasStore.getState().replaceAsset(updatedAsset);
    useSyncStore.getState().markForSync(id, 'update', updatedAsset.projectId, updatedAsset);
  }

  async deleteAsset(id: string): Promise<void> {
    const asset = useKanvasStore.getState().getAsset(id) ?? await assetPersistence.get(id);
    if (!asset) {
      throw new Error(`Asset ${id} not found`);
    }

    useKanvasStore.getState().removeAsset(id);
    await assetPersistence.delete(id, asset.projectId);
  }

  async bulkUpdateAssets(updates: Array<{ id: string; changes: Partial<Asset> }>): Promise<void> {
    const currentAssets = useKanvasStore.getState().assets;
    const updatedAssets: Asset[] = [];

    for (const update of updates) {
      const currentAsset = currentAssets.get(update.id);
      if (!currentAsset) continue;

      const updatedAsset: Asset = {
        ...currentAsset,
        ...update.changes,
        layout: {
          ...currentAsset.layout,
          ...update.changes.layout,
        },
        content: {
          ...currentAsset.content,
          ...update.changes.content,
        },
        style: {
          ...currentAsset.style,
          ...update.changes.style,
        },
        behavior: {
          ...currentAsset.behavior,
          ...update.changes.behavior,
        },
        metadata: {
          ...currentAsset.metadata,
          ...update.changes.metadata,
          updatedAt: new Date().toISOString(),
          version: (currentAsset.metadata.version || 0) + 1,
        },
      };

      validateAssetStrict(updatedAsset);
      updatedAssets.push(updatedAsset);
    }

    if (updatedAssets.length === 0) {
      return;
    }

    const currentAssets = useKanvasStore.getState().assets;
    const mergedAssets = new Map(currentAssets);
    updatedAssets.forEach(asset => mergedAssets.set(asset.id, asset));
    useKanvasStore.getState().setAssets(Array.from(mergedAssets.values()));

    await assetPersistence.bulkUpdate(
      updatedAssets.map(asset => ({ id: asset.id, changes: asset }))
    );

    updatedAssets.forEach(asset => {
      useSyncStore.getState().markForSync(asset.id, 'update', asset.projectId, asset);
    });
  }

  async loadProjectAssets(projectId: string): Promise<Asset[]> {
    const assets = await assetPersistence.getProjectAssets(projectId);
    useKanvasStore.getState().setAssets(assets);
    return assets;
  }
}

export const assetService = new AssetService();
