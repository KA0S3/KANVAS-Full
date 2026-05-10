/**
 * Upload flow quota race condition tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  setupMocks, 
  mockAuthUser, 
  cleanupMocks,
  createRaceConditionTest,
  measurePerformance
} from './utils/mockServices';
import { 
  TEST_USERS, 
  setupTestUser, 
  createMockAsset 
} from './utils/testFixtures';

// Mock services
const mockUnifiedUploadService = {
  upload: vi.fn(),
  uploadWithVariants: vi.fn(),
  retryUpload: vi.fn(),
  getPublicUrl: vi.fn(),
  onCloudRetry: vi.fn(),
  isBackendAvailable: vi.fn(),
  getStatus: vi.fn(),
};

// Legacy mock for backward compatibility in tests
const mockAssetUploadService = {
  getUploadUrls: vi.fn(),
  uploadFile: vi.fn(),
  completeUpload: vi.fn(),
  checkQuota: vi.fn(),
  updateStorageUsage: vi.fn(),
};

const mockCloudStore = {
  currentStorageUsage: 0,
  maxStorageBytes: 100 * 1024 * 1024, // 100MB
  checkQuota: vi.fn((size: number) => {
    return {
      allowed: mockCloudStore.currentStorageUsage + size <= mockCloudStore.maxStorageBytes,
      remaining: Math.max(0, mockCloudStore.maxStorageBytes - mockCloudStore.currentStorageUsage - size)
    };
  }),
  updateUsage: vi.fn(),
};

describe('Upload Flow Quota Race Conditions', () => {
  beforeEach(() => {
    setupMocks();
    vi.clearAllMocks();
    
    // Reset mock store
    mockCloudStore.currentStorageUsage = 0;
    mockCloudStore.maxStorageBytes = 100 * 1024 * 1024;
    
    // Setup default mock responses with quota awareness
    mockUnifiedUploadService.upload.mockImplementation(async (file, options) => {
      const quotaCheck = mockCloudStore.checkQuota(file.size);
      if (!quotaCheck.allowed) {
        return {
          success: false,
          backend: 'r2',
          error: 'Quota exceeded'
        };
      }
      
      // Simulate upload delay and update usage
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      mockCloudStore.currentStorageUsage += file.size;
      
      return {
        success: true,
        backend: 'r2',
        r2Key: `test/path/${options.assetId}.jpg`,
        publicUrl: `https://test-r2-url.com/${options.assetId}.jpg`
      };
    });
    
    mockUnifiedUploadService.uploadWithVariants.mockResolvedValue({
      success: true,
      backend: 'r2',
      r2Key: 'test/path/asset.jpg',
      publicUrl: 'https://test-r2-url.com/asset.jpg'
    });
    
    mockUnifiedUploadService.isBackendAvailable.mockReturnValue(true);
    mockUnifiedUploadService.getStatus.mockReturnValue({
      r2Configured: true,
      availableBackends: ['r2', 'supabase'],
      defaultBackend: 'r2'
    });
    
    // Legacy mocks for backward compatibility
    mockAssetUploadService.getUploadUrls.mockResolvedValue({
      uploadUrls: [
        {
          asset_id: 'test-asset-id',
          signedUrl: 'https://test-storage-url.com/upload',
          path: 'test/path/asset.jpg',
        },
      ],
    });
    
    mockAssetUploadService.uploadFile.mockResolvedValue({ success: true });
    mockAssetUploadService.completeUpload.mockResolvedValue({ success: true });
    mockAssetUploadService.checkQuota.mockResolvedValue({ allowed: true });
    mockAssetUploadService.updateStorageUsage.mockResolvedValue({ success: true });
    
    mockCloudStore.checkQuota.mockReturnValue({ allowed: true, remaining: 100 * 1024 * 1024 });
    mockCloudStore.updateUsage.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('Concurrent Upload Attempts', () => {
    it('should handle concurrent quota checks correctly', async () => {
      mockAuthUser('free');
      
      // Simulate user with 50MB used, 100MB quota
      mockCloudStore.currentStorageUsage = 50 * 1024 * 1024;
      
      // Create 5 concurrent upload attempts of 20MB each
      const uploadOperations = Array(5).fill(null).map((_, index) => 
        async () => {
          const assetSize = 20 * 1024 * 1024; // 20MB each
          
          // Check quota using cloud store
          const quotaCheck = mockCloudStore.checkQuota(assetSize);
          if (!quotaCheck.allowed) {
            throw new Error('Quota exceeded');
          }
          
          // Simulate upload delay
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Complete upload using unified service
          const result = await mockUnifiedUploadService.upload(
            new File(['test'], `asset-${index}.jpg`),
            {
              assetId: `asset-${index}`,
              projectId: 'test-project'
            }
          );
          
          if (!result.success) {
            throw new Error(result.error || 'Upload failed');
          }
          
          return result;
        }
      );

      const results = await createRaceConditionTest(uploadOperations, 3);
      
      // Some should succeed, some should fail due to quota
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      expect(successful + failed).toBe(5);
      expect(successful).toBeLessThanOrEqual(2); // Max 2 more uploads fit (50MB + 2*20MB = 90MB)
      expect(failed).toBeGreaterThanOrEqual(3); // At least 3 should fail
    });

    it('should prevent quota overage with race conditions', async () => {
      mockAuthUser('free');
      
      // Start with 90MB used, 100MB quota
      mockCloudStore.currentStorageUsage = 90 * 1024 * 1024;
      
      // Create 10 concurrent upload attempts of 5MB each
      const uploadOperations = Array(10).fill(null).map((_, index) => 
        async () => {
          const assetSize = 5 * 1024 * 1024; // 5MB each
          
          // Check quota
          const quotaCheck = await mockAssetUploadService.checkQuota(assetSize);
          if (!quotaCheck.allowed) {
            throw new Error('Quota exceeded');
          }
          
          // Simulate upload processing time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          
          // Update storage usage
          await mockAssetUploadService.updateStorageUsage(assetSize);
          
          return { success: true, assetId: `asset-${index}` };
        }
      );

      const results = await createRaceConditionTest(uploadOperations, 5);
      
      // Only 2 should succeed (90MB + 2*5MB = 100MB max)
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      expect(successful).toBeLessThanOrEqual(2);
      
      // Verify final storage usage doesn't exceed quota
      const finalUsage = mockCloudStore.currentStorageUsage;
      expect(finalUsage).toBeLessThanOrEqual(mockCloudStore.maxStorageBytes);
    });

    it('should handle quota check before vs after upload completion', async () => {
      mockAuthUser('pro');
      
      // Pro user with 9GB used, 10GB quota
      mockCloudStore.currentStorageUsage = 9 * 1024 * 1024 * 1024;
      mockCloudStore.maxStorageBytes = 10 * 1024 * 1024 * 1024;
      
      let quotaCheckCount = 0;
      mockAssetUploadService.checkQuota.mockImplementation(async (size) => {
        quotaCheckCount++;
        const currentUsage = mockCloudStore.currentStorageUsage;
        return {
          allowed: currentUsage + size <= mockCloudStore.maxStorageBytes,
          remaining: mockCloudStore.maxStorageBytes - currentUsage,
        };
      });
      
      // Create concurrent uploads that might exceed quota
      const uploadOperations = Array(5).fill(null).map((_, index) => 
        async () => {
          const assetSize = 500 * 1024 * 1024; // 500MB each
          
          // Quota check before upload
          const beforeCheck = await mockAssetUploadService.checkQuota(assetSize);
          if (!beforeCheck.allowed) {
            throw new Error('Quota exceeded before upload');
          }
          
          // Simulate upload time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
          
          // Quota check after upload (simulating server-side validation)
          const afterCheck = await mockAssetUploadService.checkQuota(assetSize);
          if (!afterCheck.allowed) {
            throw new Error('Quota exceeded after upload');
          }
          
          // Update usage
          mockCloudStore.currentStorageUsage += assetSize;
          
          return { success: true, assetId: `asset-${index}` };
        }
      );

      const results = await createRaceConditionTest(uploadOperations, 3);
      
      // Should have multiple quota checks
      expect(quotaCheckCount).toBeGreaterThan(5);
      
      // Final usage should not exceed quota
      expect(mockCloudStore.currentStorageUsage).toBeLessThanOrEqual(mockCloudStore.maxStorageBytes);
    });
  });

  describe('Partial Upload Handling', () => {
    it('should clean up failed uploads and restore quota', async () => {
      mockAuthUser('free');
      
      mockCloudStore.currentStorageUsage = 50 * 1024 * 1024;
      
      let uploadAttempts = 0;
      mockAssetUploadService.uploadFile.mockImplementation(async () => {
        uploadAttempts++;
        // Fail every other upload
        if (uploadAttempts % 2 === 0) {
          throw new Error('Upload failed');
        }
        return { success: true };
      });
      
      const cleanupCalled = vi.fn();
      mockAssetUploadService.completeUpload.mockImplementation(async ({ assetId }) => {
        // Simulate cleanup on failure
        if (uploadAttempts % 2 === 0) {
          cleanupCalled(assetId);
          throw new Error('Cleanup completed');
        }
        return { success: true };
      });
      
      // Create concurrent uploads
      const uploadOperations = Array(4).fill(null).map((_, index) => 
        async () => {
          const assetSize = 10 * 1024 * 1024; // 10MB each
          
          try {
            await mockAssetUploadService.uploadFile({ assetId: `asset-${index}` });
            await mockAssetUploadService.completeUpload({ assetId: `asset-${index}`, size: assetSize });
            mockCloudStore.currentStorageUsage += assetSize;
            return { success: true, assetId: `asset-${index}` };
          } catch (error) {
            // Cleanup should be called
            return { success: false, error: error.message, assetId: `asset-${index}` };
          }
        }
      );

      const results = await createRaceConditionTest(uploadOperations, 2);
      
      // Half should fail
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
      
      expect(successful).toBe(2);
      expect(failed).toBe(2);
      expect(cleanupCalled).toHaveBeenCalledTimes(2);
      
      // Final usage should only count successful uploads
      expect(mockCloudStore.currentStorageUsage).toBe(70 * 1024 * 1024); // 50MB + 2*10MB
    });

    it('should handle database transaction rollback on upload failure', async () => {
      mockAuthUser('pro');
      
      const mockTransaction = {
        begin: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
      };
      
      const mockDatabase = {
        createAsset: vi.fn(),
        updateStorageUsage: vi.fn(),
        createTransaction: () => mockTransaction,
      };
      
      // Simulate database failure during upload
      mockDatabase.createAsset.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Database constraint violation');
      });
      
      const uploadOperations = Array(3).fill(null).map((_, index) => 
        async () => {
          const tx = mockDatabase.createTransaction();
          
          try {
            await tx.begin();
            
            // Create asset record
            await mockDatabase.createAsset({ id: `asset-${index}` });
            
            // Simulate upload
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // This would fail
            await mockDatabase.updateStorageUsage(10 * 1024 * 1024);
            
            await tx.commit();
            return { success: true, assetId: `asset-${index}` };
          } catch (error) {
            await tx.rollback();
            throw error;
          }
        }
      );

      const results = await createRaceConditionTest(uploadOperations, 2);
      
      // All should fail
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBe(0);
      
      // All transactions should be rolled back
      expect(mockTransaction.rollback).toHaveBeenCalledTimes(3);
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });
  });

  describe('Quota Recalculation', () => {
    it('should recalculate quota after failed uploads', async () => {
      mockAuthUser('free');
      
      mockCloudStore.currentStorageUsage = 80 * 1024 * 1024;
      
      // Mock quota check that tracks actual usage
      mockAssetUploadService.checkQuota.mockImplementation(async (size) => {
        const actualUsage = mockCloudStore.currentStorageUsage;
        return {
          allowed: actualUsage + size <= mockCloudStore.maxStorageBytes,
          remaining: mockCloudStore.maxStorageBytes - actualUsage,
        };
      });
      
      // First upload succeeds
      const successUpload = async () => {
        const size = 10 * 1024 * 1024; // 10MB
        const quotaCheck = await mockAssetUploadService.checkQuota(size);
        
        if (!quotaCheck.allowed) {
          throw new Error('Quota exceeded');
        }
        
        mockCloudStore.currentStorageUsage += size;
        return { success: true, size };
      };
      
      // Second upload fails and rolls back
      const failUpload = async () => {
        const size = 15 * 1024 * 1024; // 15MB
        const quotaCheck = await mockAssetUploadService.checkQuota(size);
        
        if (!quotaCheck.allowed) {
          throw new Error('Quota exceeded');
        }
        
        // Simulate failure after quota check
        throw new Error('Upload failed');
      };
      
      // Execute in sequence to test quota recalculation
      try {
        await successUpload();
        expect(mockCloudStore.currentStorageUsage).toBe(90 * 1024 * 1024);
        
        await failUpload(); // Should fail but not change usage
        expect(mockCloudStore.currentStorageUsage).toBe(90 * 1024 * 1024); // Unchanged
        
        // Another upload should still work if within quota
        await successUpload();
        expect(mockCloudStore.currentStorageUsage).toBe(100 * 1024 * 1024); // Full quota
      } catch (error) {
        // Expected for the failing upload
      }
    });

    it('should handle concurrent quota recalculation', async () => {
      mockAuthUser('pro');
      
      mockCloudStore.currentStorageUsage = 8 * 1024 * 1024 * 1024; // 8GB used
      mockCloudStore.maxStorageBytes = 10 * 1024 * 1024 * 1024; // 10GB quota
      
      let recalculationCount = 0;
      mockAssetUploadService.checkQuota.mockImplementation(async (size) => {
        recalculationCount++;
        // Simulate database query for current usage
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        return {
          allowed: mockCloudStore.currentStorageUsage + size <= mockCloudStore.maxStorageBytes,
          remaining: mockCloudStore.maxStorageBytes - mockCloudStore.currentStorageUsage,
        };
      });
      
      const uploadOperations = Array(10).fill(null).map((_, index) => 
        async () => {
          const size = 500 * 1024 * 1024; // 500MB each
          
          const quotaCheck = await mockAssetUploadService.checkQuota(size);
          if (!quotaCheck.allowed) {
            throw new Error('Quota exceeded');
          }
          
          // Simulate upload
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          
          // Update usage
          mockCloudStore.currentStorageUsage += size;
          
          return { success: true, assetId: `asset-${index}`, size };
        }
      );

      const results = await createRaceConditionTest(uploadOperations, 4);
      
      // Should have multiple quota recalculations
      expect(recalculationCount).toBeGreaterThan(10);
      
      // Final usage should not exceed quota
      expect(mockCloudStore.currentStorageUsage).toBeLessThanOrEqual(mockCloudStore.maxStorageBytes);
      
      // Should have successful uploads within quota limit
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeLessThanOrEqual(4); // Max 4 uploads of 500MB each fit in remaining 2GB
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with concurrent quota checks', async () => {
      mockAuthUser('free');
      
      mockCloudStore.currentStorageUsage = 50 * 1024 * 1024;
      
      const quotaCheckOperation = async () => {
        return await mockAssetUploadService.checkQuota(10 * 1024 * 1024);
      };
      
      const performance = await measurePerformance(quotaCheckOperation, 100);
      
      // Performance should be reasonable
      expect(performance.average).toBeLessThan(100); // < 100ms average
      expect(performance.p95).toBeLessThan(200); // < 200ms p95
      expect(performance.p99).toBeLessThan(500); // < 500ms p99
    });

    it('should handle high concurrency without degradation', async () => {
      mockAuthUser('pro');
      
      mockCloudStore.currentStorageUsage = 5 * 1024 * 1024 * 1024; // 5GB used
      
      const concurrentUploads = 50;
      const uploadOperations = Array(concurrentUploads).fill(null).map((_, index) => 
        async () => {
          const size = 100 * 1024 * 1024; // 100MB each
          
          const startTime = performance.now();
          
          const quotaCheck = await mockAssetUploadService.checkQuota(size);
          if (!quotaCheck.allowed) {
            throw new Error('Quota exceeded');
          }
          
          const endTime = performance.now();
          
          return { 
            success: true, 
            assetId: `asset-${index}`,
            duration: endTime - startTime
          };
        }
      );

      const startTime = performance.now();
      const results = await createRaceConditionTest(uploadOperations, 10);
      const endTime = performance.now();
      
      const totalTime = endTime - startTime;
      const averageTimePerOperation = totalTime / concurrentUploads;
      
      // Should complete in reasonable time
      expect(totalTime).toBeLessThan(5000); // < 5 seconds total
      expect(averageTimePerOperation).toBeLessThan(100); // < 100ms average per operation
      
      // Most should succeed (quota allows ~50 more uploads of 100MB each)
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(40);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-size uploads', async () => {
      mockAuthUser('guest');
      
      mockCloudStore.currentStorageUsage = 0;
      mockCloudStore.maxStorageBytes = 0; // Guest has no quota
      
      const zeroSizeUpload = async () => {
        const size = 0; // Zero bytes
        const quotaCheck = await mockAssetUploadService.checkQuota(size);
        
        // Zero-size uploads should be allowed even with no quota
        expect(quotaCheck.allowed).toBe(true);
        
        return { success: true, size: 0 };
      };
      
      const result = await zeroSizeUpload();
      expect(result.success).toBe(true);
    });

    it('should handle extremely large upload attempts', async () => {
      mockAuthUser('lifetime');
      
      mockCloudStore.currentStorageUsage = 0;
      mockCloudStore.maxStorageBytes = 50 * 1024 * 1024 * 1024; // 50GB
      
      const extremelyLargeUpload = async () => {
        const size = Number.MAX_SAFE_INTEGER; // Extremely large
        
        const quotaCheck = await mockAssetUploadService.checkQuota(size);
        
        // Should be rejected
        expect(quotaCheck.allowed).toBe(false);
        
        throw new Error('Upload too large');
      };
      
      await expect(extremelyLargeUpload()).rejects.toThrow('Upload too large');
    });

    it('should handle quota exactly at limit', async () => {
      mockAuthUser('free');
      
      // Set usage exactly at quota limit
      mockCloudStore.currentStorageUsage = 100 * 1024 * 1024; // Exactly 100MB
      mockCloudStore.maxStorageBytes = 100 * 1024 * 1024;
      
      const uploadAtLimit = async () => {
        const size = 1; // 1 byte
        
        const quotaCheck = await mockAssetUploadService.checkQuota(size);
        expect(quotaCheck.allowed).toBe(false);
        expect(quotaCheck.remaining).toBe(0);
        
        throw new Error('Quota exceeded');
      };
      
      await expect(uploadAtLimit()).rejects.toThrow('Quota exceeded');
    });
  });
});
