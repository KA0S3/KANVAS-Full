/**
 * Project Cache Service Integration Tests
 * 
 * Simple integration tests to verify project cache service works correctly
 * with actual localStorage and real service instances.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { projectCacheService } from '@/services/projectCacheService';

describe('Project Cache Service Integration', () => {
  beforeEach(() => {
    // Clear cache before each test
    projectCacheService.clearCache();
  });

  afterEach(() => {
    // Clean up after each test
    projectCacheService.clearCache();
  });

  describe('Basic Cache Operations', () => {
    it('should handle empty cache correctly', () => {
      const stats = projectCacheService.getCacheStats();
      
      expect(stats.projectCount).toBe(0);
      expect(stats.isStale).toBe(true);
      expect(stats.lastUpdated).toBe(0);
    });

    it('should validate cache integrity', () => {
      const validation = projectCacheService.validateCache();
      
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should provide cache size estimate', () => {
      const size = projectCacheService.getCacheSize();
      
      expect(size).toBeGreaterThanOrEqual(0);
      expect(size).toBeLessThan(1024 * 1024); // Less than 1MB
    });
  });

  describe('Project Management', () => {
    it('should add and retrieve projects', () => {
      const testProject = {
        id: 'integration-test-project',
        name: 'Integration Test Project',
        description: 'Test Description',
        asset_count: 10,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      // Add project
      projectCacheService.addProject(testProject);

      // Verify project exists
      expect(projectCacheService.hasProject('integration-test-project')).toBe(true);

      // Retrieve project
      const retrieved = projectCacheService.getProject('integration-test-project');
      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe('integration-test-project');
      expect(retrieved?.name).toBe('Integration Test Project');
    });

    it('should update existing projects', () => {
      const testProject = {
        id: 'update-test-project',
        name: 'Original Name',
        description: null,
        asset_count: 5,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      // Add initial project
      projectCacheService.addProject(testProject);

      // Update project
      projectCacheService.updateProject('update-test-project', {
        name: 'Updated Name',
        asset_count: 8
      });

      // Verify update
      const updated = projectCacheService.getProject('update-test-project');
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.asset_count).toBe(8);
    });

    it('should remove projects', () => {
      const testProject = {
        id: 'remove-test-project',
        name: 'Remove Test Project',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      // Add project
      projectCacheService.addProject(testProject);
      expect(projectCacheService.hasProject('remove-test-project')).toBe(true);

      // Remove project
      projectCacheService.removeProject('remove-test-project');
      expect(projectCacheService.hasProject('remove-test-project')).toBe(false);
    });

    it('should search projects correctly', () => {
      const projects = [
        {
          id: 'search-test-1',
          name: 'Alpha Project',
          description: 'First test project',
          asset_count: 1,
          last_version: 1,
          updated_at: '2024-01-01T00:00:00Z',
          cached_at: Date.now()
        },
        {
          id: 'search-test-2',
          name: 'Beta Project',
          description: 'Second test project',
          asset_count: 2,
          last_version: 1,
          updated_at: '2024-01-01T00:00:00Z',
          cached_at: Date.now()
        },
        {
          id: 'search-test-3',
          name: 'Gamma Project',
          description: 'Alpha beta gamma project',
          asset_count: 3,
          last_version: 1,
          updated_at: '2024-01-01T00:00:00Z',
          cached_at: Date.now()
        }
      ];

      // Add all projects
      projects.forEach(project => projectCacheService.addProject(project));

      // Search by name
      const nameResults = projectCacheService.searchProjects('Alpha');
      expect(nameResults).toHaveLength(2); // Alpha Project and Gamma Project (description contains "alpha")

      // Search by description
      const descResults = projectCacheService.searchProjects('Second');
      expect(descResults).toHaveLength(1); // Only Beta Project

      // Search with no results
      const noResults = projectCacheService.searchProjects('NonExistent');
      expect(noResults).toHaveLength(0);
    });
  });

  describe('Cache Statistics', () => {
    it('should track project count correctly', () => {
      expect(projectCacheService.getCacheStats().projectCount).toBe(0);

      // Add projects
      projectCacheService.addProject({
        id: 'stats-test-1',
        name: 'Stats Test 1',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      });

      expect(projectCacheService.getCacheStats().projectCount).toBe(1);

      projectCacheService.addProject({
        id: 'stats-test-2',
        name: 'Stats Test 2',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      });

      expect(projectCacheService.getCacheStats().projectCount).toBe(2);
    });

    it('should detect stale cache correctly', () => {
      // Add a project with old timestamp
      const oldProject = {
        id: 'stale-test-project',
        name: 'Stale Test Project',
        description: null,
        asset_count: 0,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now() - (20 * 60 * 1000) // 20 minutes ago
      };

      projectCacheService.addProject(oldProject);

      const stats = projectCacheService.getCacheStats();
      expect(stats.isStale).toBe(true);
    });
  });

  describe('Export and Debug', () => {
    it('should export cache data as JSON', () => {
      const testProject = {
        id: 'export-test-project',
        name: 'Export Test Project',
        description: 'Test export functionality',
        asset_count: 5,
        last_version: 1,
        updated_at: '2024-01-01T00:00:00Z',
        cached_at: Date.now()
      };

      projectCacheService.addProject(testProject);

      const exported = projectCacheService.exportCache();
      expect(exported).toContain('export-test-project');
      expect(exported).toContain('Export Test Project');
      
      // Should be valid JSON
      expect(() => JSON.parse(exported)).not.toThrow();
    });
  });
});
