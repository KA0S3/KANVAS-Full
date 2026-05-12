/**
 * PROJECT PERSISTENCE OPERATIONS - Project CRUD
 * 
 * This module handles all project persistence operations following plan.
 * Uses only canonical project structure with proper zone separation.
 * 
 * 🔒 CRITICAL: Only project metadata - no asset data, no sync state
 */

import { db, Project } from '@/storage/indexeddb';

/**
 * Project persistence operations
 */
export class ProjectPersistence {
  /**
   * Create a new project
   */
  static async create(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const project = await db.createProject(projectData);
    return project;
  }

  /**
   * Get project by ID
   */
  static async get(id: string): Promise<Project | undefined> {
    return await db.getProject(id);
  }

  /**
   * Get all projects for a user
   */
  static async getUserProjects(userId: string): Promise<Project[]> {
    return await db.getUserProjects(userId);
  }

  /**
   * Update project metadata
   */
  static async update(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
    await db.transaction('rw', db.projects, async () => {
      const currentProject = await db.getProject(id);
      if (!currentProject) {
        throw new Error(`Project ${id} not found`);
      }

      const updatedProject: Partial<Project> = {
        ...updates,
        updatedAt: new Date().toISOString(),
        version: (currentProject.version || 0) + 1,
      };

      await db.projects.update(id, updatedProject);
    });
  }

  /**
   * Delete project (soft delete)
   */
  static async delete(id: string): Promise<void> {
    await db.projects.update(id, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Permanently delete project
   */
  static async permanentDelete(id: string): Promise<void> {
    await db.transaction('rw', db.projects, db.assets, db.files, db.syncQueue, async () => {
      // Delete all related data
      await db.projects.delete(id);
      
      // Note: Assets and files will be cascade deleted by IndexedDB foreign key constraints
      // If not using foreign keys, we need to manually clean up
      const assets = await db.getProjectAssets(id);
      for (const asset of assets) {
        await db.assets.delete(asset.id);
      }
      
      const files = await db.getProjectFiles(id);
      for (const file of files) {
        await db.files.delete(file.id);
      }
      
      // Clear sync queue for this project
      const syncEntries = await db.syncQueue.where('projectId').equals(id).toArray();
      for (const entry of syncEntries) {
        await db.syncQueue.delete(entry.id);
      }
    });
  }

  /**
   * Restore soft-deleted project
   */
  static async restore(id: string): Promise<void> {
    await db.projects.update(id, {
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Update project settings
   */
  static async updateSettings(id: string, settings: Record<string, any>): Promise<void> {
    await this.update(id, { settings });
  }

  /**
   * Update last sync timestamp
   */
  static async updateLastSync(id: string): Promise<void> {
    await this.update(id, { lastSyncAt: new Date().toISOString() });
  }

  /**
   * Get project statistics
   */
  static async getProjectStats(id: string): Promise<{
    assetCount: number;
    fileCount: number;
    totalFileSize: number;
    lastSyncAt?: string;
  }> {
    const [assets, files] = await Promise.all([
      db.getProjectAssets(id),
      db.getProjectFiles(id),
    ]);

    const totalFileSize = files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);

    return {
      assetCount: assets.length,
      fileCount: files.length,
      totalFileSize,
      lastSyncAt: (await db.getProject(id))?.lastSyncAt,
    };
  }

  /**
   * Search projects by name or description
   */
  static async searchProjects(userId: string, query: string): Promise<Project[]> {
    const projects = await this.getUserProjects(userId);
    const lowerQuery = query.toLowerCase();

    return projects.filter(project =>
      project.name.toLowerCase().includes(lowerQuery) ||
      project.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Export project data
   */
  static async exportProject(id: string): Promise<{
    project: Project | undefined;
    assets: import('@/types/Asset').Asset[];
    files: import('@/storage/indexeddb').FileBlob[];
  }> {
    return await db.exportProjectData(id);
  }

  /**
   * Validate project structure
   */
  static validateProject(project: Partial<Project>): void {
    if (!project.name || project.name.trim().length === 0) {
      throw new Error('Project name is required');
    }
    
    if (!project.userId) {
      throw new Error('Project userId is required');
    }
  }
}

// Export singleton instance
export const projectPersistence = ProjectPersistence;
