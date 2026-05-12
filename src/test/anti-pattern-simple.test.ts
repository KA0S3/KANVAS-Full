/**
 * SIMPLE ANTI-PATTERN DETECTION TEST
 * 
 * Basic test to verify anti-pattern detection is working
 * without complex schema validation issues.
 */

import { describe, it, expect } from 'vitest';
import { validateAssetStructure } from '../types/Safeguards';

describe('Simple Anti-Pattern Detection', () => {
  it('should detect forbidden fields in basic objects', () => {
    // Test with a simple object that doesn't need full Asset schema validation
    const testObject = {
      id: 'test-id',
      projectId: 'test-project',
      layout: { x: 0, y: 0, width: 100, height: 100 },
      content: { title: 'Test' },
      style: {},
      behavior: {},
      metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
      sync_status: 'dirty', // ❌ Forbidden
      selected: true, // ❌ Forbidden
      upload_progress: 0.5 // ❌ Forbidden
    };

    const violations = validateAssetStructure(testObject);
    
    // Should detect multiple violations
    expect(violations.length).toBeGreaterThan(0);
    
    // Check for specific forbidden fields
    expect(violations.some(v => v.field === 'sync_status')).toBe(true);
    expect(violations.some(v => v.field === 'selected')).toBe(true);
    expect(violations.some(v => v.field === 'upload_progress')).toBe(true);
    
    // All should be error severity
    expect(violations.every(v => v.severity === 'error')).toBe(true);
  });

  it('should detect UI state pollution', () => {
    const testObject = {
      id: 'test-id',
      projectId: 'test-project',
      layout: { x: 0, y: 0, width: 100, height: 100 },
      content: { title: 'Test' },
      style: {},
      behavior: {},
      metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
      hovered: false, // ❌ UI state
      dragging: false, // ❌ UI state
      focused: false // ❌ UI state
    };

    const violations = validateAssetStructure(testObject);
    
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some(v => v.field === 'hovered')).toBe(true);
    expect(violations.some(v => v.field === 'dragging')).toBe(true);
    expect(violations.some(v => v.field === 'focused')).toBe(true);
  });

  it('should detect embedded files', () => {
    const testObject = {
      id: 'test-id',
      projectId: 'test-project',
      layout: { x: 0, y: 0, width: 100, height: 100 },
      content: { title: 'Test' },
      style: {},
      behavior: {},
      metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 },
      file: new Blob(['test']), // ❌ Embedded file
      blob: new Uint8Array([1, 2, 3]) // ❌ Embedded blob
    };

    const violations = validateAssetStructure(testObject);
    
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some(v => v.field === 'file')).toBe(true);
    expect(violations.some(v => v.field === 'blob')).toBe(true);
  });

  it('should accept clean objects without violations', () => {
    const cleanObject = {
      id: 'test-id',
      projectId: 'test-project',
      layout: { x: 0, y: 0, width: 100, height: 100 },
      content: { title: 'Test' },
      style: {},
      behavior: {},
      metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 }
    };

    const violations = validateAssetStructure(cleanObject);
    
    // Should have no forbidden field violations (may have schema warnings)
    const forbiddenViolations = violations.filter(v => v.type === 'field_name');
    expect(forbiddenViolations.length).toBe(0);
  });

  it('should detect nested forbidden fields', () => {
    const testObject = {
      id: 'test-id',
      projectId: 'test-project',
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
      metadata: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1 }
    };

    const violations = validateAssetStructure(testObject);
    
    expect(violations.some(v => v.field === 'content.customFields.sync_status')).toBe(true);
    expect(violations.some(v => v.field === 'content.customFields.selected')).toBe(true);
  });
});
