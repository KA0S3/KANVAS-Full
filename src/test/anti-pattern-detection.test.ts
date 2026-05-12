/**
 * ANTI-PATTERN DETECTION TESTS
 * 
 * Comprehensive tests for forbidden patterns that violate the
 * canonical asset structure and zone separation principles.
 * 
 * 🔒 CRITICAL: These tests prevent architectural drift
 */

import { describe, it, expect } from 'vitest';
import { validateAssetStructure, validateAssetStrict, isCanonicalAsset, FORBIDDEN_ASSET_FIELDS } from '../types/Safeguards';
import { Asset } from '../types/Asset';

describe('Anti-Pattern Detection', () => {
  describe('Forbidden Field Detection', () => {
    it('should detect sync status fields in asset data', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614002',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        sync_status: 'dirty' // ❌ Forbidden
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.field === 'sync_status')).toBe(true);
      expect(violations.some(v => v.message.includes('sync_status'))).toBe(true);
    });

    it('should detect upload progress fields', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614003',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        upload_progress: 0.5 // ❌ Forbidden
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.some(v => v.field === 'upload_progress')).toBe(true);
    });

    it('should detect UI state fields', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614004',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        selected: true, // ❌ Forbidden
        hovered: false, // ❌ Forbidden
        dragging: false // ❌ Forbidden
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.some(v => v.field === 'selected')).toBe(true);
      expect(violations.some(v => v.field === 'hovered')).toBe(true);
      expect(violations.some(v => v.field === 'dragging')).toBe(true);
    });

    it('should detect embedded file data', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614005',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        file: new Blob(['test'], { type: 'text/plain' }) // ❌ Forbidden
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.some(v => v.field === 'file')).toBe(true);
    });

    it('should detect forbidden fields in nested structures', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614006',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { 
          title: 'Test',
          customFields: {
            sync_status: 'dirty', // ❌ Forbidden even in nested
            selected: true // ❌ Forbidden even in nested
          }
        },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.some(v => v.field === 'content.customFields.sync_status')).toBe(true);
      expect(violations.some(v => v.field === 'content.customFields.selected')).toBe(true);
    });
  });

  describe('Zone Separation Violations', () => {
    it('should detect mixed zones in asset objects', () => {
      const mixedZoneAsset = {
        id: '123e4567-e89b-12d3-a456-426614013',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        // Mixing canonical data with sync state
        sync_status: 'dirty',
        upload_progress: 0.5,
        // Mixing canonical data with UI state
        selected: true,
        hovered: false
      };

      const violations = validateAssetStructure(mixedZoneAsset);
      expect(violations.length).toBeGreaterThan(3); // Should catch multiple violations
      
      const syncViolations = violations.filter(v => 
        v.field === 'sync_status' || v.field === 'upload_progress'
      );
      const uiViolations = violations.filter(v => 
        v.field === 'selected' || v.field === 'hovered'
      );
      
      expect(syncViolations.length).toBe(2);
      expect(uiViolations.length).toBe(2);
    });
  });

  describe('Schema Drift Detection', () => {
    it('should detect renderMode being used as asset type', () => {
      const suspiciousAsset = {
        id: '123e4567-e89b-12d3-a456-426614007',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: { renderMode: 'image' }, // ⚠️ Suspicious - looks like asset type
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      const violations = validateAssetStructure(suspiciousAsset);
      const warnings = violations.filter(v => v.severity === 'warning');
      expect(warnings.some(v => v.field === 'behavior.renderMode')).toBe(true);
      expect(warnings.some(v => v.message.includes('asset type'))).toBe(true);
    });

    it('should detect customFields being used for asset type data', () => {
      const suspiciousAsset = {
        id: '123e4567-e89b-12d3-a456-426614008',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { 
          title: 'Test',
          customFields: {
            image: 'some-url', // ⚠️ Suspicious - asset type in customFields
            document: 'some-doc' // ⚠️ Suspicious
          }
        },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      const violations = validateAssetStructure(suspiciousAsset);
      const warnings = violations.filter(v => v.severity === 'warning');
      expect(warnings.some(v => v.field === 'content.customFields.image')).toBe(true);
      expect(warnings.some(v => v.field === 'content.customFields.document')).toBe(true);
    });
  });

  describe('Canonical Asset Validation', () => {
    it('should accept valid canonical assets', () => {
      const validAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        parentId: undefined,
        layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 },
        content: { 
          title: 'Valid Asset',
          description: 'This is a valid canonical asset',
          imageUrl: 'https://example.com/image.jpg',
          customFields: { someData: 'value' }
        },
        style: {
          background: { color: 'blue' },
          tagColor: 'red',
          border: { width: 2, style: 'solid' },
          shape: 'rectangle',
          opacity: 1.0
        },
        behavior: {
          renderMode: 'card', // Valid - not an asset type
          interactions: { draggable: true },
          viewport: { zoom: 1.0, panX: 0, panY: 0 }
        },
        metadata: {
          tags: ['tag1', 'tag2'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        }
      };

      expect(() => validateAssetStrict(validAsset)).not.toThrow();
      expect(isCanonicalAsset(validAsset)).toBe(true);
      
      const violations = validateAssetStructure(validAsset);
      expect(violations.filter(v => v.severity === 'error')).toHaveLength(0);
    });

    it('should reject assets missing required sections', () => {
      const incompleteAsset = {
        id: '123e4567-e89b-12d3-a456-426614010',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        // Missing content, style, behavior, metadata
      };

      const violations = validateAssetStructure(incompleteAsset);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.type === 'schema_drift')).toBe(true);
    });
  });

  describe('Runtime Validation', () => {
    it('should throw on validation errors', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614012',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        sync_status: 'dirty', // ❌ This will cause an error
        selected: true // ❌ This will also cause an error
      };

      expect(() => validateAssetStrict(invalidAsset)).toThrow('Asset validation failed');
    });

    it('should pass canonical assets through strict validation', () => {
      const validAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614011',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      expect(() => validateAssetStrict(validAsset)).not.toThrow();
    });
  });

  describe('Forbidden Fields Constant', () => {
    it('should contain all expected forbidden fields', () => {
      const expectedFields = [
        'sync_status',
        'upload_progress',
        'selection_state',
        'hover_state',
        'drag_state',
        'retry_metadata',
        'transient_ui_state',
        'cloud_status',
        'file',
        'children',
        'deleted_at',
        'updated_at',
        'created_at'
      ];

      expectedFields.forEach(field => {
        expect(FORBIDDEN_ASSET_FIELDS).toContain(field);
      });
    });

    it('should not contain valid asset fields', () => {
      const validFields = [
        'id',
        'projectId',
        'parentId',
        'layout',
        'content',
        'style',
        'behavior',
        'metadata',
        'x',
        'y',
        'width',
        'height',
        'title',
        'description',
        'imageUrl',
        'text',
        'customFields',
        'background',
        'tagColor',
        'border',
        'shape',
        'opacity',
        'renderMode',
        'interactions',
        'viewport',
        'tags',
        'createdAt',
        'updatedAt',
        'version'
      ];

      validFields.forEach(field => {
        expect(FORBIDDEN_ASSET_FIELDS).not.toContain(field);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects gracefully', () => {
      const emptyAsset = {};
      const violations = validateAssetStructure(emptyAsset);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.type === 'schema_drift')).toBe(true);
    });

    it('should handle null and undefined values', () => {
      const nullAsset = null;
      const violations = validateAssetStructure(nullAsset);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.type === 'schema_drift')).toBe(true);
    });

    it('should detect forbidden fields with different casing', () => {
      const invalidAsset = {
        id: '123e4567-e89b-12d3-a456-426614017',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
        SYNC_STATUS: 'dirty', // ❌ Should be caught (case-insensitive)
        Selected: true // ❌ Should be caught (case-insensitive)
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.some(v => v.field === 'SYNC_STATUS')).toBe(true);
      expect(violations.some(v => v.field === 'Selected')).toBe(true);
    });
  });
});
