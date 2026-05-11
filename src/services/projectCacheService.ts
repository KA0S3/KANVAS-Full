/**
 * Project Cache Service - Low-I/O Project Metadata Caching
 * 
 * This service provides a cache-aside pattern for project metadata to eliminate
 * race conditions when accessing project IDs and maintain low-I/O principles.
 * 
 * Key Features:
 * - Cache-first approach for project metadata
 * - TTL and version-based invalidation
 * - Seamless integration with existing stores
 * - Minimal storage footprint (text-only data)
 */

import { localCache } from '@/utils/localCache';
import { listProjects } from '@/services/ProjectService';
import { supabase } from '@/lib/supabase';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { logAuth, reportError } from '@/utils/logger';

// =====================================================
// Type Definitions
// =====================================================

export interface ProjectCacheEntry {
  id: string;
  name: string;
  description: string | null;
  asset_count: number;
  last_version: number;
  updated_at: string;
  cached_at: number;
}

export interface ProjectCacheData {
  projects: Record<string, ProjectCacheEntry>;
  last_updated: number;
  user_id: string;
}

export interface ProjectCacheStats {
  projectCount: number;
  cacheAge: number;
  isStale: boolean;
  lastUpdated: number;
}

// =====================================================
// Cache Configuration
// =====================================================

const CACHE_KEY = 'project-index-cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const BACKGROUND_REFRESH_MS = 10 * 60 * 1000; // 10 minutes for active users
const MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes max age

// =====================================================
// Project Cache Service
// =====================================================

class ProjectCacheService {
  private static instance: ProjectCacheService | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  private lastRefreshTime: number = 0;
  
  // Session-based logging flags to prevent duplicate logs
  private static hasLoggedNoCache = false;
  private static hasLoggedInitialized = false;

  private constructor() {
    if (!ProjectCacheService.hasLoggedInitialized) {
      console.log('[ProjectCacheService] Initialized');
      ProjectCacheService.hasLoggedInitialized = true;
    }
  }

  public static getInstance(): ProjectCacheService {
    if (!ProjectCacheService.instance) {
      ProjectCacheService.instance = new ProjectCacheService();
    }
    return ProjectCacheService.instance;
  }

  private static ensureInstance(): ProjectCacheService {
    if (!ProjectCacheService.instance) {
      throw new Error('ProjectCacheService not initialized. Call initialize() first.');
    }
    return ProjectCacheService.instance;
  }

  // =====================================================
  // Core Cache Operations
  // =====================================================

  /**
   * Get cached project data for current user
   */
  public getCache(): ProjectCacheData | null {
    try {
      const cache = localCache.get<ProjectCacheData>(CACHE_KEY);
      if (!cache) {
        if (!ProjectCacheService.hasLoggedNoCache) {
          console.log('[ProjectCacheService] No cache found');
          ProjectCacheService.hasLoggedNoCache = true;
        }
        return null;
      }

      // Validate cache structure
      if (!cache.projects || !cache.last_updated || !cache.user_id) {
        console.warn('[ProjectCacheService] Invalid cache structure, clearing');
        this.clearCache();
        return null;
      }

      console.log(`[ProjectCacheService] Retrieved cache with ${Object.keys(cache.projects).length} projects`);
      return cache;
    } catch (error) {
      reportError(error, 'projectCache.getCache', 'Failed to retrieve cache');
      return null;
    }
  }

  /**
   * Set cache data with validation
   */
  private setCache(data: ProjectCacheData): void {
    try {
      // Reset no-cache log flag when cache is successfully set
      ProjectCacheService.hasLoggedNoCache = false;
      
      // Validate data structure
      if (!data.projects || !data.user_id) {
        throw new Error('Invalid cache data structure');
      }

      // Add timestamps to each project entry
      const enrichedProjects: Record<string, ProjectCacheEntry> = {};
      Object.entries(data.projects).forEach(([id, project]) => {
        enrichedProjects[id] = {
          ...project,
          cached_at: Date.now()
        };
      });

      const cacheData: ProjectCacheData = {
        ...data,
        projects: enrichedProjects,
        last_updated: Date.now()
      };

      localCache.set(CACHE_KEY, cacheData, CACHE_TTL_MS / (60 * 1000)); // Convert to minutes
      console.log(`[ProjectCacheService] Cached ${Object.keys(enrichedProjects).length} projects for user ${data.user_id}`);
      performanceMonitor.incrementLocalStorageWrites();
    } catch (error) {
      reportError(error, 'projectCache.setCache', 'Failed to set cache');
    }
  }

  /**
   * Clear cache for current user
   */
  public clearCache(): void {
    try {
      localCache.remove(CACHE_KEY);
      // Reset no-cache log flag to allow logging after intentional clearing
      ProjectCacheService.hasLoggedNoCache = false;
      console.log('[ProjectCacheService] Cache cleared');
    } catch (error) {
      reportError(error, 'projectCache.clearCache', 'Failed to clear cache');
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): ProjectCacheStats {
    const cache = this.getCache();
    if (!cache) {
      return {
        projectCount: 0,
        cacheAge: 0,
        isStale: true,
        lastUpdated: 0
      };
    }

    const now = Date.now();
    const cacheAge = now - cache.last_updated;
    const isStale = cacheAge > CACHE_TTL_MS;

    return {
      projectCount: Object.keys(cache.projects).length,
      cacheAge,
      isStale,
      lastUpdated: cache.last_updated
    };
  }

  // =====================================================
  // Project Access Methods
  // =====================================================

  /**
   * Get project by ID from cache
   */
  public getProject(projectId: string): ProjectCacheEntry | null {
    const cache = this.getCache();
    if (!cache) {
      return null;
    }

    const project = cache.projects[projectId];
    if (!project) {
      console.log(`[ProjectCacheService] Project ${projectId} not found in cache`);
      return null;
    }

    // Check if individual project is stale
    const age = Date.now() - project.cached_at;
    if (age > MAX_CACHE_AGE_MS) {
      console.log(`[ProjectCacheService] Project ${projectId} is stale (${Math.round(age / 1000)}s old)`);
      return null;
    }

    return project;
  }

  /**
   * Get all cached projects
   */
  public getAllProjects(): ProjectCacheEntry[] {
    const cache = this.getCache();
    if (!cache) {
      return [];
    }

    const now = Date.now();
    return Object.values(cache.projects).filter(project => {
      const age = now - project.cached_at;
      return age <= MAX_CACHE_AGE_MS;
    });
  }

  /**
   * Check if project exists in cache
   */
  public hasProject(projectId: string): boolean {
    return this.getProject(projectId) !== null;
  }

  /**
   * Search projects by name or description
   */
  public searchProjects(query: string): ProjectCacheEntry[] {
    const projects = this.getAllProjects();
    const lowerQuery = query.toLowerCase();
    
    return projects.filter(project => 
      project.name.toLowerCase().includes(lowerQuery) ||
      (project.description && project.description.toLowerCase().includes(lowerQuery))
    );
  }

  // =====================================================
  // Cache Population & Refresh
  // =====================================================

  /**
   * Populate cache from Supabase
   */
  public async populateCache(forceRefresh: boolean = false): Promise<boolean> {
    // Prevent concurrent refreshes
    if (this.isRefreshing && !forceRefresh) {
      console.log('[ProjectCacheService] Refresh already in progress');
      return false;
    }

    // Check if we need to refresh
    const stats = this.getCacheStats();
    if (!stats.isStale && !forceRefresh) {
      console.log('[ProjectCacheService] Cache is fresh, skipping refresh');
      return true;
    }

    this.isRefreshing = true;
    const startTime = Date.now();

    try {
      console.log('[ProjectCacheService] Populating cache from Supabase...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[ProjectCacheService] No authenticated user, skipping cache population');
        return false;
      }

      // Fetch projects from Supabase
      const projects = await listProjects();
      performanceMonitor.incrementDatabaseRequests();

      // Transform to cache format
      const projectsMap: Record<string, ProjectCacheEntry> = {};
      projects.forEach(project => {
        projectsMap[project.id] = {
          id: project.id,
          name: project.name,
          description: project.description,
          asset_count: project.asset_count || 0,
          last_version: project.last_version || 0,
          updated_at: project.updated_at,
          cached_at: Date.now()
        };
      });

      // Store in cache
      const cacheData: ProjectCacheData = {
        projects: projectsMap,
        last_updated: Date.now(),
        user_id: user.id
      };

      this.setCache(cacheData);
      this.lastRefreshTime = Date.now();

      const duration = Date.now() - startTime;
      console.log(`[ProjectCacheService] Cache populated in ${duration}ms with ${projects.length} projects`);
      
      return true;
    } catch (error) {
      reportError(error, 'projectCache.populateCache', 'Failed to populate cache');
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Refresh cache in background
   */
  public startBackgroundRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      const stats = this.getCacheStats();
      if (stats.isStale || stats.projectCount === 0) {
        console.log('[ProjectCacheService] Background refresh triggered');
        await this.populateCache();
      }
    }, BACKGROUND_REFRESH_MS);

    console.log('[ProjectCacheService] Background refresh started');
  }

  /**
   * Stop background refresh
   */
  public stopBackgroundRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log('[ProjectCacheService] Background refresh stopped');
    }
  }

  // =====================================================
  // Cache Invalidation
  // =====================================================

  /**
   * Invalidate specific project
   */
  public invalidateProject(projectId: string): void {
    const cache = this.getCache();
    if (cache && cache.projects[projectId]) {
      delete cache.projects[projectId];
      this.setCache(cache);
      console.log(`[ProjectCacheService] Invalidated project ${projectId}`);
    }
  }

  /**
   * Update project in cache
   */
  public updateProject(projectId: string, updates: Partial<ProjectCacheEntry>): void {
    const cache = this.getCache();
    if (cache && cache.projects[projectId]) {
      cache.projects[projectId] = {
        ...cache.projects[projectId],
        ...updates,
        cached_at: Date.now()
      };
      this.setCache(cache);
      console.log(`[ProjectCacheService] Updated project ${projectId}`);
    }
  }

  /**
   * Add new project to cache
   */
  public addProject(project: ProjectCacheEntry): void {
    const cache = this.getCache();
    if (cache) {
      cache.projects[project.id] = {
        ...project,
        cached_at: Date.now()
      };
      this.setCache(cache);
      console.log(`[ProjectCacheService] Added project ${project.id}`);
    }
  }

  /**
   * Remove project from cache
   */
  public removeProject(projectId: string): void {
    this.invalidateProject(projectId);
  }

  // =====================================================
  // User Management
  // =====================================================

  /**
   * Handle user sign-in
   */
  public async onUserSignIn(userId: string): Promise<void> {
    console.log(`[ProjectCacheService] User signed in: ${userId}`);
    
    // Clear cache for different user
    const cache = this.getCache();
    if (cache && cache.user_id !== userId) {
      this.clearCache();
    }

    // Populate cache for new user
    await this.populateCache();
    
    // Start background refresh
    this.startBackgroundRefresh();
  }

  /**
   * Handle user sign-out
   */
  public onUserSignOut(): void {
    console.log('[ProjectCacheService] User signed out');
    
    // Stop background refresh
    this.stopBackgroundRefresh();
    
    // Clear cache
    this.clearCache();
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  /**
   * Export cache data for debugging
   */
  public exportCache(): string {
    const cache = this.getCache();
    return JSON.stringify(cache, null, 2);
  }

  /**
   * Get cache size estimate
   */
  public getCacheSize(): number {
    try {
      const cacheData = this.exportCache();
      return new Blob([cacheData]).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Validate cache integrity
   */
  public validateCache(): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    const cache = this.getCache();

    if (!cache) {
      issues.push('No cache found');
      return { isValid: false, issues };
    }

    // Check required fields
    if (!cache.user_id) issues.push('Missing user_id');
    if (!cache.last_updated) issues.push('Missing last_updated');
    if (!cache.projects) issues.push('Missing projects');

    // Check project entries
    Object.entries(cache.projects).forEach(([id, project]) => {
      if (!project.id) issues.push(`Project ${id} missing id`);
      if (!project.name) issues.push(`Project ${id} missing name`);
      if (!project.cached_at) issues.push(`Project ${id} missing cached_at`);
    });

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// =====================================================
// Lazy initialization methods
// =====================================================

/**
 * Initialize the ProjectCacheService - should be called when user is authenticated
 */
export const initializeProjectCacheService = (): ProjectCacheService => {
  const instance = ProjectCacheService.getInstance();
  console.log('[ProjectCacheService] Lazy initialized on demand');
  return instance;
};

/**
 * Get the ProjectCacheService instance - will throw if not initialized
 */
export const getProjectCacheService = (): ProjectCacheService => {
  return ProjectCacheService.getInstance();
};

// Legacy export for backward compatibility
let _legacyInstance: ProjectCacheService | null = null;
export const projectCacheService = new Proxy({} as ProjectCacheService, {
  get(target, prop) {
    if (!_legacyInstance) {
      _legacyInstance = initializeProjectCacheService();
    }
    return _legacyInstance[prop as keyof ProjectCacheService];
  }
});

export default projectCacheService;
