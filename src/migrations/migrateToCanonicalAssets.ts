/**
 * MIGRATION: Legacy Assets to Canonical Asset Structure
 * 
 * This script migrates all legacy asset data to the new canonical structure
 * following the plan requirements. It handles field name mapping and data validation.
 * 
 * 🔒 CRITICAL: This is a one-time migration - run with care
 */

import { Asset, createCanonicalAsset } from '@/types/Asset';
import { validateAssetStrict } from '@/types/Safeguards';
import { db } from '@/storage/indexeddb';

// Legacy asset interface (what we're migrating FROM)
interface LegacyAsset {
  asset_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content: string | null;
  background_config: any;
  viewport_config: any;
  custom_fields: any;
  updated_at: string;
  created_at: number;
  children: string[];
  is_locked: boolean;
  border_shape: string;
  show_tag_border: boolean;
  deleted_at: string | null;
  cloud_status: string;
  cloud_id: string | null;
  cloud_path: string | null;
  cloud_size: number | null;
  cloud_updated_at: string | null;
  cloud_error: string | null;
  file: any;
}

/**
 * Migration service
 */
export class CanonicalAssetMigration {
  /**
   * Migrate all legacy assets to canonical structure
   */
  static async migrateAll(): Promise<{
    migrated: number;
    failed: number;
    errors: string[];
  }> {
    console.log('Starting canonical asset migration...');
    
    const result = {
      migrated: 0,
      failed: 0,
      errors: [] as string[],
    };

    try {
      // Get all legacy assets (this would need to be implemented based on current storage)
      const legacyAssets = await this.getLegacyAssets();
      
      console.log(`Found ${legacyAssets.length} legacy assets to migrate`);

      for (const legacyAsset of legacyAssets) {
        try {
          const canonicalAsset = this.convertToCanonical(legacyAsset);
          validateAssetStrict(canonicalAsset);
          
          // Store the canonical asset
          await db.createAsset(canonicalAsset);
          
          result.migrated++;
          console.log(`Migrated asset: ${legacyAsset.asset_id}`);
          
        } catch (error) {
          result.failed++;
          const errorMsg = `Failed to migrate asset ${legacyAsset.asset_id}: ${error}`;
          result.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // Clean up legacy data after successful migration
      if (result.failed === 0) {
        await this.cleanupLegacyData();
        console.log('Legacy data cleanup completed');
      }

    } catch (error) {
      result.errors.push(`Migration failed: ${error}`);
      console.error('Migration failed:', error);
    }

    console.log(`Migration complete: ${result.migrated} migrated, ${result.failed} failed`);
    return result;
  }

  /**
   * Convert legacy asset to canonical structure
   */
  private static convertToCanonical(legacy: LegacyAsset): Asset {
    const projectId = this.extractProjectId(legacy);
    
    // Extract custom fields properly
    const customFields = this.extractCustomFields(legacy.custom_fields);
    
    // Extract background config
    const background = this.extractBackgroundConfig(legacy.background_config);
    
    // Extract viewport config
    const viewport = this.extractViewportConfig(legacy.viewport_config);

    return createCanonicalAsset(projectId, {
      id: legacy.asset_id,
      parentId: legacy.parent_id || undefined,
      
      layout: {
        x: legacy.x,
        y: legacy.y,
        width: legacy.width,
        height: legacy.height,
        zIndex: legacy.z_index,
      },

      content: {
        title: legacy.name,
        text: legacy.content || undefined,
        imageUrl: legacy.file?.url || undefined,
        customFields,
      },

      style: {
        background,
        tagColor: undefined, // Would need to extract from legacy if available
        border: {
          shape: legacy.border_shape,
          showTagBorder: legacy.show_tag_border,
        },
        shape: legacy.border_shape,
        opacity: 1,
      },

      behavior: {
        renderMode: legacy.type,
        interactions: {},
        viewport,
      },

      metadata: {
        tags: [], // Extract from legacy custom_fields if available
        createdAt: new Date(legacy.created_at).toISOString(),
        updatedAt: legacy.updated_at,
        version: 1,
      },
    });
  }

  /**
   * Extract project ID from legacy asset
   */
  private static extractProjectId(legacy: LegacyAsset): string {
    // This would need to be implemented based on how projects are stored
    // For now, assume we have a current project context
    return localStorage.getItem('currentProjectId') || 'default-project';
  }

  /**
   * Extract custom fields from legacy custom_fields
   */
  private static extractCustomFields(legacyCustomFields: any): Record<string, any> {
    if (!legacyCustomFields) return {};
    
    // Handle the old custom_fields structure
    const result: Record<string, any> = {};
    
    if (legacyCustomFields.customFields) {
      result.customFields = legacyCustomFields.customFields;
    }
    
    if (legacyCustomFields.customFieldValues) {
      result.customFieldValues = legacyCustomFields.customFieldValues;
    }
    
    if (legacyCustomFields.tags) {
      result.tags = legacyCustomFields.tags;
    }
    
    if (legacyCustomFields.viewportDisplaySettings) {
      result.viewportDisplaySettings = legacyCustomFields.viewportDisplaySettings;
    }
    
    if (legacyCustomFields.thumbnail) {
      result.thumbnail = legacyCustomFields.thumbnail;
    }
    
    if (legacyCustomFields.background) {
      result.background = legacyCustomFields.background;
    }
    
    if (legacyCustomFields.description) {
      result.description = legacyCustomFields.description;
    }

    return result;
  }

  /**
   * Extract background config from legacy
   */
  private static extractBackgroundConfig(legacyBackground: any): any {
    if (!legacyBackground) return {};
    
    return {
      mode: legacyBackground.mode || 'color',
      color: legacyBackground.color || '#ffffff',
      imageUrl: legacyBackground.imageUrl || null,
    };
  }

  /**
   * Extract viewport config from legacy
   */
  private static extractViewportConfig(legacyViewport: any): any {
    if (!legacyViewport) return {};
    
    return {
      zoom: legacyViewport.zoom || 1,
      panX: legacyViewport.pan_x || 0,
      panY: legacyViewport.pan_y || 0,
    };
  }

  /**
   * Get legacy assets from storage
   * This would need to be implemented based on current storage system
   */
  private static async getLegacyAssets(): Promise<LegacyAsset[]> {
    // This is a placeholder - actual implementation would depend on
    // how legacy assets are currently stored
    
    // For now, try to get from IndexedDB with legacy structure
    try {
      // If there's a legacy table or different structure
      const legacyDb = (window as any).legacyDb;
      if (legacyDb) {
        return await legacyDb.assets.toArray();
      }
      
      // Try to get from localStorage as fallback
      const localStorageData = localStorage.getItem('kanvas-assets');
      if (localStorageData) {
        return JSON.parse(localStorageData);
      }
      
      return [];
    } catch (error) {
      console.error('Failed to get legacy assets:', error);
      return [];
    }
  }

  /**
   * Clean up legacy data after successful migration
   */
  private static async cleanupLegacyData(): Promise<void> {
    try {
      // Clear localStorage legacy data
      localStorage.removeItem('kanvas-assets');
      localStorage.removeItem('kanvas-projects');
      
      // Clear any legacy IndexedDB tables if they exist
      const legacyDb = (window as any).legacyDb;
      if (legacyDb) {
        await legacyDb.delete();
      }
      
      console.log('Legacy data cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup legacy data:', error);
      // Don't throw - migration is still successful
    }
  }

  /**
   * Validate migration completeness
   */
  static async validateMigration(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      // Check if all canonical assets are valid
      const projects = await db.projects.toArray();
      
      for (const project of projects) {
        const assets = await db.getProjectAssets(project.id);
        
        for (const asset of assets) {
          try {
            validateAssetStrict(asset);
          } catch (error) {
            issues.push(`Invalid asset ${asset.id}: ${error}`);
          }
        }
      }
      
      // Check for any remaining legacy data
      const hasLegacyData = localStorage.getItem('kanvas-assets') !== null;
      if (hasLegacyData) {
        issues.push('Legacy data still exists in localStorage');
      }
      
    } catch (error) {
      issues.push(`Validation failed: ${error}`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Rollback migration (if needed)
   */
  static async rollback(): Promise<void> {
    console.warn('Rolling back canonical asset migration...');
    
    try {
      // Delete all canonical assets
      await db.clearAllData();
      
      // Restore legacy data if backup exists
      const legacyBackup = localStorage.getItem('kanvas-assets-backup');
      if (legacyBackup) {
        localStorage.setItem('kanvas-assets', legacyBackup);
      }
      
      console.log('Migration rollback completed');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }
}

// Export for use in migration UI or scripts
export { LegacyAsset };
export const canonicalAssetMigration = CanonicalAssetMigration;
