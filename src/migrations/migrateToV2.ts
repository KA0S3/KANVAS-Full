/**
 * DATA MIGRATION TO V2 - localStorage to IndexedDB
 * 
 * Migrates existing data from localStorage to the new IndexedDB structure
 * while preserving all functionality and ensuring data integrity.
 * 
 * 🔒 CRITICAL: This migration must preserve all existing data
 */

import { Asset, createCanonicalAsset } from '@/types/Asset';
import { validateAssetStrict } from '@/types/Safeguards';
import { db, verifyIndexedDBSchemaHealth } from '@/storage/indexeddb';
import { createRuntimeSyncState } from '@/types/SyncTypes';

// Legacy data interfaces (from old system)
interface LegacyAsset {
  asset_id: string;
  parent_id?: string | null;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content?: string | null;
  background_config?: any;
  viewport_config?: any;
  custom_fields?: any;
  children: string[];
  created_at?: number;
  is_locked?: boolean;
  border_shape?: string;
  show_tag_border?: boolean;
  deleted_at?: string;
  cloud_status?: string;
  cloud_id?: string;
  cloud_path?: string;
  cloud_size?: number;
  cloud_updated_at?: string;
  cloud_error?: string;
  file?: File;
  updated_at?: string;
}

interface LegacyProject {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  backgrounds?: any;
  tags_config?: any;
  viewport?: any;
  last_version?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface MigrationResult {
  success: boolean;
  migratedProjects: number;
  migratedAssets: number;
  errors: string[];
  warnings: string[];
}

export class DataMigrator {
  private migrationLog: string[] = [];

  /**
   * Log migration events
   */
  private log(message: string): void {
    this.migrationLog.push(`${new Date().toISOString()}: ${message}`);
    console.log(`[Migration] ${message}`);
  }

  /**
   * Perform full migration from localStorage to IndexedDB
   */
  async migrateToV2(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedProjects: 0,
      migratedAssets: 0,
      errors: [],
      warnings: [],
    };

    try {
      this.log('Starting migration to V2');

      // Check if migration has already been performed
      if (await this.isAlreadyMigrated()) {
        this.log('Migration already completed and IndexedDB schema verified');
        result.success = true;
        return result;
      }

      // Step 1: Migrate projects
      const projectResult = await this.migrateProjects();
      result.migratedProjects = projectResult.count;
      result.errors.push(...projectResult.errors);
      result.warnings.push(...projectResult.warnings);

      // Step 2: Migrate assets
      const assetResult = await this.migrateAssets();
      result.migratedAssets = assetResult.count;
      result.errors.push(...assetResult.errors);
      result.warnings.push(...assetResult.warnings);

      // Step 3: Initialize sync queue for dirty assets
      await this.initializeSyncQueue();

      // Step 4: Mark migration as complete
      await this.markMigrationComplete();

      result.success = result.errors.length === 0;
      this.log(`Migration completed: ${result.migratedProjects} projects, ${result.migratedAssets} assets`);

      return result;

    } catch (error) {
      const errorMessage = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.log(errorMessage);
      result.errors.push(errorMessage);
      return result;
    }
  }

  /**
   * Check if migration has already been performed
   */
  private async isAlreadyMigrated(): Promise<boolean> {
    const migrationKey = 'kanvas_v2_migration_complete';
    const migrationFlagSet = localStorage.getItem(migrationKey) === 'true';

    if (!migrationFlagSet) {
      await verifyIndexedDBSchemaHealth();
      return false;
    }

    try {
      await verifyIndexedDBSchemaHealth();
      return true;
    } catch (error) {
      localStorage.removeItem(migrationKey);
      this.log(`Migration flag ignored because IndexedDB schema is unhealthy: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Mark migration as complete
   */
  private async markMigrationComplete(): Promise<void> {
    try {
      const migrationKey = 'kanvas_v2_migration_complete';
      await verifyIndexedDBSchemaHealth();
      localStorage.setItem(migrationKey, 'true');
      this.log('Migration marked as complete');
    } catch (error) {
      this.log(`Failed to mark migration complete: ${error}`);
    }
  }

  /**
   * Migrate projects from localStorage
   */
  private async migrateProjects(): Promise<{ count: number; errors: string[]; warnings: string[] }> {
    const result = { count: 0, errors: [], warnings: [] };

    try {
      const projectsData = localStorage.getItem('kanvas_projects');
      if (!projectsData) {
        this.log('No projects found in localStorage');
        return result;
      }

      const legacyProjects: LegacyProject[] = JSON.parse(projectsData);
      this.log(`Found ${legacyProjects.length} projects to migrate`);

      for (const legacyProject of legacyProjects) {
        try {
          const canonicalProject = await this.convertLegacyProject(legacyProject);
          await db.createProject(canonicalProject);
          result.count++;
          this.log(`Migrated project: ${legacyProject.name}`);
        } catch (error) {
          const errorMsg = `Failed to migrate project ${legacyProject.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          this.log(errorMsg);
        }
      }

    } catch (error) {
      result.errors.push(`Project migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Migrate assets from localStorage
   */
  private async migrateAssets(): Promise<{ count: number; errors: string[]; warnings: string[] }> {
    const result = { count: 0, errors: [], warnings: [] };

    try {
      // Get all project asset data
      const projectsData = localStorage.getItem('kanvas_projects');
      if (!projectsData) {
        return result;
      }

      const legacyProjects: LegacyProject[] = JSON.parse(projectsData);
      
      for (const project of legacyProjects) {
        const projectAssetsKey = `kanvas_assets_${project.id}`;
        const assetsData = localStorage.getItem(projectAssetsKey);
        
        if (!assetsData) {
          this.log(`No assets found for project ${project.id}`);
          continue;
        }

        const legacyAssets: LegacyAsset[] = JSON.parse(assetsData);
        this.log(`Found ${legacyAssets.length} assets for project ${project.id}`);

        for (const legacyAsset of legacyAssets) {
          try {
            const canonicalAsset = await this.convertLegacyAsset(legacyAsset, project.id);
            await db.createAsset(canonicalAsset);
            result.count++;
            
            // Mark for sync if asset has cloud status
            if (legacyAsset.cloud_status && legacyAsset.cloud_status !== 'synced') {
              await db.addToSyncQueue({
                projectId: project.id,
                assetId: canonicalAsset.id,
                operation: 'update',
                status: 'dirty',
                retryCount: 0,
                createdAt: new Date().toISOString(),
                assetData: canonicalAsset,
              });
            }
            
          } catch (error) {
            const errorMsg = `Failed to migrate asset ${legacyAsset.asset_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMsg);
            this.log(errorMsg);
          }
        }
      }

    } catch (error) {
      result.errors.push(`Asset migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Convert legacy project to canonical format
   */
  private async convertLegacyProject(legacyProject: LegacyProject): Promise<any> {
    return {
      id: legacyProject.id,
      userId: legacyProject.user_id,
      name: legacyProject.name,
      description: legacyProject.description,
      settings: {
        backgrounds: legacyProject.backgrounds || {},
        tagsConfig: legacyProject.tags_config || {},
        viewport: legacyProject.viewport || { x: 0, y: 0, zoom: 1 },
      },
      version: legacyProject.last_version || 1,
      lastSyncAt: undefined,
      createdAt: legacyProject.created_at,
      updatedAt: legacyProject.updated_at,
      deletedAt: legacyProject.deleted_at,
    };
  }

  /**
   * Convert legacy asset to canonical format
   */
  private async convertLegacyAsset(legacyAsset: LegacyAsset, projectId: string): Promise<Asset> {
    const canonicalAsset = createCanonicalAsset(projectId, {
      id: legacyAsset.asset_id, // Keep same ID for continuity
      parentId: legacyAsset.parent_id || undefined,
      
      layout: {
        x: legacyAsset.x,
        y: legacyAsset.y,
        width: legacyAsset.width,
        height: legacyAsset.height,
        zIndex: legacyAsset.z_index,
      },

      content: {
        title: legacyAsset.name,
        description: legacyAsset.custom_fields?.description || '',
        text: legacyAsset.content || undefined,
        customFields: this.convertCustomFields(legacyAsset.custom_fields),
      },

      style: {
        background: legacyAsset.background_config || {},
        tagColor: legacyAsset.custom_fields?.background || '',
        border: legacyAsset.border_shape ? { shape: legacyAsset.border_shape } : {},
        shape: legacyAsset.border_shape || 'square',
        opacity: legacyAsset.custom_fields?.opacity || 1,
      },

      behavior: {
        renderMode: this.getRenderModeFromLegacyType(legacyAsset.type),
        interactions: {},
        viewport: legacyAsset.viewport_config || {},
      },

      metadata: {
        tags: legacyAsset.custom_fields?.tags || [],
        createdAt: legacyAsset.created_at ? new Date(legacyAsset.created_at).toISOString() : new Date().toISOString(),
        updatedAt: legacyAsset.updated_at || new Date().toISOString(),
        version: 1,
      },
    });

    // Validate the converted asset
    validateAssetStrict(canonicalAsset);

    return canonicalAsset;
  }

  /**
   * Convert legacy custom fields to canonical format
   */
  private convertCustomFields(legacyCustomFields: any): Record<string, any> {
    if (!legacyCustomFields) {
      return {};
    }

    const customFields: Record<string, any> = {};

    // Map known legacy fields
    const fieldMappings = {
      'thumbnail': 'thumbnail',
      'background': 'background',
      'description': 'description',
      'viewportDisplaySettings': 'viewportDisplaySettings',
    };

    for (const [legacyKey, value] of Object.entries(legacyCustomFields)) {
      const canonicalKey = fieldMappings[legacyKey as keyof typeof fieldMappings] || legacyKey;
      customFields[canonicalKey] = value;
    }

    return customFields;
  }

  /**
   * Get render mode from legacy asset type
   */
  private getRenderModeFromLegacyType(legacyType: string): string {
    // Map legacy types to render modes
    const typeMappings: Record<string, string> = {
      'image': 'image',
      'document': 'document',
      'video': 'video',
      'audio': 'audio',
      'text': 'text',
      'container': 'container',
      'card': 'card',
      'viewport': 'viewport',
      'tag': 'tag',
    };

    return typeMappings[legacyType] || 'default';
  }

  /**
   * Initialize sync queue for all assets
   */
  private async initializeSyncQueue(): Promise<void> {
    this.log('Initializing sync queue');

    // All assets are initially marked as synced unless they have cloud status
    // This is handled during asset migration
    
    this.log('Sync queue initialization complete');
  }

  /**
   * Get migration log
   */
  getMigrationLog(): string[] {
    return [...this.migrationLog];
  }

  /**
   * Clear migration log
   */
  clearLog(): void {
    this.migrationLog = [];
  }

  /**
   * Validate migration integrity
   */
  async validateMigration(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check that all projects were migrated
      const legacyProjectsCount = this.getLegacyProjectsCount();
      const migratedProjectsCount = await this.getMigratedProjectsCount();
      
      if (legacyProjectsCount !== migratedProjectsCount) {
        issues.push(`Project count mismatch: ${legacyProjectsCount} legacy vs ${migratedProjectsCount} migrated`);
      }

      // Check that all assets were migrated
      const legacyAssetsCount = this.getLegacyAssetsCount();
      const migratedAssetsCount = await this.getMigratedAssetsCount();
      
      if (legacyAssetsCount !== migratedAssetsCount) {
        issues.push(`Asset count mismatch: ${legacyAssetsCount} legacy vs ${migratedAssetsCount} migrated`);
      }

      // Validate asset structure
      const allAssets = await this.getAllMigratedAssets();
      for (const asset of allAssets) {
        try {
          validateAssetStrict(asset);
        } catch (error) {
          issues.push(`Invalid asset structure for ${asset.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

    } catch (error) {
      issues.push(`Migration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Helper methods for validation
   */
  private getLegacyProjectsCount(): number {
    try {
      const projectsData = localStorage.getItem('kanvas_projects');
      if (!projectsData) return 0;
      const projects: LegacyProject[] = JSON.parse(projectsData);
      return projects.length;
    } catch {
      return 0;
    }
  }

  private getLegacyAssetsCount(): number {
    try {
      const projectsData = localStorage.getItem('kanvas_projects');
      if (!projectsData) return 0;
      const projects: LegacyProject[] = JSON.parse(projectsData);
      
      let totalAssets = 0;
      for (const project of projects) {
        const assetsData = localStorage.getItem(`kanvas_assets_${project.id}`);
        if (assetsData) {
          const assets: LegacyAsset[] = JSON.parse(assetsData);
          totalAssets += assets.length;
        }
      }
      return totalAssets;
    } catch {
      return 0;
    }
  }

  private async getMigratedProjectsCount(): Promise<number> {
    try {
      const projects = await db.projects.toArray();
      return projects.length;
    } catch {
      return 0;
    }
  }

  private async getMigratedAssetsCount(): Promise<number> {
    try {
      const assets = await db.assets.toArray();
      return assets.length;
    } catch {
      return 0;
    }
  }

  private async getAllMigratedAssets(): Promise<Asset[]> {
    try {
      return await db.assets.toArray();
    } catch {
      return [];
    }
  }
}

// Export singleton instance
export const dataMigrator = new DataMigrator();

// Export main migration function for use in main.tsx  
export const migrateToV2 = () => dataMigrator.migrateToV2();
