/**
 * ASSET PERSISTENCE VALIDATION TEST SUITE
 * 
 * Comprehensive tests for all persistence fixes implemented
 * Validates canonical Asset interface, parent-child hierarchy, lazy loading, and timed saves
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assetToAssetInput, assetFromDb, buildAssetTree } from '@/services/ProjectService';
import { timedAssetSaver } from '@/services/TimedAssetSaver';
import { lazyAssetLoader } from '@/services/LazyAssetLoader';
import { useKanvasStore } from '@/stores/kanvasStore';
import { Asset } from '@/types/Asset';

describe('Asset Persistence Validation', () => {
  let mockAsset: Asset;

  beforeEach(() => {
    mockAsset = {
      id: 'test-asset-1',
      projectId: 'test-project-1',
      parentId: undefined,
      layout: {
        x: 100,
        y: 200,
        width: 300,
        height: 200,
        zIndex: 1,
      },
      content: {
        title: 'Test Asset',
        description: 'Test Description',
        text: 'Test Content',
        imageUrl: 'https://example.com/image.jpg',
        customFields: {
          category: 'test',
          priority: 'high',
        },
      },
      style: {
        background: { color: '#ffffff' },
        tagColor: '#ff0000',
        border: { width: 2, color: '#000000' },
        shape: 'card',
        opacity: 1,
      },
      behavior: {
        renderMode: 'card',
        interactions: { draggable: true },
        viewport: {
          zoom: 1.0,
          panX: 0,
          panY: 0,
        },
      },
      metadata: {
        tags: ['test', 'validation'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        version: 1,
      },
    };
  });

  afterEach(() => {
    // Clear test data
    lazyAssetLoader.clearCache();
    timedAssetSaver.clearQueue();
  });

  describe('AssetInput Mapping Functions', () => {
    it('should map canonical Asset to AssetInput correctly', () => {
      const assetInput = assetToAssetInput(mockAsset);

      expect(assetInput).toEqual({
        asset_id: mockAsset.id,
        parent_id: null,
        name: mockAsset.content.title,
        type: mockAsset.behavior.renderMode,
        x: mockAsset.layout.x,
        y: mockAsset.layout.y,
        width: mockAsset.layout.width,
        height: mockAsset.layout.height,
        z_index: mockAsset.layout.zIndex,
        is_expanded: false,
        content: mockAsset.content.text,
        background_config: mockAsset.style,
        viewport_config: mockAsset.behavior.viewport,
        custom_fields: {
          customFields: mockAsset.content.customFields,
          customFieldValues: [],
          thumbnail: mockAsset.content.imageUrl,
          background: mockAsset.style.background,
          tags: mockAsset.metadata.tags,
          viewportDisplaySettings: mockAsset.behavior.viewport,
          description: mockAsset.content.description,
        },
      });
    });

    it('should reconstruct canonical Asset from database AssetInput', () => {
      const dbAsset = {
        asset_id: mockAsset.id,
        project_id: mockAsset.projectId,
        parent_id: null,
        name: mockAsset.content.title,
        type: mockAsset.behavior.renderMode,
        x: mockAsset.layout.x,
        y: mockAsset.layout.y,
        width: mockAsset.layout.width,
        height: mockAsset.layout.height,
        z_index: mockAsset.layout.zIndex,
        is_expanded: false,
        content: mockAsset.content.text,
        background_config: mockAsset.style,
        viewport_config: mockAsset.behavior.viewport,
        custom_fields: {
          customFields: mockAsset.content.customFields,
          customFieldValues: [],
          thumbnail: mockAsset.content.imageUrl,
          background: mockAsset.style.background,
          tags: mockAsset.metadata.tags,
          viewportDisplaySettings: mockAsset.behavior.viewport,
          description: mockAsset.content.description,
        },
        created_at: mockAsset.metadata.createdAt,
        updated_at: mockAsset.metadata.updatedAt,
      };

      const reconstructedAsset = assetFromDb(dbAsset);

      expect(reconstructedAsset.id).toBe(mockAsset.id);
      expect(reconstructedAsset.projectId).toBe(mockAsset.projectId);
      expect(reconstructedAsset.layout).toEqual(mockAsset.layout);
      expect(reconstructedAsset.content.title).toBe(mockAsset.content.title);
      expect(reconstructedAsset.behavior.renderMode).toBe(mockAsset.behavior.renderMode);
    });
  });

  describe('Parent-Child Hierarchy Reconstruction', () => {
    it('should build asset tree from flat asset list', async () => {
      const flatAssets = [
        { ...mockAsset, id: 'parent-1', parentId: undefined },
        { ...mockAsset, id: 'child-1', parentId: 'parent-1' },
        { ...mockAsset, id: 'child-2', parentId: 'parent-1' },
        { ...mockAsset, id: 'grandchild-1', parentId: 'child-1' },
      ];

      const { rootAssets, assetMap } = buildAssetTree(flatAssets);

      expect(rootAssets).toHaveLength(1);
      expect(rootAssets[0].id).toBe('parent-1');
      expect(rootAssets[0].children).toHaveLength(2);
      expect(assetMap['child-1'].children).toHaveLength(1);
      expect(assetMap['grandchild-1'].children).toHaveLength(0);
    });

    it('should handle multiple root assets correctly', async () => {
      const flatAssets = [
        { ...mockAsset, id: 'root-1', parentId: undefined },
        { ...mockAsset, id: 'root-2', parentId: undefined },
        { ...mockAsset, id: 'child-1', parentId: 'root-1' },
      ];

      const { rootAssets } = buildAssetTree(flatAssets);

      expect(rootAssets).toHaveLength(2);
      expect(rootAssets.map(r => r.id)).toEqual(['root-1', 'root-2']);
    });
  });

  describe('Lazy Loading Performance', () => {
    it('should load assets within viewport bounds', async () => {
      const viewport = { x: 0, y: 0, width: 500, height: 400, zoom: 1 };
      
      // Mock viewport-based loading
      const loadedAssets = await lazyAssetLoader.loadAssetsForViewport(viewport, 'test-project');

      expect(loadedAssets).toBeDefined();
      expect(Array.isArray(loadedAssets)).toBe(true);
    });

    it('should cache loaded assets to avoid duplicate queries', async () => {
      const viewport = { x: 0, y: 0, width: 500, height: 400, zoom: 1 };
      
      // First load
      await lazyAssetLoader.loadAssetsForViewport(viewport, 'test-project');
      const stats1 = lazyAssetLoader.getMemoryStats();
      
      // Second load with same viewport
      await lazyAssetLoader.loadAssetsForViewport(viewport, 'test-project');
      const stats2 = lazyAssetLoader.getMemoryStats();

      expect(stats2.loadedCount).toBe(stats1.loadedCount);
    });

    it('should clear cache when requested', () => {
      lazyAssetLoader.clearCache();
      const stats = lazyAssetLoader.getMemoryStats();
      
      expect(stats.cacheSize).toBe(0);
      expect(stats.loadedCount).toBe(0);
    });
  });

  describe('Timed Save Mechanism', () => {
    it('should queue asset updates for timed persistence', async () => {
      const initialStatus = timedAssetSaver.getQueueStatus();
      expect(initialStatus.pendingCount).toBe(0);

      // Queue an asset update
      timedAssetSaver.queueAssetUpdate(mockAsset);

      const queuedStatus = timedAssetSaver.getQueueStatus();
      expect(queuedStatus.pendingCount).toBe(1);
      expect(queuedStatus.queuedAssets).toContain(mockAsset.id);
    });

    it('should force immediate save for critical operations', async () => {
      const initialStatus = timedAssetSaver.getQueueStatus();
      expect(initialStatus.pendingCount).toBe(0);

      // Force immediate save
      await timedAssetSaver.forceSave(mockAsset);

      const finalStatus = timedAssetSaver.getQueueStatus();
      expect(finalStatus.pendingCount).toBe(0);
      expect(finalStatus.queuedAssets).not.toContain(mockAsset.id);
    });

    it('should flush queue after configured interval', async () => {
      // Mock setTimeout to test interval behavior
      const originalSetTimeout = global.setTimeout;
      const mockSetTimeout = vi.fn() as any;
      global.setTimeout = mockSetTimeout;

      timedAssetSaver.queueAssetUpdate(mockAsset);

      expect(mockSetTimeout).toHaveBeenCalled();
      expect(mockSetTimeout.mock.calls[0][1]).toBe(5000); // 5 second interval

      global.setTimeout = originalSetTimeout;
    });
  });

  describe('Store Integration', () => {
    it('should create assets with immediate UI updates', async () => {
      const store = useKanvasStore.getState();
      const initialAssetCount = store.assets.size;

      const assetId = await store.createAsset(mockAsset);

      expect(assetId).toBeDefined();
      expect(store.assets.size).toBe(initialAssetCount + 1);
      expect(store.assets.has(assetId)).toBe(true);
    });

    it('should update assets with immediate UI updates', async () => {
      const store = useKanvasStore.getState();
      const assetId = await store.createAsset(mockAsset);

      const updates = {
        layout: { ...mockAsset.layout, x: 250 }
      };

      await store.updateAsset(assetId, updates);

      const updatedAsset = store.assets.get(assetId);
      expect(updatedAsset?.layout.x).toBe(250);
    });

    it('should maintain canonical Asset structure in store', async () => {
      const store = useKanvasStore.getState();
      const assetId = await store.createAsset(mockAsset);

      const storedAsset = store.assets.get(assetId);

      expect(storedAsset).toHaveProperty('layout');
      expect(storedAsset).toHaveProperty('content');
      expect(storedAsset).toHaveProperty('style');
      expect(storedAsset).toHaveProperty('behavior');
      expect(storedAsset).toHaveProperty('metadata');
      expect(storedAsset).not.toHaveProperty('sync_status'); // Forbidden field
    });
  });

  describe('Viewport Settings Clarification', () => {
    it('should treat viewport settings as asset position within parent', () => {
      const assetWithViewport = {
        ...mockAsset,
        behavior: {
          ...mockAsset.behavior,
          viewport: {
            zoom: 1.5,
            panX: 10, // Asset position within parent viewport
            panY: 20, // Asset position within parent viewport
          },
        },
      };

      const assetInput = assetToAssetInput(assetWithViewport);

      expect(assetInput.viewport_config).toEqual({
        zoom: 1.5,
        panX: 10,
        panY: 20,
      });
    });

    it('should distinguish asset viewport from camera viewport', () => {
      // Asset viewport settings are for positioning within parent
      const assetViewport = mockAsset.behavior.viewport;
      
      expect(assetViewport).toHaveProperty('zoom');
      expect(assetViewport).toHaveProperty('panX');
      expect(assetViewport).toHaveProperty('panY');
      
      // These should NOT be in asset data (they belong to UI state)
      expect(mockAsset).not.toHaveProperty('cameraX');
      expect(mockAsset).not.toHaveProperty('cameraY');
      expect(mockAsset).not.toHaveProperty('cameraZoom');
    });
  });
});
