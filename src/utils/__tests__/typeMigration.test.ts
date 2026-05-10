/**
 * Tests for type migration utility
 */

import { describe, it, expect } from 'vitest';
import { migrateAssetType, migrateAssetTypes, getMigratedAssetType } from '../typeMigration';
import type { Asset } from '@/types/assetInterfaces';

describe('Type Migration Utility', () => {
  const createMockAsset = (type: string): Asset => ({
    id: 'test-asset-1',
    name: 'Test Asset',
    type: type as any,
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    children: [],
    cloudStatus: 'local',
    customFields: [],
    customFieldValues: [],
    viewportConfig: { zoom: 1, panX: 0, panY: 0 },
    backgroundConfig: { mode: 'glass' as const, color: null, imageUrl: null, position: { x: 0, y: 0 }, scale: 1, edgeOpacity: 1, innerRadius: 0.3, outerRadius: 0.8, gridSize: 40 },
    viewportDisplaySettings: { showGrid: true, snapToGrid: false, gridSize: 40 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isExpanded: false,
    isLocked: false,
    borderShape: 'square',
    showTagBorder: false
  });

  describe('migrateAssetType', () => {
    it('should migrate "other" type to "card"', () => {
      const asset = createMockAsset('other');
      const migrated = migrateAssetType(asset);
      
      expect(migrated.type).toBe('card');
      expect(migrated.id).toBe(asset.id);
      expect(migrated.name).toBe(asset.name);
    });

    it('should leave other types unchanged', () => {
      const types = ['image', 'document', 'video', 'audio', 'code', 'text', 'container', 'viewport', 'tag'];
      
      types.forEach(type => {
        const asset = createMockAsset(type);
        const migrated = migrateAssetType(asset);
        
        expect(migrated.type).toBe(type);
        expect(migrated.id).toBe(asset.id);
      });
    });

    it('should leave "card" type unchanged', () => {
      const asset = createMockAsset('card');
      const migrated = migrateAssetType(asset);
      
      expect(migrated.type).toBe('card');
      expect(migrated.id).toBe(asset.id);
    });
  });

  describe('migrateAssetTypes', () => {
    it('should migrate multiple assets with "other" type', () => {
      const assets: Record<string, Asset> = {
        'asset1': createMockAsset('other'),
        'asset2': createMockAsset('image'),
        'asset3': createMockAsset('other'),
        'asset4': createMockAsset('document')
      };

      const migrated = migrateAssetTypes(assets);

      expect(migrated.asset1.type).toBe('card');
      expect(migrated.asset2.type).toBe('image');
      expect(migrated.asset3.type).toBe('card');
      expect(migrated.asset4.type).toBe('document');
    });

    it('should handle empty asset record', () => {
      const assets: Record<string, Asset> = {};
      const migrated = migrateAssetTypes(assets);

      expect(Object.keys(migrated)).toHaveLength(0);
    });

    it('should preserve all asset properties during migration', () => {
      const asset = createMockAsset('other');
      asset.description = 'Test description';
      asset.tags = ['tag1', 'tag2'];
      
      const assets = { 'asset1': asset };
      const migrated = migrateAssetTypes(assets);

      expect(migrated.asset1.type).toBe('card');
      expect(migrated.asset1.description).toBe('Test description');
      expect(migrated.asset1.tags).toEqual(['tag1', 'tag2']);
      expect(migrated.asset1.id).toBe(asset.id);
    });
  });

  describe('getMigratedAssetType', () => {
    it('should return "card" for "other" type', () => {
      const result = getMigratedAssetType('other');
      expect(result).toBe('card');
    });

    it('should return original type for non-"other" types', () => {
      const types = ['image', 'document', 'video', 'audio', 'code', 'text', 'container', 'viewport', 'tag', 'card'];
      
      types.forEach(type => {
        const result = getMigratedAssetType(type);
        expect(result).toBe(type);
      });
    });
  });
});
