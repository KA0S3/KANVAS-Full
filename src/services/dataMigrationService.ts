/**
 * DATA MIGRATION SERVICE
 * 
 * Handles data migration between different versions of the app
 * This is a simplified version for compatibility
 */

export interface MigrationConflict {
  type: 'asset' | 'project' | 'settings';
  id: string;
  localVersion: any;
  remoteVersion: any;
  resolution: 'local' | 'remote' | 'merge';
}

export interface MigrationResult {
  success: boolean;
  conflicts: MigrationConflict[];
  migratedAssets: number;
  migratedProjects: number;
  errors: string[];
}

class DataMigrationService {
  private static instance: DataMigrationService;

  static getInstance(): DataMigrationService {
    if (!DataMigrationService.instance) {
      DataMigrationService.instance = new DataMigrationService();
    }
    return DataMigrationService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Migrate data from legacy format to new format
   */
  async migrateFromLegacy(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      conflicts: [],
      migratedAssets: 0,
      migratedProjects: 0,
      errors: []
    };

    try {
      // Check if legacy data exists
      const legacyData = this.getLegacyData();
      if (!legacyData) {
        console.log('No legacy data found');
        return result;
      }

      // Migrate projects
      if (legacyData.projects) {
        for (const project of Object.values(legacyData.projects)) {
          try {
            await this.migrateProject(project as any);
            result.migratedProjects++;
          } catch (error) {
            result.errors.push(`Failed to migrate project: ${error}`);
          }
        }
      }

      // Migrate assets
      if (legacyData.assets) {
        for (const asset of Object.values(legacyData.assets)) {
          try {
            await this.migrateAsset(asset as any);
            result.migratedAssets++;
          } catch (error) {
            result.errors.push(`Failed to migrate asset: ${error}`);
          }
        }
      }

      // Clear legacy data after successful migration
      this.clearLegacyData();

    } catch (error) {
      result.success = false;
      result.errors.push(`Migration failed: ${error}`);
    }

    return result;
  }

  /**
   * Resolve migration conflicts
   */
  async resolveConflicts(conflicts: MigrationConflict[]): Promise<boolean> {
    try {
      for (const conflict of conflicts) {
        await this.resolveConflict(conflict);
      }
      return true;
    } catch (error) {
      console.error('Failed to resolve conflicts:', error);
      return false;
    }
  }

  /**
   * Check if migration is needed
   */
  isMigrationNeeded(): boolean {
    const legacyData = this.getLegacyData();
    return legacyData !== null;
  }

  // Private helper methods
  private getLegacyData(): any {
    try {
      const legacyData = localStorage.getItem('kanvas-legacy-data');
      return legacyData ? JSON.parse(legacyData) : null;
    } catch {
      return null;
    }
  }

  private clearLegacyData(): void {
    localStorage.removeItem('kanvas-legacy-data');
  }

  private async migrateProject(legacyProject: any): Promise<void> {
    // Import persistence modules dynamically to avoid circular dependencies
    const { projectPersistence } = await import('@/persistence/projects');
    
    // Convert legacy project format to new format
    const newProject = {
      id: legacyProject.id || this.generateId(),
      userId: legacyProject.userId || 'anonymous',
      name: legacyProject.name || 'Untitled Project',
      description: legacyProject.description || '',
      settings: legacyProject.settings || {},
      version: legacyProject.version || 1,
      createdAt: legacyProject.createdAt || new Date().toISOString(),
      updatedAt: legacyProject.updatedAt || new Date().toISOString()
    };

    await projectPersistence.create(newProject);
  }

  private async migrateAsset(legacyAsset: any): Promise<void> {
    const { assetPersistence } = await import('@/persistence/assets');
    
    // Convert legacy asset format to new canonical format
    const newAsset = {
      id: legacyAsset.id || this.generateId(),
      projectId: legacyAsset.projectId || 'default',
      parentId: legacyAsset.parentId,
      layout: {
        x: legacyAsset.x || 0,
        y: legacyAsset.y || 0,
        width: legacyAsset.width || 100,
        height: legacyAsset.height || 100,
        scale: legacyAsset.scale,
        rotation: legacyAsset.rotation,
        zIndex: legacyAsset.zIndex
      },
      content: {
        title: legacyAsset.name || legacyAsset.title,
        description: legacyAsset.description,
        text: legacyAsset.content || legacyAsset.text,
        imageUrl: legacyAsset.imageUrl,
        customFields: legacyAsset.customFields || {}
      },
      style: {
        background: legacyAsset.background,
        tagColor: legacyAsset.tagColor,
        border: legacyAsset.border,
        shape: legacyAsset.shape,
        opacity: legacyAsset.opacity
      },
      behavior: {
        renderMode: legacyAsset.type || 'default',
        interactions: legacyAsset.interactions || {},
        viewport: legacyAsset.viewport || {}
      },
      metadata: {
        tags: legacyAsset.tags || [],
        createdAt: legacyAsset.createdAt || new Date().toISOString(),
        updatedAt: legacyAsset.updatedAt || new Date().toISOString(),
        version: legacyAsset.version || 1
      }
    };

    await assetPersistence.create(newAsset);
  }

  private async resolveConflict(conflict: MigrationConflict): Promise<void> {
    // Simple conflict resolution - can be expanded based on needs
    switch (conflict.resolution) {
      case 'local':
        // Keep local version, do nothing
        break;
      case 'remote':
        // Use remote version, would need to implement remote fetching
        console.log('Would use remote version for', conflict.id);
        break;
      case 'merge':
        // Attempt to merge versions
        console.log('Would merge versions for', conflict.id);
        break;
    }
  }

  private generateId(): string {
    return `migrated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const dataMigrationService = DataMigrationService.getInstance();
