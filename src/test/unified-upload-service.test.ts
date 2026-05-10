/**
 * UnifiedUploadService Integration Tests
 * 
 * These tests verify that the UnifiedUploadService works correctly
 * and maintains all existing functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unifiedUploadService } from '@/services/UnifiedUploadService';

describe('UnifiedUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Backend Selection', () => {
    it('should select R2 backend when configured', () => {
      const status = unifiedUploadService.getStatus();
      expect(status.availableBackends).toContain('r2');
      expect(status.availableBackends).toContain('supabase');
    });

    it('should check backend availability', () => {
      expect(unifiedUploadService.isBackendAvailable('r2')).toBe(true);
      expect(unifiedUploadService.isBackendAvailable('supabase')).toBe(true);
      expect(unifiedUploadService.isBackendAvailable('auto')).toBe(true);
    });
  });

  describe('Upload Interface', () => {
    it('should have all required methods', () => {
      expect(typeof unifiedUploadService.upload).toBe('function');
      expect(typeof unifiedUploadService.uploadWithVariants).toBe('function');
      expect(typeof unifiedUploadService.uploadBatch).toBe('function');
      expect(typeof unifiedUploadService.retryUpload).toBe('function');
      expect(typeof unifiedUploadService.getPublicUrl).toBe('function');
      expect(typeof unifiedUploadService.onCloudRetry).toBe('function');
    });
  });

  describe('Legacy Compatibility', () => {
    it('should maintain legacy uploadFile method', () => {
      expect(typeof unifiedUploadService.uploadFile).toBe('function');
    });

    it('should maintain legacy uploadFileLegacy method', () => {
      expect(typeof unifiedUploadService.uploadFileLegacy).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid backend selection', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      // This should not throw but return an error result
      const result = await unifiedUploadService.upload(mockFile, {
        projectId: 'test-project',
        backend: 'invalid' as any
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should return correct service status', () => {
      const status = unifiedUploadService.getStatus();
      
      expect(status).toHaveProperty('r2Configured');
      expect(status).toHaveProperty('availableBackends');
      expect(status).toHaveProperty('defaultBackend');
      expect(Array.isArray(status.availableBackends)).toBe(true);
    });
  });
});
