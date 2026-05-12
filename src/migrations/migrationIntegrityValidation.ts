/**
 * MIGRATION INTEGRITY VALIDATION SYSTEM
 * 
 * Comprehensive validation system for ensuring migration integrity
 * between localStorage, IndexedDB, and Supabase v2 schema.
 * 
 * 🔒 CRITICAL: This system ensures no data loss and validates
 * the canonical asset structure implementation.
 */

import { Asset, validateAssetStrict } from '@/types/Asset';
import { supabase } from '@/lib/supabase';
import { db } from '@/storage/indexeddb';

export interface IntegrityValidationResult {
  valid: boolean;
  timestamp: string;
  localStorage: {
    projects: number;
    assets: number;
    corrupted: number;
  };
  indexedDB: {
    projects: number;
    assets: number;
    files: number;
    syncQueue: number;
    corrupted: number;
  };
  supabase: {
    projects: number;
    assets: number;
    files: number;
    syncQueue: number;
    corrupted: number;
  };
  crossValidation: {
    projectCountMatch: boolean;
    assetCountMatch: boolean;
    parentChildIntegrity: boolean;
    projectReferences: boolean;
  };
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
  summary: string;
}

export interface ValidationIssue {
  severity: 'critical' | 'error';
  type: 'data_loss' | 'structure_violation' | 'reference_integrity' | 'schema_drift';
  entity: 'project' | 'asset' | 'file' | 'sync_queue' | 'system';
  entityId?: string;
  description: string;
  expected: any;
  actual: any;
  fixRequired: boolean;
}

export interface ValidationWarning {
  type: 'performance' | 'data_quality' | 'best_practice';
  entity: 'project' | 'asset' | 'file' | 'sync_queue';
  entityId?: string;
  description: string;
  recommendation: string;
}

export class MigrationIntegrityValidator {
  private validationLog: string[] = [];

  /**
   * Perform comprehensive integrity validation across all storage layers
   */
  async validateFullIntegrity(): Promise<IntegrityValidationResult> {
    const result: IntegrityValidationResult = {
      valid: false,
      timestamp: new Date().toISOString(),
      localStorage: { projects: 0, assets: 0, corrupted: 0 },
      indexedDB: { projects: 0, assets: 0, files: 0, syncQueue: 0, corrupted: 0 },
      supabase: { projects: 0, assets: 0, files: 0, syncQueue: 0, corrupted: 0 },
      crossValidation: {
        projectCountMatch: false,
        assetCountMatch: false,
        parentChildIntegrity: false,
        projectReferences: false,
      },
      issues: [],
      warnings: [],
      summary: '',
    };

    this.log('Starting comprehensive migration integrity validation...');

    try {
      // Step 1: Validate localStorage data
      await this.validateLocalStorage(result);
      
      // Step 2: Validate IndexedDB data
      await this.validateIndexedDB(result);
      
      // Step 3: Validate Supabase v2 data
      await this.validateSupabaseV2(result);
      
      // Step 4: Cross-validation between storage layers
      await this.performCrossValidation(result);
      
      // Step 5: Validate canonical asset structure
      await this.validateCanonicalStructure(result);
      
      // Step 6: Generate summary
      result.summary = this.generateValidationSummary(result);
      result.valid = result.issues.filter(i => i.severity === 'critical').length === 0;
      
      this.log(`Integrity validation completed: ${result.valid ? 'PASSED' : 'FAILED'}`);
      
      return result;

    } catch (error) {
      const errorMessage = `Integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.log(errorMessage);
      result.issues.push({
        severity: 'critical',
        type: 'data_loss',
        entity: 'system',
        description: errorMessage,
        expected: 'Successful validation',
        actual: error instanceof Error ? error.message : 'Unknown error',
        fixRequired: true,
      });
      result.valid = false;
      return result;
    }
  }

  /**
   * Validate localStorage data structure and counts
   */
  private async validateLocalStorage(result: IntegrityValidationResult): Promise<void> {
    this.log('Validating localStorage data...');

    try {
      // Validate projects
      const projectsData = localStorage.getItem('kanvas_projects');
      if (projectsData) {
        const projects = JSON.parse(projectsData);
        result.localStorage.projects = Array.isArray(projects) ? projects.length : 0;
        
        // Validate project structure
        if (Array.isArray(projects)) {
          for (const project of projects) {
            if (!project.id || !project.user_id || !project.name) {
              result.localStorage.corrupted++;
              result.issues.push({
                severity: 'error',
                type: 'structure_violation',
                entity: 'project',
                entityId: project.id,
                description: 'Invalid project structure in localStorage',
                expected: 'id, user_id, name fields',
                actual: Object.keys(project),
                fixRequired: true,
              });
            }
          }
        }
      }

      // Validate assets
      const projectsDataForAssets = localStorage.getItem('kanvas_projects');
      if (projectsDataForAssets) {
        const projects = JSON.parse(projectsDataForAssets);
        let totalAssets = 0;
        
        for (const project of projects) {
          const assetsKey = `kanvas_assets_${project.id}`;
          const assetsData = localStorage.getItem(assetsKey);
          
          if (assetsData) {
            const assets = JSON.parse(assetsData);
            totalAssets += Array.isArray(assets) ? assets.length : 0;
            
            // Validate asset structure
            if (Array.isArray(assets)) {
              for (const asset of assets) {
                if (!asset.asset_id || !project.id || !asset.name) {
                  result.localStorage.corrupted++;
                  result.issues.push({
                    severity: 'error',
                    type: 'structure_violation',
                    entity: 'asset',
                    entityId: asset.asset_id,
                    description: 'Invalid asset structure in localStorage',
                    expected: 'asset_id, project_id, name fields',
                    actual: Object.keys(asset),
                    fixRequired: true,
                  });
                }
              }
            }
          }
        }
        
        result.localStorage.assets = totalAssets;
      }

      this.log(`LocalStorage validation: ${result.localStorage.projects} projects, ${result.localStorage.assets} assets, ${result.localStorage.corrupted} corrupted`);

    } catch (error) {
      this.log(`LocalStorage validation error: ${error}`);
      result.issues.push({
        severity: 'critical',
        type: 'data_loss',
        entity: 'system',
        description: `localStorage validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expected: 'Valid localStorage data',
        actual: error instanceof Error ? error.message : 'Unknown error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate IndexedDB data structure and canonical compliance
   */
  private async validateIndexedDB(result: IntegrityValidationResult): Promise<void> {
    this.log('Validating IndexedDB data...');

    try {
      // Validate projects
      const projects = await db.projects.toArray();
      result.indexedDB.projects = projects.length;
      
      for (const project of projects) {
        if (!project.id || !project.userId || !project.name) {
          result.indexedDB.corrupted++;
          result.issues.push({
            severity: 'error',
            type: 'structure_violation',
            entity: 'project',
            entityId: project.id,
            description: 'Invalid project structure in IndexedDB',
            expected: 'id, userId, name fields',
            actual: Object.keys(project),
            fixRequired: true,
          });
        }
      }

      // Validate assets
      const assets = await db.assets.toArray();
      result.indexedDB.assets = assets.length;
      
      for (const asset of assets) {
        try {
          // Validate canonical structure
          validateAssetStrict(asset);
          
          // Check for forbidden fields
          const assetData = {
            layout: asset.layout,
            content: asset.content,
            style: asset.style,
            behavior: asset.behavior,
            metadata: asset.metadata,
          };
          
          this.validateNoForbiddenFields(assetData, asset.id, result);
          
        } catch (error) {
          result.indexedDB.corrupted++;
          result.issues.push({
            severity: 'error',
            type: 'structure_violation',
            entity: 'asset',
            entityId: asset.id,
            description: `Asset structure validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            expected: 'Valid canonical asset structure',
            actual: error instanceof Error ? error.message : 'Unknown error',
            fixRequired: true,
          });
        }
      }

      // Validate files
      const files = await db.files.toArray();
      result.indexedDB.files = files.length;

      // Validate sync queue
      const syncQueue = await db.syncQueue.toArray();
      result.indexedDB.syncQueue = syncQueue.length;

      this.log(`IndexedDB validation: ${result.indexedDB.projects} projects, ${result.indexedDB.assets} assets, ${result.indexedDB.corrupted} corrupted`);

    } catch (error) {
      this.log(`IndexedDB validation error: ${error}`);
      result.issues.push({
        severity: 'critical',
        type: 'data_loss',
        entity: 'system',
        description: `IndexedDB validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expected: 'Valid IndexedDB data',
        actual: error instanceof Error ? error.message : 'Unknown error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate Supabase v2 schema data
   */
  private async validateSupabaseV2(result: IntegrityValidationResult): Promise<void> {
    this.log('Validating Supabase v2 data...');

    try {
      // Validate projects_v2
      const { data: projects, error: projectsError } = await supabase
        .from('projects_v2')
        .select('id, user_id, name, settings, version, created_at, updated_at')
        .is('deleted_at', null);

      if (projectsError) {
        throw new Error(`Projects query failed: ${projectsError.message}`);
      }

      result.supabase.projects = projects.length;

      for (const project of projects) {
        if (!project.id || !project.user_id || !project.name) {
          result.supabase.corrupted++;
          result.issues.push({
            severity: 'error',
            type: 'structure_violation',
            entity: 'project',
            entityId: project.id,
            description: 'Invalid project structure in Supabase v2',
            expected: 'id, user_id, name fields',
            actual: Object.keys(project),
            fixRequired: true,
          });
        }
      }

      // Validate assets_v2
      const { data: assets, error: assetsError } = await supabase
        .from('assets_v2')
        .select('id, project_id, parent_id, layout, content, style, behavior, metadata')
        .is('deleted_at', null);

      if (assetsError) {
        throw new Error(`Assets query failed: ${assetsError.message}`);
      }

      result.supabase.assets = assets.length;

      for (const asset of assets) {
        try {
          // Validate canonical structure using Supabase validation function
          const { data: validation, error: validationError } = await supabase
            .rpc('validate_canonical_asset', {
              asset_data: {
                layout: asset.layout,
                content: asset.content,
                style: asset.style,
                behavior: asset.behavior,
                metadata: asset.metadata,
              }
            });

          if (validationError || !validation) {
            result.supabase.corrupted++;
            result.issues.push({
              severity: 'error',
              type: 'structure_violation',
              entity: 'asset',
              entityId: asset.id,
              description: 'Asset structure validation failed in Supabase',
              expected: 'Valid canonical asset structure',
              actual: validationError?.message || 'Validation returned false',
              fixRequired: true,
            });
          }

        } catch (error) {
          result.supabase.corrupted++;
          result.issues.push({
            severity: 'error',
            type: 'structure_violation',
            entity: 'asset',
            entityId: asset.id,
            description: `Asset validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            expected: 'Successful validation',
            actual: error instanceof Error ? error.message : 'Unknown error',
            fixRequired: true,
          });
        }
      }

      // Validate files_v2
      const { data: files, error: filesError } = await supabase
        .from('files_v2')
        .select('id, project_id, asset_id, storage_key, mime_type, size_bytes');

      if (filesError) {
        throw new Error(`Files query failed: ${filesError.message}`);
      }

      result.supabase.files = files.length;

      // Validate sync_queue_v2
      const { data: syncQueue, error: syncQueueError } = await supabase
        .from('sync_queue_v2')
        .select('id, project_id, asset_id, operation, status, retry_count');

      if (syncQueueError) {
        throw new Error(`Sync queue query failed: ${syncQueueError.message}`);
      }

      result.supabase.syncQueue = syncQueue.length;

      this.log(`Supabase v2 validation: ${result.supabase.projects} projects, ${result.supabase.assets} assets, ${result.supabase.corrupted} corrupted`);

    } catch (error) {
      this.log(`Supabase v2 validation error: ${error}`);
      result.issues.push({
        severity: 'critical',
        type: 'data_loss',
        entity: 'system',
        description: `Supabase v2 validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expected: 'Valid Supabase v2 data',
        actual: error instanceof Error ? error.message : 'Unknown error',
        fixRequired: true,
      });
    }
  }

  /**
   * Perform cross-validation between storage layers
   */
  private async performCrossValidation(result: IntegrityValidationResult): Promise<void> {
    this.log('Performing cross-validation...');

    try {
      // Validate project count consistency
      result.crossValidation.projectCountMatch = 
        result.localStorage.projects === result.indexedDB.projects &&
        result.indexedDB.projects === result.supabase.projects;

      if (!result.crossValidation.projectCountMatch) {
        result.issues.push({
          severity: 'error',
          type: 'data_loss',
          entity: 'project',
          description: 'Project count mismatch between storage layers',
          expected: `Same count in all layers (${result.localStorage.projects})`,
          actual: `localStorage: ${result.localStorage.projects}, IndexedDB: ${result.indexedDB.projects}, Supabase: ${result.supabase.projects}`,
          fixRequired: true,
        });
      }

      // Validate asset count consistency
      result.crossValidation.assetCountMatch = 
        result.localStorage.assets === result.indexedDB.assets &&
        result.indexedDB.assets === result.supabase.assets;

      if (!result.crossValidation.assetCountMatch) {
        result.issues.push({
          severity: 'error',
          type: 'data_loss',
          entity: 'asset',
          description: 'Asset count mismatch between storage layers',
          expected: `Same count in all layers (${result.localStorage.assets})`,
          actual: `localStorage: ${result.localStorage.assets}, IndexedDB: ${result.indexedDB.assets}, Supabase: ${result.supabase.assets}`,
          fixRequired: true,
        });
      }

      // Validate parent-child relationships
      await this.validateParentChildRelationships(result);

      // Validate project references
      await this.validateProjectReferences(result);

      this.log('Cross-validation completed');

    } catch (error) {
      this.log(`Cross-validation error: ${error}`);
      result.issues.push({
        severity: 'error',
        type: 'reference_integrity',
        entity: 'system',
        description: `Cross-validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expected: 'Successful cross-validation',
        actual: error instanceof Error ? error.message : 'Unknown error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate parent-child relationships
   */
  private async validateParentChildRelationships(result: IntegrityValidationResult): Promise<void> {
    try {
      // Get all assets from IndexedDB
      const assets = await db.assets.toArray();
      const assetIds = new Set(assets.map(a => a.id));

      let invalidParentCount = 0;
      for (const asset of assets) {
        if (asset.parentId && !assetIds.has(asset.parentId)) {
          invalidParentCount++;
          result.issues.push({
            severity: 'error',
            type: 'reference_integrity',
            entity: 'asset',
            entityId: asset.id,
            description: `Asset references non-existent parent`,
            expected: `Valid parent ID`,
            actual: asset.parentId,
            fixRequired: true,
          });
        }
      }

      result.crossValidation.parentChildIntegrity = invalidParentCount === 0;

    } catch (error) {
      this.log(`Parent-child validation error: ${error}`);
    }
  }

  /**
   * Validate project references in assets
   */
  private async validateProjectReferences(result: IntegrityValidationResult): Promise<void> {
    try {
      // Get all projects and assets from IndexedDB
      const projects = await db.projects.toArray();
      const assets = await db.assets.toArray();
      
      const projectIds = new Set(projects.map(p => p.id));
      let invalidProjectCount = 0;

      for (const asset of assets) {
        if (!projectIds.has(asset.projectId)) {
          invalidProjectCount++;
          result.issues.push({
            severity: 'error',
            type: 'reference_integrity',
            entity: 'asset',
            entityId: asset.id,
            description: `Asset references non-existent project`,
            expected: `Valid project ID`,
            actual: asset.projectId,
            fixRequired: true,
          });
        }
      }

      result.crossValidation.projectReferences = invalidProjectCount === 0;

    } catch (error) {
      this.log(`Project reference validation error: ${error}`);
    }
  }

  /**
   * Validate canonical asset structure compliance
   */
  private async validateCanonicalStructure(result: IntegrityValidationResult): Promise<void> {
    this.log('Validating canonical asset structure...');

    try {
      // Run Supabase validation function
      const { data: validationResults, error } = await supabase
        .rpc('validate_v2_migration_integrity');

      if (error) {
        throw new Error(`Migration integrity validation failed: ${error.message}`);
      }

      if (validationResults) {
        for (const validation of validationResults) {
          if (validation.status === 'FAIL') {
            result.issues.push({
              severity: 'error',
              type: 'structure_violation',
              entity: validation.validation_type as any,
              description: `${validation.validation_type} validation failed`,
              expected: validation.expected_count,
              actual: validation.actual_count,
              fixRequired: true,
            });

            // Add specific issues
            if (validation.issues && validation.issues.length > 0) {
              for (const issue of validation.issues) {
                result.issues.push({
                  severity: 'error',
                  type: 'structure_violation',
                  entity: validation.validation_type as any,
                  description: issue,
                  expected: 'Valid structure',
                  actual: 'Invalid structure',
                  fixRequired: true,
                });
              }
            }
          }
        }
      }

    } catch (error) {
      this.log(`Canonical structure validation error: ${error}`);
      result.issues.push({
        severity: 'error',
        type: 'structure_violation',
        entity: 'system',
        description: `Canonical structure validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        expected: 'Successful validation',
        actual: error instanceof Error ? error.message : 'Unknown error',
        fixRequired: true,
      });
    }
  }

  /**
   * Check for forbidden fields in asset data
   */
  private validateNoForbiddenFields(assetData: any, assetId: string, result: IntegrityValidationResult): void {
    const forbiddenFields = ['sync_status', 'upload_progress', 'selection_state', 'hover_state', 'drag_state'];
    
    for (const section of Object.values(assetData)) {
      if (typeof section === 'object' && section !== null) {
        for (const field of forbiddenFields) {
          if (field in section) {
            result.issues.push({
              severity: 'error',
              type: 'schema_drift',
              entity: 'asset',
              entityId: assetId,
              description: `Forbidden field '${field}' found in asset data`,
              expected: 'No forbidden fields',
              actual: `Field '${field}' present`,
              fixRequired: true,
            });
          }
        }
      }
    }
  }

  /**
   * Generate validation summary
   */
  private generateValidationSummary(result: IntegrityValidationResult): string {
    const criticalIssues = result.issues.filter(i => i.severity === 'critical').length;
    const errorIssues = result.issues.filter(i => i.severity === 'error').length;
    const totalIssues = result.issues.length;

    if (criticalIssues > 0) {
      return `❌ CRITICAL: ${criticalIssues} critical issues detected. Migration integrity compromised.`;
    } else if (errorIssues > 0) {
      return `⚠️ FAILED: ${errorIssues} errors detected. Migration requires fixes.`;
    } else if (totalIssues === 0) {
      return '✅ PASSED: Migration integrity validated successfully with no issues.';
    } else {
      return `⚠️ WARNING: ${totalIssues} warnings detected. Migration completed with minor issues.`;
    }
  }

  /**
   * Log validation events
   */
  private log(message: string): void {
    this.validationLog.push(`${new Date().toISOString()}: ${message}`);
    console.log(`[Migration Integrity] ${message}`);
  }

  /**
   * Get validation log
   */
  getValidationLog(): string[] {
    return [...this.validationLog];
  }

  /**
   * Clear validation log
   */
  clearLog(): void {
    this.validationLog = [];
  }

  /**
   * Generate detailed validation report
   */
  generateReport(result: IntegrityValidationResult): string {
    const report = [
      '# Migration Integrity Validation Report',
      `**Status:** ${result.valid ? '✅ PASSED' : '❌ FAILED'}`,
      `**Timestamp:** ${result.timestamp}`,
      '',
      '## Summary',
      result.summary,
      '',
      '## Data Counts',
      '| Storage Layer | Projects | Assets | Files | Sync Queue | Corrupted |',
      '|---------------|----------|--------|-------|------------|-----------|',
      `| localStorage | ${result.localStorage.projects} | ${result.localStorage.assets} | - | - | ${result.localStorage.corrupted} |`,
      `| IndexedDB | ${result.indexedDB.projects} | ${result.indexedDB.assets} | ${result.indexedDB.files} | ${result.indexedDB.syncQueue} | ${result.indexedDB.corrupted} |`,
      `| Supabase v2 | ${result.supabase.projects} | ${result.supabase.assets} | ${result.supabase.files} | ${result.supabase.syncQueue} | ${result.supabase.corrupted} |`,
      '',
      '## Cross-Validation',
      `- Project Count Match: ${result.crossValidation.projectCountMatch ? '✅' : '❌'}`,
      `- Asset Count Match: ${result.crossValidation.assetCountMatch ? '✅' : '❌'}`,
      `- Parent-Child Integrity: ${result.crossValidation.parentChildIntegrity ? '✅' : '❌'}`,
      `- Project References: ${result.crossValidation.projectReferences ? '✅' : '❌'}`,
      '',
    ];

    if (result.issues.length > 0) {
      report.push('## Issues');
      const criticalIssues = result.issues.filter(i => i.severity === 'critical');
      const errorIssues = result.issues.filter(i => i.severity === 'error');
      
      if (criticalIssues.length > 0) {
        report.push('### Critical Issues');
        criticalIssues.forEach(issue => {
          report.push(`- **CRITICAL:** ${issue.description}`);
          report.push(`  - Entity: ${issue.entity}${issue.entityId ? ` (${issue.entityId})` : ''}`);
          report.push(`  - Expected: ${issue.expected}`);
          report.push(`  - Actual: ${issue.actual}`);
          report.push(`  - Fix Required: ${issue.fixRequired ? 'Yes' : 'No'}`);
          report.push('');
        });
      }
      
      if (errorIssues.length > 0) {
        report.push('### Errors');
        errorIssues.forEach(issue => {
          report.push(`- **ERROR:** ${issue.description}`);
          report.push(`  - Entity: ${issue.entity}${issue.entityId ? ` (${issue.entityId})` : ''}`);
          report.push(`  - Expected: ${issue.expected}`);
          report.push(`  - Actual: ${issue.actual}`);
          report.push(`  - Fix Required: ${issue.fixRequired ? 'Yes' : 'No'}`);
          report.push('');
        });
      }
    }

    if (result.warnings.length > 0) {
      report.push('## Warnings');
      result.warnings.forEach(warning => {
        report.push(`- **WARNING:** ${warning.description}`);
        report.push(`  - Entity: ${warning.entity}${warning.entityId ? ` (${warning.entityId})` : ''}`);
        report.push(`  - Recommendation: ${warning.recommendation}`);
        report.push('');
      });
    }

    return report.join('\n');
  }
}

// Export singleton instance
export const migrationIntegrityValidator = new MigrationIntegrityValidator();

// Export main validation function
export const validateMigrationIntegrity = () => migrationIntegrityValidator.validateFullIntegrity();
