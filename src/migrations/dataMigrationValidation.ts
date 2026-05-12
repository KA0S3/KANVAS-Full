/**
 * DATA MIGRATION VALIDATION UTILITIES
 * 
 * Comprehensive validation utilities for ensuring data migration integrity
 * between localStorage, IndexedDB, and Supabase v2 schema.
 * 
 * 🔒 CRITICAL: These utilities validate the canonical asset structure
 * and ensure no data loss during migration.
 */

import { Asset, validateAssetStrict } from '@/types/Asset';
import { supabase } from '@/lib/supabase';
import { db } from '@/storage/indexeddb';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: string;
}

export interface ValidationError {
  code: string;
  message: string;
  entity: 'project' | 'asset' | 'file' | 'sync_queue' | 'system';
  entityId?: string;
  severity: 'critical' | 'error';
  fixRequired: boolean;
  fixSuggestion?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  entity: 'project' | 'asset' | 'file' | 'sync_queue';
  entityId?: string;
  recommendation: string;
}

export interface DataCounts {
  localStorage: {
    projects: number;
    assets: number;
  };
  indexedDB: {
    projects: number;
    assets: number;
    files: number;
    syncQueue: number;
  };
  supabase: {
    projects: number;
    assets: number;
    files: number;
    syncQueue: number;
  };
}

/**
 * Comprehensive data migration validator
 */
export class DataMigrationValidator {
  private validationLog: string[] = [];

  /**
   * Validate complete data migration integrity
   */
  async validateMigrationIntegrity(): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
      summary: '',
    };

    this.log('Starting comprehensive data migration validation...');

    try {
      // Step 1: Validate data counts consistency
      await this.validateDataCounts(result);
      
      // Step 2: Validate canonical asset structure
      await this.validateCanonicalStructure(result);
      
      // Step 3: Validate data integrity
      await this.validateDataIntegrity(result);
      
      // Step 4: Validate forbidden patterns
      await this.validateForbiddenPatterns(result);
      
      // Step 5: Validate performance requirements
      await this.validatePerformanceRequirements(result);
      
      // Generate summary
      result.summary = this.generateValidationSummary(result);
      result.isValid = result.errors.filter(e => e.severity === 'critical').length === 0;
      
      this.log(`Migration validation completed: ${result.isValid ? 'PASSED' : 'FAILED'}`);
      
      return result;

    } catch (error) {
      const errorMessage = `Migration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.log(errorMessage);
      result.errors.push({
        code: 'VALIDATION_FAILED',
        message: errorMessage,
        entity: 'system',
        severity: 'critical',
        fixRequired: true,
        fixSuggestion: 'Check system logs and retry validation',
      });
      result.isValid = false;
      return result;
    }
  }

  /**
   * Validate data counts across all storage layers
   */
  private async validateDataCounts(result: ValidationResult): Promise<void> {
    this.log('Validating data counts consistency...');

    try {
      const counts = await this.getDataCounts();
      
      // Validate project counts
      if (counts.localStorage.projects !== counts.indexedDB.projects) {
        result.errors.push({
          code: 'PROJECT_COUNT_MISMATCH',
          message: `Project count mismatch between localStorage (${counts.localStorage.projects}) and IndexedDB (${counts.indexedDB.projects})`,
          entity: 'project',
          severity: 'error',
          fixRequired: true,
          fixSuggestion: 'Re-run migration script to ensure all projects are migrated',
        });
      }

      if (counts.indexedDB.projects !== counts.supabase.projects) {
        result.errors.push({
          code: 'PROJECT_COUNT_MISMATCH_SUPABASE',
          message: `Project count mismatch between IndexedDB (${counts.indexedDB.projects}) and Supabase (${counts.supabase.projects})`,
          entity: 'project',
          severity: 'error',
          fixRequired: true,
          fixSuggestion: 'Check Supabase sync status and re-sync if necessary',
        });
      }

      // Validate asset counts
      if (counts.localStorage.assets !== counts.indexedDB.assets) {
        result.errors.push({
          code: 'ASSET_COUNT_MISMATCH',
          message: `Asset count mismatch between localStorage (${counts.localStorage.assets}) and IndexedDB (${counts.indexedDB.assets})`,
          entity: 'asset',
          severity: 'error',
          fixRequired: true,
          fixSuggestion: 'Re-run migration script to ensure all assets are migrated',
        });
      }

      if (counts.indexedDB.assets !== counts.supabase.assets) {
        result.errors.push({
          code: 'ASSET_COUNT_MISMATCH_SUPABASE',
          message: `Asset count mismatch between IndexedDB (${counts.indexedDB.assets}) and Supabase (${counts.supabase.assets})`,
          entity: 'asset',
          severity: 'error',
          fixRequired: true,
          fixSuggestion: 'Check Supabase sync status and re-sync if necessary',
        });
      }

      this.log(`Data counts validation completed`);

    } catch (error) {
      this.log(`Data counts validation error: ${error}`);
      result.errors.push({
        code: 'DATA_COUNTS_VALIDATION_FAILED',
        message: `Data counts validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entity: 'system',
        severity: 'error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate canonical asset structure compliance
   */
  private async validateCanonicalStructure(result: ValidationResult): Promise<void> {
    this.log('Validating canonical asset structure...');

    try {
      // Get all assets from IndexedDB
      const assets = await db.assets.toArray();
      
      for (const asset of assets) {
        try {
          // Validate canonical structure
          validateAssetStrict(asset);
          
          // Check for required sections
          const requiredSections = ['layout', 'content', 'style', 'behavior', 'metadata'];
          for (const section of requiredSections) {
            if (!asset[section as keyof Asset]) {
              result.errors.push({
                code: 'MISSING_REQUIRED_SECTION',
                message: `Asset ${asset.id} missing required section: ${section}`,
                entity: 'asset',
                entityId: asset.id,
                severity: 'error',
                fixRequired: true,
                fixSuggestion: `Add missing ${section} section to asset ${asset.id}`,
              });
            }
          }

          // Validate metadata structure
          if (!asset.metadata.createdAt || !asset.metadata.updatedAt) {
            result.errors.push({
              code: 'MISSING_TIMESTAMPS',
              message: `Asset ${asset.id} missing timestamps in metadata`,
              entity: 'asset',
              entityId: asset.id,
              severity: 'error',
              fixRequired: true,
              fixSuggestion: 'Add createdAt and updatedAt to asset metadata',
            });
          }

          if (typeof asset.metadata.version !== 'number') {
            result.errors.push({
              code: 'INVALID_VERSION',
              message: `Asset ${asset.id} has invalid version in metadata`,
              entity: 'asset',
              entityId: asset.id,
              severity: 'error',
              fixRequired: true,
              fixSuggestion: 'Set version to a valid number in asset metadata',
            });
          }

        } catch (error) {
          result.errors.push({
            code: 'INVALID_CANONICAL_STRUCTURE',
            message: `Asset ${asset.id} has invalid canonical structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
            entity: 'asset',
            entityId: asset.id,
            severity: 'error',
            fixRequired: true,
            fixSuggestion: 'Fix asset structure to comply with canonical format',
          });
        }
      }

      this.log(`Canonical structure validation completed for ${assets.length} assets`);

    } catch (error) {
      this.log(`Canonical structure validation error: ${error}`);
      result.errors.push({
        code: 'CANONICAL_STRUCTURE_VALIDATION_FAILED',
        message: `Canonical structure validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entity: 'system',
        severity: 'error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate data integrity (relationships, references)
   */
  private async validateDataIntegrity(result: ValidationResult): Promise<void> {
    this.log('Validating data integrity...');

    try {
      // Validate parent-child relationships
      const assets = await db.assets.toArray();
      const assetIds = new Set(assets.map(a => a.id));

      for (const asset of assets) {
        if (asset.parentId && !assetIds.has(asset.parentId)) {
          result.errors.push({
            code: 'INVALID_PARENT_REFERENCE',
            message: `Asset ${asset.id} references non-existent parent ${asset.parentId}`,
            entity: 'asset',
            entityId: asset.id,
            severity: 'error',
            fixRequired: true,
            fixSuggestion: `Remove or update parent reference for asset ${asset.id}`,
          });
        }
      }

      // Validate project references
      const projects = await db.projects.toArray();
      const projectIds = new Set(projects.map(p => p.id));

      for (const asset of assets) {
        if (!projectIds.has(asset.projectId)) {
          result.errors.push({
            code: 'INVALID_PROJECT_REFERENCE',
            message: `Asset ${asset.id} references non-existent project ${asset.projectId}`,
            entity: 'asset',
            entityId: asset.id,
            severity: 'error',
            fixRequired: true,
            fixSuggestion: `Update or remove asset ${asset.id} with invalid project reference`,
          });
        }
      }

      // Validate file references
      const files = await db.files.toArray();
      for (const file of files) {
        if (!assetIds.has(file.assetId)) {
          result.errors.push({
            code: 'INVALID_FILE_REFERENCE',
            message: `File ${file.id} references non-existent asset ${file.assetId}`,
            entity: 'file',
            entityId: file.id,
            severity: 'error',
            fixRequired: true,
            fixSuggestion: `Remove file ${file.id} with invalid asset reference`,
          });
        }
      }

      this.log('Data integrity validation completed');

    } catch (error) {
      this.log(`Data integrity validation error: ${error}`);
      result.errors.push({
        code: 'DATA_INTEGRITY_VALIDATION_FAILED',
        message: `Data integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entity: 'system',
        severity: 'error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate forbidden patterns (schema drift prevention)
   */
  private async validateForbiddenPatterns(result: ValidationResult): Promise<void> {
    this.log('Validating forbidden patterns...');

    try {
      const assets = await db.assets.toArray();
      const forbiddenFields = [
        'sync_status', 'upload_progress', 'selection_state', 
        'hover_state', 'drag_state', 'transient_ui_state'
      ];

      for (const asset of assets) {
        // Check all sections for forbidden fields
        const sections = [asset.layout, asset.content, asset.style, asset.behavior, asset.metadata];
        
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionName = ['layout', 'content', 'style', 'behavior', 'metadata'][i];
          
          if (section && typeof section === 'object') {
            for (const field of forbiddenFields) {
              if (field in section) {
                result.errors.push({
                  code: 'FORBIDDEN_FIELD_PRESENT',
                  message: `Forbidden field '${field}' found in ${sectionName} of asset ${asset.id}`,
                  entity: 'asset',
                  entityId: asset.id,
                  severity: 'error',
                  fixRequired: true,
                  fixSuggestion: `Remove forbidden field '${field}' from ${sectionName} section`,
                });
              }
            }
          }
        }
      }

      this.log('Forbidden patterns validation completed');

    } catch (error) {
      this.log(`Forbidden patterns validation error: ${error}`);
      result.errors.push({
        code: 'FORBIDDEN_PATTERNS_VALIDATION_FAILED',
        message: `Forbidden patterns validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entity: 'system',
        severity: 'error',
        fixRequired: true,
      });
    }
  }

  /**
   * Validate performance requirements
   */
  private async validatePerformanceRequirements(result: ValidationResult): Promise<void> {
    this.log('Validating performance requirements...');

    try {
      const assets = await db.assets.toArray();
      
      // Check for performance issues
      if (assets.length > 10000) {
        result.warnings.push({
          code: 'LARGE_PROJECT_SIZE',
          message: `Large project detected with ${assets.length} assets`,
          entity: 'asset',
          recommendation: 'Consider implementing viewport culling and spatial indexing for optimal performance',
        });
      }

      // Check for large assets
      for (const asset of assets) {
        const assetSize = JSON.stringify(asset).length;
        if (assetSize > 10000) { // 10KB per asset
          result.warnings.push({
            code: 'LARGE_ASSET_SIZE',
            message: `Asset ${asset.id} is large (${assetSize} bytes)`,
            entity: 'asset',
            entityId: asset.id,
            recommendation: 'Consider optimizing asset data structure or moving large data to separate storage',
          });
        }
      }

      this.log('Performance requirements validation completed');

    } catch (error) {
      this.log(`Performance requirements validation error: ${error}`);
      result.errors.push({
        code: 'PERFORMANCE_VALIDATION_FAILED',
        message: `Performance validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        entity: 'system',
        severity: 'error',
        fixRequired: false, // Performance warnings are not critical
      });
    }
  }

  /**
   * Get data counts from all storage layers
   */
  private async getDataCounts(): Promise<DataCounts> {
    const counts: DataCounts = {
      localStorage: { projects: 0, assets: 0 },
      indexedDB: { projects: 0, assets: 0, files: 0, syncQueue: 0 },
      supabase: { projects: 0, assets: 0, files: 0, syncQueue: 0 },
    };

    // localStorage counts
    try {
      const projectsData = localStorage.getItem('kanvas_projects');
      if (projectsData) {
        const projects = JSON.parse(projectsData);
        counts.localStorage.projects = Array.isArray(projects) ? projects.length : 0;
        
        // Count assets
        for (const project of projects) {
          const assetsKey = `kanvas_assets_${project.id}`;
          const assetsData = localStorage.getItem(assetsKey);
          if (assetsData) {
            const assets = JSON.parse(assetsData);
            counts.localStorage.assets += Array.isArray(assets) ? assets.length : 0;
          }
        }
      }
    } catch (error) {
      this.log(`Error counting localStorage data: ${error}`);
    }

    // IndexedDB counts
    try {
      counts.indexedDB.projects = await db.projects.count();
      counts.indexedDB.assets = await db.assets.count();
      counts.indexedDB.files = await db.files.count();
      counts.indexedDB.syncQueue = await db.syncQueue.count();
    } catch (error) {
      this.log(`Error counting IndexedDB data: ${error}`);
    }

    // Supabase counts
    try {
      const { data: projects } = await supabase.from('projects_v2').select('id', { count: 'exact', head: true });
      const { data: assets } = await supabase.from('assets_v2').select('id', { count: 'exact', head: true });
      const { data: files } = await supabase.from('files_v2').select('id', { count: 'exact', head: true });
      const { data: syncQueue } = await supabase.from('sync_queue_v2').select('id', { count: 'exact', head: true });
      
      counts.supabase.projects = projects?.length || 0;
      counts.supabase.assets = assets?.length || 0;
      counts.supabase.files = files?.length || 0;
      counts.supabase.syncQueue = syncQueue?.length || 0;
    } catch (error) {
      this.log(`Error counting Supabase data: ${error}`);
    }

    return counts;
  }

  /**
   * Generate validation summary
   */
  private generateValidationSummary(result: ValidationResult): string {
    const criticalErrors = result.errors.filter(e => e.severity === 'critical').length;
    const errors = result.errors.filter(e => e.severity === 'error').length;
    const warnings = result.warnings.length;

    if (criticalErrors > 0) {
      return `❌ CRITICAL: ${criticalErrors} critical errors detected. Migration integrity compromised.`;
    } else if (errors > 0) {
      return `⚠️ FAILED: ${errors} errors detected. Migration requires fixes.`;
    } else if (warnings > 0) {
      return `⚠️ WARNING: ${warnings} warnings detected. Migration completed with minor issues.`;
    } else {
      return '✅ PASSED: Migration validation completed successfully with no issues.';
    }
  }

  /**
   * Log validation events
   */
  private log(message: string): void {
    this.validationLog.push(`${new Date().toISOString()}: ${message}`);
    console.log(`[Migration Validation] ${message}`);
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
  generateReport(result: ValidationResult): string {
    const report = [
      '# Data Migration Validation Report',
      `**Status:** ${result.isValid ? '✅ PASSED' : '❌ FAILED'}`,
      `**Timestamp:** ${new Date().toISOString()}`,
      '',
      '## Summary',
      result.summary,
      '',
      '## Validation Results',
      `- Errors: ${result.errors.length}`,
      `- Warnings: ${result.warnings.length}`,
      '',
    ];

    if (result.errors.length > 0) {
      report.push('## Errors');
      const criticalErrors = result.errors.filter(e => e.severity === 'critical');
      const regularErrors = result.errors.filter(e => e.severity === 'error');
      
      if (criticalErrors.length > 0) {
        report.push('### Critical Errors');
        criticalErrors.forEach(error => {
          report.push(`- **${error.code}:** ${error.message}`);
          if (error.entityId) report.push(`  - Entity ID: ${error.entityId}`);
          if (error.fixSuggestion) report.push(`  - Fix: ${error.fixSuggestion}`);
          report.push('');
        });
      }
      
      if (regularErrors.length > 0) {
        report.push('### Errors');
        regularErrors.forEach(error => {
          report.push(`- **${error.code}:** ${error.message}`);
          if (error.entityId) report.push(`  - Entity ID: ${error.entityId}`);
          if (error.fixSuggestion) report.push(`  - Fix: ${error.fixSuggestion}`);
          report.push('');
        });
      }
    }

    if (result.warnings.length > 0) {
      report.push('## Warnings');
      result.warnings.forEach(warning => {
        report.push(`- **${warning.code}:** ${warning.message}`);
        if (warning.entityId) report.push(`  - Entity ID: ${warning.entityId}`);
        report.push(`  - Recommendation: ${warning.recommendation}`);
        report.push('');
      });
    }

    return report.join('\n');
  }
}

// Export singleton instance
export const dataMigrationValidator = new DataMigrationValidator();

// Export main validation function
export const validateDataMigration = () => dataMigrationValidator.validateMigrationIntegrity();

/**
 * Quick validation utility for specific checks
 */
export async function quickValidateAssetStructure(asset: Asset): Promise<ValidationResult> {
  const validator = new DataMigrationValidator();
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    summary: '',
  };

  try {
    validateAssetStrict(asset);
    result.isValid = true;
    result.summary = '✅ Asset structure is valid';
  } catch (error) {
    result.errors.push({
      code: 'INVALID_ASSET_STRUCTURE',
      message: `Asset structure validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      entity: 'asset',
      entityId: asset.id,
      severity: 'error',
      fixRequired: true,
      fixSuggestion: 'Fix asset structure to comply with canonical format',
    });
    result.summary = '❌ Asset structure validation failed';
  }

  return result;
}

/**
 * Validate migration readiness
 */
export async function validateMigrationReadiness(): Promise<ValidationResult> {
  const validator = new DataMigrationValidator();
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    summary: '',
  };

  try {
    // Check localStorage data availability
    const projectsData = localStorage.getItem('kanvas_projects');
    if (!projectsData) {
      result.errors.push({
        code: 'NO_LOCALSTORAGE_DATA',
        message: 'No data found in localStorage',
        entity: 'system',
        severity: 'critical',
        fixRequired: true,
        fixSuggestion: 'Ensure localStorage contains project data before migration',
      });
    }

    // Check IndexedDB availability
    try {
      await db.open();
    } catch (error) {
      result.errors.push({
        code: 'INDEXEDDB_UNAVAILABLE',
        message: 'IndexedDB is not available',
        entity: 'system',
        severity: 'critical',
        fixRequired: true,
        fixSuggestion: 'Check browser IndexedDB support and permissions',
      });
    }

    // Check Supabase connectivity
    try {
      await supabase.from('projects_v2').select('id').limit(1);
    } catch (error) {
      result.errors.push({
        code: 'SUPABASE_UNAVAILABLE',
        message: 'Supabase is not available',
        entity: 'system',
        severity: 'critical',
        fixRequired: true,
        fixSuggestion: 'Check Supabase configuration and network connectivity',
      });
    }

    result.isValid = result.errors.filter(e => e.severity === 'critical').length === 0;
    result.summary = result.isValid ? '✅ Migration readiness validated' : '❌ Migration readiness failed';

  } catch (error) {
    result.errors.push({
      code: 'READINESS_VALIDATION_FAILED',
      message: `Migration readiness validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      entity: 'system',
      severity: 'critical',
      fixRequired: true,
    });
    result.isValid = false;
    result.summary = '❌ Migration readiness validation failed';
  }

  return result;
}
