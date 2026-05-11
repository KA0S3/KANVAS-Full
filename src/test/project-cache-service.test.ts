/**
 * Project Cache Service Tests
 * 
 * Tests to verify project cache service integration with existing stores
 * and race condition elimination.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { projectCacheService } from '@/services/projectCacheService';
import { documentMutationService } from '@/services/DocumentMutationService';

// Mock localCache utility
vi.mock('@/utils/localCache', () => ({
  localCache: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    isValid: vi.fn()
  }
}));

// Mock supabase
const mockSupabase = {
  auth: {
    getUser: () => Promise.resolve({ 
      data: { 
        user: { 
          id: 'test-user-id',
          email: 'test@example.com' 
        } 
      } 
    })
  }
};

describe('Project Cache Service', () => {
  beforeEach(() => {
    // Setup mocks
    vi.clearAllMocks();
    projectCacheService.clearCache();
  });

  afterEach(() => {
    projectCacheService.clearCache();
  });

  describe('Cache Operations', () => {
    it('should store and retrieve project data', () => {
      const testProject = {
        id: 'test-project-1',
        name: 'Test Project',
        description: 'Test Description',
        asset_count: 5,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      // Add project to cache
      projectCacheService.addProject(testProject);

      // Retrieve project
      const retrieved = projectCacheService.getProject('test-project-1');
      
      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe('test-project-1');
      expect(retrieved?.name).toBe('Test Project');
    });

    it('should return null for non-existent project', () => {
      const result = projectCacheService.getProject('non-existent');
      expect(result).toBeNull();
    });

    it('should invalidate cache correctly', () => {
      const testProject = {
        id: 'test-project-2',
        name: 'Test Project 2',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      projectCacheService.addProject(testProject);
      expect(projectCacheService.hasProject('test-project-2')).toBe(true);

      projectCacheService.invalidateProject('test-project-2');
      expect(projectCacheService.hasProject('test-project-2')).toBe(false);
    });
  });

  describe('Integration with DocumentMutationService', () => {
    it('should provide fallback project ID when currentProjectId is null', () => {
      const testProject = {
        id: 'fallback-project',
        name: 'Fallback Project',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      // Add project to cache
      projectCacheService.addProject(testProject);

      // Mock DocumentMutationService to have no current project
      documentMutationService.setProjectId(null);

      // Should return cached project ID
      const fallbackId = documentMutationService.getCurrentProjectId();
      expect(fallbackId).toBe('fallback-project');
    });

    it('should return currentProjectId when set', () => {
      // Set current project in DocumentMutationService
      documentMutationService.setProjectId('current-project-id');

      // Should return current project ID, not from cache
      const currentId = documentMutationService.getCurrentProjectId();
      expect(currentId).toBe('current-project-id');
    });
  });

  describe('Cache Statistics', () => {
    it('should provide accurate cache statistics', () => {
      const stats = projectCacheService.getCacheStats();
      
      expect(stats.projectCount).toBe(0);
      expect(stats.isStale).toBe(true);
      expect(stats.lastUpdated).toBe(0);
    });

    it('should detect stale cache correctly', () => {
      const oldProject = {
        id: 'old-project',
        name: 'Old Project',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2023-01-01T00:00:00Z', // Very old
        cached_at: Date.now() - (20 * 60 * 1000) // 20 minutes ago
      };

      projectCacheService.addProject(oldProject);

      const stats = projectCacheService.getCacheStats();
      expect(stats.isStale).toBe(true);
      expect(stats.projectCount).toBe(1);
    });
  });

  describe('Cache Size Management', () => {
    it('should provide cache size estimate', () => {
      const testProject = {
        id: 'size-test-project',
        name: 'Size Test Project',
        description: 'A' .repeat(100), // Make it larger
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      projectCacheService.addProject(testProject);

      const size = projectCacheService.getCacheSize();
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(1024 * 1024); // Should be less than 1MB
    });
  });
});
