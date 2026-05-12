/**
 * MIGRATION VALIDATION
 * 
 * Validates the integrity of migrated data and ensures
 * the new system works correctly with migrated data.
 * 
 * 🔒 CRITICAL: Validation must ensure no data loss
 */

import { Asset } from '@/types/Asset';
import { validateAssetStrict } from '@/types/Safeguards';
import { db } from '@/storage/indexeddb';
import { dataMigrator } from './migrateToV2';

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  stats: {
    projects: number;
    assets: number;
    corruptedAssets: number;
    missingAssets: number;
  };
}

export class MigrationValidator {
  /**
   * Perform comprehensive migration validation
   */
  async validateMigration(): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: false,
      issues: [],
      warnings: [],
      stats: {
        projects: 0,
        assets: 0,
        corruptedAssets: 0,
        missingAssets: 0,
      },
    };

    try {
      console.log('Starting migration validation...');

      // Step 1: Validate project migration
      const projectValidation = await this.validateProjectMigration();
      result.stats.projects = projectValidation.count;
      result.issues.push(...projectValidation.issues);
      result.warnings.push(...projectValidation.warnings);

      // Step 2: Validate asset migration
      const assetValidation = await this.validateAssetMigration();
      result.stats.assets = assetValidation.count;
      result.stats.corruptedAssets = assetValidation.corruptedCount;
      result.issues.push(...assetValidation.issues);
      result.warnings.push(...assetValidation.warnings);

      // Step 3: Validate data integrity
      const integrityValidation = await this.validateDataIntegrity();
      result.issues.push(...integrityValidation.issues);
      result.warnings.push(...integrityValidation.warnings);

      // Step 4: Validate sync queue
      const syncValidation = await this.validateSyncQueue();
      result.issues.push(...syncValidation.issues);
      result.warnings.push(...syncValidation.warnings);

      // Step 5: Validate functionality
      const functionalityValidation = await this.validateFunctionality();
      result.issues.push(...functionalityValidation.issues);
      result.warnings.push(...functionalityValidation.warnings);

      result.valid = result.issues.length === 0;
      
      console.log(`Migration validation completed: ${result.valid ? 'PASSED' : 'FAILED'}`);
      console.log(`Issues: ${result.issues.length}, Warnings: ${result.warnings.length}`);

      return result;

    } catch (error) {
      const errorMessage = `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.issues.push(errorMessage);
      console.error(errorMessage);
      return result;
    }
  }

  /**
   * Validate project migration
   */
  private async validateProjectMigration(): Promise<{ count: number; issues: string[]; warnings: string[] }> {
    const result = { count: 0, issues: [], warnings: [] };

    try {
      const projects = await db.projects.toArray();
      result.count = projects.length;

      // Validate each project
      for (const project of projects) {
        if (!project.id) {
          result.issues.push(`Project missing ID`);
        }
        if (!project.userId) {
          result.issues.push(`Project ${project.id} missing userId`);
        }
        if (!project.name) {
          result.warnings.push(`Project ${project.id} missing name`);
        }
      }

      // Check for expected project count
      const expectedCount = this.getLegacyProjectCount();
      if (result.count !== expectedCount) {
        result.issues.push(`Project count mismatch: expected ${expectedCount}, got ${result.count}`);
      }

    } catch (error) {
      result.issues.push(`Project validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate asset migration
   */
  private async validateAssetMigration(): Promise<{ count: number; corruptedCount: number; issues: string[]; warnings: string[] }> {
    const result = { count: 0, corruptedCount: 0, issues: [], warnings: [] };

    try {
      const assets = await db.assets.toArray();
      result.count = assets.length;

      // Validate each asset
      for (const asset of assets) {
        try {
          // Validate canonical structure
          validateAssetStrict(asset);

          // Check required fields
          if (!asset.id) {
            result.issues.push(`Asset missing ID`);
            result.corruptedCount++;
          }
          if (!asset.projectId) {
            result.issues.push(`Asset ${asset.id} missing projectId`);
            result.corruptedCount++;
          }
          if (!asset.layout) {
            result.issues.push(`Asset ${asset.id} missing layout`);
            result.corruptedCount++;
          }
          if (!asset.content) {
            result.issues.push(`Asset ${asset.id} missing content`);
            result.corruptedCount++;
          }
          if (!asset.style) {
            result.issues.push(`Asset ${asset.id} missing style`);
            result.corruptedCount++;
          }
          if (!asset.behavior) {
            result.issues.push(`Asset ${asset.id} missing behavior`);
            result.corruptedCount++;
          }
          if (!asset.metadata) {
            result.issues.push(`Asset ${asset.id} missing metadata`);
            result.corruptedCount++;
          }

          // Check metadata integrity
          if (!asset.metadata.createdAt || !asset.metadata.updatedAt) {
            result.warnings.push(`Asset ${asset.id} missing timestamps`);
          }
          if (typeof asset.metadata.version !== 'number') {
            result.warnings.push(`Asset ${asset.id} has invalid version`);
          }

        } catch (error) {
          result.issues.push(`Asset ${asset.id} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.corruptedCount++;
        }
      }

      // Check for expected asset count
      const expectedCount = this.getLegacyAssetCount();
      if (result.count !== expectedCount) {
        result.issues.push(`Asset count mismatch: expected ${expectedCount}, got ${result.count}`);
      }

    } catch (error) {
      result.issues.push(`Asset validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate data integrity
   */
  private async validateDataIntegrity(): Promise<{ issues: string[]; warnings: string[] }> {
    const result = { issues: [], warnings: [] };

    try {
      // Check parent-child relationships
      const assets = await db.assets.toArray();
      const assetIds = new Set(assets.map(a => a.id));

      for (const asset of assets) {
        if (asset.parentId && !assetIds.has(asset.parentId)) {
          result.issues.push(`Asset ${asset.id} references non-existent parent ${asset.parentId}`);
        }
      }

      // Check project references
      const projects = await db.projects.toArray();
      const projectIds = new Set(projects.map(p => p.id));

      for (const asset of assets) {
        if (!projectIds.has(asset.projectId)) {
          result.issues.push(`Asset ${asset.id} references non-existent project ${asset.projectId}`);
        }
      }

      // Check for duplicate IDs
      const idCounts = new Map<string, number>();
      for (const asset of assets) {
        const count = (idCounts.get(asset.id) || 0) + 1;
        idCounts.set(asset.id, count);
        if (count > 1) {
          result.issues.push(`Duplicate asset ID: ${asset.id}`);
        }
      }

    } catch (error) {
      result.issues.push(`Data integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate sync queue
   */
  private async validateSyncQueue(): Promise<{ issues: string[]; warnings: string[] }> {
    const result = { issues: [], warnings: [] };

    try {
      const syncQueue = await db.syncQueue.toArray();
      const assets = await db.assets.toArray();
      const assetIds = new Set(assets.map(a => a.id));

      // Check sync queue entries reference valid assets
      for (const entry of syncQueue) {
        if (!assetIds.has(entry.assetId)) {
          result.issues.push(`Sync queue entry ${entry.id} references non-existent asset ${entry.assetId}`);
        }

        // Validate required fields
        if (!entry.operation) {
          result.issues.push(`Sync queue entry ${entry.id} missing operation`);
        }
        if (!entry.status) {
          result.issues.push(`Sync queue entry ${entry.id} missing status`);
        }
        if (!entry.projectId) {
          result.issues.push(`Sync queue entry ${entry.id} missing projectId`);
        }
      }

      // Check for excessive retry counts
      const highRetryEntries = syncQueue.filter(e => e.retryCount > 3);
      if (highRetryEntries.length > 0) {
        result.warnings.push(`${highRetryEntries.length} sync queue entries have high retry counts`);
      }

    } catch (error) {
      result.issues.push(`Sync queue validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate basic functionality
   */
  private async validateFunctionality(): Promise<{ issues: string[]; warnings: string[] }> {
    const result = { issues: [], warnings: [] };

    try {
      // Test basic CRUD operations
      const testProjectId = crypto.randomUUID();
      const testUserId = 'test-user';

      // Test project creation
      await db.createProject({
        userId: testUserId,
        name: 'Test Project',
        description: 'Validation test project',
        settings: {},
      });

      // Test asset creation
      const testAsset = await db.assets.add({
        projectId: testProjectId,
        id: crypto.randomUUID(),
        parentId: undefined,
        layout: { x: 0, y: 0, width: 100, height: 100 },
        content: { title: 'Test Asset' },
        style: {},
        behavior: {},
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      });

      // Test asset retrieval
      const retrievedAsset = await db.assets.get(testAsset);
      if (!retrievedAsset) {
        result.issues.push('Failed to retrieve test asset');
      }

      // Test asset update
      await db.assets.update(testAsset, {
        content: { title: 'Updated Test Asset' },
      });

      // Test asset deletion
      await db.assets.delete(testAsset);
      await db.projects.delete(testProjectId);

      // Verify cleanup
      const deletedAsset = await db.assets.get(testAsset);
      if (deletedAsset) {
        result.issues.push('Failed to delete test asset');
      }

    } catch (error) {
      result.issues.push(`Functionality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Get legacy project count from localStorage
   */
  private getLegacyProjectCount(): number {
    try {
      const projectsData = localStorage.getItem('kanvas_projects');
      if (!projectsData) return 0;
      const projects = JSON.parse(projectsData);
      return Array.isArray(projects) ? projects.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get legacy asset count from localStorage
   */
  private getLegacyAssetCount(): number {
    try {
      const projectsData = localStorage.getItem('kanvas_projects');
      if (!projectsData) return 0;
      const projects = JSON.parse(projectsData);
      
      let totalAssets = 0;
      for (const project of projects) {
        const assetsData = localStorage.getItem(`kanvas_assets_${project.id}`);
        if (assetsData) {
          const assets = JSON.parse(assetsData);
          totalAssets += Array.isArray(assets) ? assets.length : 0;
        }
      }
      return totalAssets;
    } catch {
      return 0;
    }
  }

  /**
   * Generate validation report
   */
  generateReport(validation: ValidationResult): string {
    const report = [
      '# Migration Validation Report',
      `**Status:** ${validation.valid ? '✅ PASSED' : '❌ FAILED'}`,
      '',
      '## Statistics',
      `- Projects: ${validation.stats.projects}`,
      `- Assets: ${validation.stats.assets}`,
      `- Corrupted Assets: ${validation.stats.corruptedAssets}`,
      `- Missing Assets: ${validation.stats.missingAssets}`,
      '',
    ];

    if (validation.issues.length > 0) {
      report.push('## Issues');
      validation.issues.forEach(issue => {
        report.push(`- ❌ ${issue}`);
      });
      report.push('');
    }

    if (validation.warnings.length > 0) {
      report.push('## Warnings');
      validation.warnings.forEach(warning => {
        report.push(`- ⚠️ ${warning}`);
      });
      report.push('');
    }

    report.push('## Summary');
    if (validation.valid) {
      report.push('✅ Migration completed successfully with no critical issues.');
    } else {
      report.push('❌ Migration has issues that need to be addressed.');
    }

    return report.join('\n');
  }
}

// Export singleton instance
export const migrationValidator = new MigrationValidator();
