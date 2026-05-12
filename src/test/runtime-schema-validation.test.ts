/**
 * RUNTIME SCHEMA VALIDATION TESTS
 * 
 * Tests for runtime validation of asset structures to ensure
 * canonical compliance during application execution.
 * 
 * 🔒 CRITICAL: These tests prevent runtime architectural drift
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateAssetStrict, isCanonicalAsset, validateAssetStructure } from '../types/Safeguards';
import { Asset } from '../types/Asset';

describe('Runtime Schema Validation', () => {
  describe('validateAssetStrict', () => {
    it('should pass valid canonical assets', () => {
      const validAsset: Asset = {
        id: 'test-1',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 },
        content: { 
          title: 'Test Asset',
          description: 'A valid canonical asset',
          imageUrl: 'https://example.com/image.jpg',
          customFields: { category: 'test' }
        },
        style: {
          background: { color: 'blue' },
          tagColor: 'red',
          border: { width: 2, style: 'solid' },
          shape: 'rectangle',
          opacity: 1.0
        },
        behavior: {
          renderMode: 'card',
          interactions: { draggable: true },
          viewport: { zoom: 1.0, panX: 0, panY: 0 }
        },
        metadata: {
          tags: ['test', 'validation'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        }
      };

      expect(() => validateAssetStrict(validAsset)).not.toThrow();
    });

    it('should throw on assets with forbidden fields', () => {
      const invalidAsset = {
        id: 'test-2',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 },
        sync_status: 'dirty' // ❌ Forbidden
      };

      expect(() => validateAssetStrict(invalidAsset)).toThrow('Asset validation failed');
      expect(() => validateAssetStrict(invalidAsset)).toThrow('sync_status');
    });

    it('should throw on assets with missing required sections', () => {
      const incompleteAsset = {
        id: 'test-3',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 }
        // Missing content, style, behavior, metadata
      };

      expect(() => validateAssetStrict(incompleteAsset)).toThrow('Asset validation failed');
    });

    it('should throw on malformed asset structures', () => {
      const malformedAsset = {
        id: 'test-4',
        projectId: 'project-1',
        layout: 'not-an-object', // ❌ Should be object
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      expect(() => validateAssetStrict(malformedAsset)).toThrow('Asset validation failed');
    });

    it('should handle null and undefined inputs', () => {
      expect(() => validateAssetStrict(null)).toThrow('Asset validation failed');
      expect(() => validateAssetStrict(undefined)).toThrow('Asset validation failed');
      expect(() => validateAssetStrict({} as any)).toThrow('Asset validation failed');
    });
  });

  describe('isCanonicalAsset', () => {
    it('should return true for valid canonical assets', () => {
      const validAsset: Asset = {
        id: 'test-5',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      expect(isCanonicalAsset(validAsset)).toBe(true);
    });

    it('should return false for invalid assets', () => {
      const invalidAsset = {
        id: 'test-6',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 },
        sync_status: 'dirty' // ❌ Forbidden
      };

      expect(isCanonicalAsset(invalidAsset)).toBe(false);
    });

    it('should return false for non-asset objects', () => {
      expect(isCanonicalAsset(null)).toBe(false);
      expect(isCanonicalAsset(undefined)).toBe(false);
      expect(isCanonicalAsset({})).toBe(false);
      expect(isCanonicalAsset({ id: 'test' })).toBe(false);
      expect(isCanonicalAsset('not-an-object')).toBe(false);
      expect(isCanonicalAsset(123)).toBe(false);
    });

    it('should return false for assets with missing sections', () => {
      const incompleteAsset = {
        id: 'test-7',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 }
        // Missing required sections
      };

      expect(isCanonicalAsset(incompleteAsset)).toBe(false);
    });
  });

  describe('validateAssetStructure Detailed Validation', () => {
    it('should detect all types of violations in a single asset', () => {
      const problematicAsset = {
        id: 'test-8',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { 
          title: 'Test',
          customFields: {
            sync_status: 'dirty', // ❌ Forbidden in nested
            selected: true // ❌ Forbidden in nested
          }
        },
        style: {},
        behavior: { renderMode: 'image' }, // ⚠️ Suspicious
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 },
        // Multiple forbidden fields at top level
        sync_status: 'dirty',
        upload_progress: 0.5,
        selected: true,
        hovered: false,
        file: new Blob(['test'])
      };

      const violations = validateAssetStructure(problematicAsset);
      
      // Should detect multiple violations
      expect(violations.length).toBeGreaterThan(5);
      
      // Check for specific violation types
      expect(violations.some(v => v.field === 'sync_status')).toBe(true);
      expect(violations.some(v => v.field === 'upload_progress')).toBe(true);
      expect(violations.some(v => v.field === 'selected')).toBe(true);
      expect(violations.some(v => v.field === 'hovered')).toBe(true);
      expect(violations.some(v => v.field === 'file')).toBe(true);
      expect(violations.some(v => v.field === 'content.customFields.sync_status')).toBe(true);
      expect(violations.some(v => v.field === 'content.customFields.selected')).toBe(true);
      
      // Check for warnings
      const warnings = violations.filter(v => v.severity === 'warning');
      expect(warnings.some(v => v.field === 'behavior.renderMode')).toBe(true);
      
      // Check for errors
      const errors = violations.filter(v => v.severity === 'error');
      expect(errors.length).toBeGreaterThan(5);
    });

    it('should provide detailed violation information', () => {
      const invalidAsset = {
        id: 'test-9',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 },
        sync_status: 'dirty'
      };

      const violations = validateAssetStructure(invalidAsset);
      const syncViolation = violations.find(v => v.field === 'sync_status');
      
      expect(syncViolation).toBeDefined();
      expect(syncViolation?.type).toBe('field_name');
      expect(syncViolation?.severity).toBe('error');
      expect(syncViolation?.message).toContain('sync_status');
      expect(syncViolation?.message).toContain('state separation');
    });

    it('should handle case-insensitive forbidden field detection', () => {
      const invalidAsset = {
        id: 'test-10',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 },
        SYNC_STATUS: 'dirty', // ❌ Should be caught
        Selected: true, // ❌ Should be caught
        upload_progress: 0.5 // ❌ Should be caught
      };

      const violations = validateAssetStructure(invalidAsset);
      expect(violations.some(v => v.field === 'SYNC_STATUS')).toBe(true);
      expect(violations.some(v => v.field === 'Selected')).toBe(true);
      expect(violations.some(v => v.field === 'upload_progress')).toBe(true);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large assets efficiently', () => {
      const largeAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { 
          title: 'Large Asset',
          customFields: {}
        },
        style: {},
        behavior: {},
        metadata: { 
          tags: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        }
      };

      // Add many custom fields to test performance
      for (let i = 0; i < 1000; i++) {
        largeAsset.content.customFields[`field_${i}`] = `value_${i}`;
      }

      const startTime = performance.now();
      const isValid = isCanonicalAsset(largeAsset);
      const endTime = performance.now();

      expect(isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in <100ms
    });

    it('should handle deeply nested structures', () => {
      const deeplyNestedAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { 
          title: 'Nested Asset',
          customFields: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: 'deep value'
                  }
                }
              }
            }
          }
        },
        style: {},
        behavior: {},
        metadata: { 
          tags: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        }
      };

      expect(() => validateAssetStrict(deeplyNestedAsset)).not.toThrow();
      expect(isCanonicalAsset(deeplyNestedAsset)).toBe(true);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle assets with minimal valid structure', () => {
      const minimalAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614174003',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: {},
        style: {},
        behavior: {},
        metadata: { 
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        }
      };

      expect(() => validateAssetStrict(minimalAsset)).not.toThrow();
      expect(isCanonicalAsset(minimalAsset)).toBe(true);
    });

    it('should handle assets with all optional fields', () => {
      const fullAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614174004',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        parentId: '123e4567-e89b-12d3-a456-426614174005',
        layout: { 
          x: 0, y: 0, width: 100, height: 100, 
          scale: 1.5, rotation: 45, zIndex: 10 
        },
        content: { 
          title: 'Full Asset',
          description: 'Complete asset with all fields',
          imageUrl: 'https://example.com/image.jpg',
          text: 'Some text content',
          customFields: { category: 'test', priority: 'high' }
        },
        style: {
          background: { color: 'blue', gradient: 'linear' },
          tagColor: 'red',
          border: { width: 2, style: 'solid', color: 'black' },
          shape: 'rounded',
          opacity: 0.8
        },
        behavior: {
          renderMode: 'card',
          interactions: { 
            draggable: true, 
            resizable: false, 
            clickable: true 
          },
          viewport: { zoom: 1.5, panX: 100, panY: 200 }
        },
        metadata: {
          tags: ['tag1', 'tag2', 'tag3'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 5
        }
      };

      expect(() => validateAssetStrict(fullAsset)).not.toThrow();
      expect(isCanonicalAsset(fullAsset)).toBe(true);
    });

    it('should handle circular references gracefully', () => {
      const circularAsset: any = {
        id: 'test-circular',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test' },
        style: {},
        behavior: {},
        metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-01', version: 1 }
      };

      // Create circular reference
      circularAsset.self = circularAsset;

      // Should handle circular references without infinite loops
      const violations = validateAssetStructure(circularAsset);
      expect(violations.length).toBeGreaterThanOrEqual(0); // Should not crash
    });
  });

  describe('Integration with Type System', () => {
    it('should work with TypeScript Asset type', () => {
      const typedAsset: Asset = {
        id: '123e4567-e89b-12d3-a456-426614174006',
        projectId: '123e4567-e89b-12d3-a456-426614174001',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Typed Asset' },
        style: {},
        behavior: {},
        metadata: { 
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        }
      };

      expect(isCanonicalAsset(typedAsset)).toBe(true);
      expect(() => validateAssetStrict(typedAsset)).not.toThrow();
    });

    it('should catch runtime violations even with TypeScript types', () => {
      // TypeScript can't catch this at compile time, but runtime validation should
      const runtimeInvalidAsset = {
        id: 'test-runtime',
        projectId: 'project-1',
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Runtime Invalid' },
        style: {},
        behavior: {},
        metadata: { 
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1
        },
        // Runtime added forbidden field
        sync_status: 'dirty'
      } as Asset; // Type assertion bypasses TypeScript checks

      expect(() => validateAssetStrict(runtimeInvalidAsset)).toThrow();
      expect(isCanonicalAsset(runtimeInvalidAsset)).toBe(false);
    });
  });
});
