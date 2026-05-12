/**
 * PROJECT CACHE SERVICE
 * 
 * Handles caching of project data for performance
 * This is a simplified version for compatibility
 */

interface CachedProject {
  id: string;
  name: string;
  description?: string;
  lastAccessed: string;
  data: any;
}

class ProjectCacheService {
  private static instance: ProjectCacheService;
  private cache: Map<string, CachedProject> = new Map();
  private maxCacheSize = 50;
  private cacheTimeout = 30 * 60 * 1000; // 30 minutes

  static getInstance(): ProjectCacheService {
    if (!ProjectCacheService.instance) {
      ProjectCacheService.instance = new ProjectCacheService();
    }
    return ProjectCacheService.instance;
  }

  private constructor() {
    // Initialize cache from localStorage
    this.loadCacheFromStorage();
    
    // Set up periodic cleanup
    setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Add a project to cache
   */
  addProject(project: any): void {
    const cachedProject: CachedProject = {
      id: project.id,
      name: project.name,
      description: project.description,
      lastAccessed: new Date().toISOString(),
      data: project
    };

    this.cache.set(project.id, cachedProject);
    
    // Remove oldest cache entries if over limit
    this.enforceCacheSizeLimit();
    
    // Save to localStorage
    this.saveCacheToStorage();
  }

  /**
   * Get a project from cache
   */
  getProject(projectId: string): any | null {
    const cached = this.cache.get(projectId);
    
    if (!cached) {
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    const lastAccessed = new Date(cached.lastAccessed).getTime();
    
    if (now - lastAccessed > this.cacheTimeout) {
      this.cache.delete(projectId);
      this.saveCacheToStorage();
      return null;
    }

    // Update last accessed time
    cached.lastAccessed = new Date().toISOString();
    this.saveCacheToStorage();
    
    return cached.data;
  }

  /**
   * Remove a project from cache
   */
  removeProject(projectId: string): void {
    this.cache.delete(projectId);
    this.saveCacheToStorage();
  }

  /**
   * Clear all cached projects
   */
  clearCache(): void {
    this.cache.clear();
    this.saveCacheToStorage();
  }

  /**
   * Get all cached project IDs
   */
  getCachedProjectIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if a project is cached
   */
  hasProject(projectId: string): boolean {
    const cached = this.cache.get(projectId);
    if (!cached) return false;

    // Check if expired
    const now = Date.now();
    const lastAccessed = new Date(cached.lastAccessed).getTime();
    
    if (now - lastAccessed > this.cacheTimeout) {
      this.cache.delete(projectId);
      this.saveCacheToStorage();
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    projects: Array<{ id: string; name: string; lastAccessed: string }>;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0, // Would need to track hits/misses for real implementation
      projects: Array.from(this.cache.values()).map(p => ({
        id: p.id,
        name: p.name,
        lastAccessed: p.lastAccessed
      }))
    };
  }

  // Private helper methods
  private loadCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem('project-cache');
      if (cached) {
        const data = JSON.parse(cached);
        this.cache = new Map(data.projects || []);
      }
    } catch (error) {
      console.warn('Failed to load project cache from storage:', error);
      this.cache.clear();
    }
  }

  private saveCacheToStorage(): void {
    try {
      const data = {
        projects: Array.from(this.cache.entries()),
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('project-cache', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save project cache to storage:', error);
    }
  }

  private enforceCacheSizeLimit(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // Sort by last accessed time (oldest first)
    const sortedEntries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => 
        new Date(a.lastAccessed).getTime() - new Date(b.lastAccessed).getTime()
      );

    // Remove oldest entries
    const entriesToRemove = sortedEntries.slice(0, this.cache.size - this.maxCacheSize);
    entriesToRemove.forEach(([id]) => this.cache.delete(id));
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredEntries: string[] = [];

    for (const [id, cached] of this.cache.entries()) {
      const lastAccessed = new Date(cached.lastAccessed).getTime();
      if (now - lastAccessed > this.cacheTimeout) {
        expiredEntries.push(id);
      }
    }

    expiredEntries.forEach(id => this.cache.delete(id));
    
    if (expiredEntries.length > 0) {
      this.saveCacheToStorage();
    }
  }
}

// Export singleton instance
export const projectCacheService = ProjectCacheService.getInstance();
