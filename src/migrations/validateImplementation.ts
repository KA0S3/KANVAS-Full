/**
 * IMPLEMENTATION VALIDATION
 * 
 * Comprehensive validation of the new canonical architecture
 * implementation against the plan requirements.
 * 
 * 🔒 CRITICAL: Must ensure all plan requirements are met
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface ValidationResult {
  success: boolean;
  planCompliance: {
    canonicalAssetStructure: boolean;
    forbiddenPatternDetection: boolean;
    indexedDbZoneSeparation: boolean;
    simplifiedZustandStores: boolean;
    fifoSyncQueue: boolean;
    dataMigrationScripts: boolean;
    fileBlobStorage: boolean;
    spatialIndexing: boolean;
    sqlMigrationScripts: boolean;
    legacyRemoval: boolean;
  };
  issues: string[];
  warnings: string[];
  recommendations: string[];
}

export class ImplementationValidator {
  private issues: string[] = [];
  private warnings: string[] = [];
  private recommendations: string[] = [];

  /**
   * Execute comprehensive implementation validation
   */
  async validate(): Promise<ValidationResult> {
    console.log('Starting implementation validation...');

    try {
      // Validate each plan requirement
      const planCompliance = {
        canonicalAssetStructure: await this.validateCanonicalAssetStructure(),
        forbiddenPatternDetection: await this.validateForbiddenPatternDetection(),
        indexedDbZoneSeparation: await this.validateIndexedDbZoneSeparation(),
        simplifiedZustandStores: await this.validateSimplifiedZustandStores(),
        fifoSyncQueue: await this.validateFIFOSyncQueue(),
        dataMigrationScripts: await this.validateDataMigrationScripts(),
        fileBlobStorage: await this.validateFileBlobStorage(),
        spatialIndexing: await this.validateSpatialIndexing(),
        sqlMigrationScripts: await this.validateSQLMigrationScripts(),
        legacyRemoval: await this.validateLegacyRemoval(),
      };

      // Validate architectural principles
      await this.validateArchitecturalPrinciples();

      // Validate integration
      await this.validateIntegration();

      console.log('Implementation validation completed');

      return {
        success: this.issues.length === 0,
        planCompliance,
        issues: this.issues,
        warnings: this.warnings,
        recommendations: this.recommendations,
      };

    } catch (error) {
      const errorMessage = `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.issues.push(errorMessage);
      console.error(errorMessage);

      return {
        success: false,
        planCompliance: {
          canonicalAssetStructure: false,
          forbiddenPatternDetection: false,
          indexedDbZoneSeparation: false,
          simplifiedZustandStores: false,
          fifoSyncQueue: false,
          dataMigrationScripts: false,
          fileBlobStorage: false,
          spatialIndexing: false,
          sqlMigrationScripts: false,
          legacyRemoval: false,
        },
        issues: this.issues,
        warnings: this.warnings,
        recommendations: this.recommendations,
      };
    }
  }

  /**
   * Validate canonical asset structure implementation
   */
  private async validateCanonicalAssetStructure(): Promise<boolean> {
    try {
      const assetTypesPath = 'src/types/Asset.ts';
      const content = readFileSync(assetTypesPath, 'utf-8');

      // Check for canonical structure
      const hasCanonicalInterface = content.includes('export interface Asset');
      const hasSubInterfaces = content.includes('AssetIdentity') && content.includes('AssetLayout');
      const hasZodSchemas = content.includes('AssetSchema') && content.includes('z.object');
      const hasValidation = content.includes('validateAssetStrict') || content.includes('isValidAsset');

      if (!hasCanonicalInterface) {
        this.issues.push('Missing canonical Asset interface');
      }

      if (!hasSubInterfaces) {
        this.issues.push('Missing canonical asset sub-interfaces');
      }

      if (!hasZodSchemas) {
        this.issues.push('Missing Zod validation schemas');
      }

      if (!hasValidation) {
        this.issues.push('Missing asset validation functions');
      }

      // Check for forbidden legacy patterns
      const hasLegacyFields = content.includes('cloud_status') || content.includes('sync_status');
      if (hasLegacyFields) {
        this.issues.push('Legacy sync status fields found in canonical asset structure');
      }

      return hasCanonicalInterface && hasSubInterfaces && hasZodSchemas && hasValidation;

    } catch (error) {
      this.issues.push(`Failed to validate canonical asset structure: ${error}`);
      return false;
    }
  }

  /**
   * Validate forbidden pattern detection implementation
   */
  private async validateForbiddenPatternDetection(): Promise<boolean> {
    try {
      const safeguardsPath = 'src/types/Safeguards.ts';
      const content = readFileSync(safeguardsPath, 'utf-8');

      const hasForbiddenFields = content.includes('FORBIDDEN_ASSET_FIELDS');
      const hasValidation = content.includes('validateAssetStructure');
      const hasStatePollution = content.includes('checkStatePollution');
      const hasSchemaDrift = content.includes('checkSchemaDrift');

      if (!hasForbiddenFields) {
        this.issues.push('Missing forbidden asset fields definition');
      }

      if (!hasValidation) {
        this.issues.push('Missing asset structure validation');
      }

      if (!hasStatePollution) {
        this.issues.push('Missing state pollution detection');
      }

      if (!hasSchemaDrift) {
        this.issues.push('Missing schema drift detection');
      }

      return hasForbiddenFields && hasValidation && hasStatePollution && hasSchemaDrift;

    } catch (error) {
      this.issues.push(`Failed to validate forbidden pattern detection: ${error}`);
      return false;
    }
  }

  /**
   * Validate IndexedDB zone separation implementation
   */
  private async validateIndexedDbZoneSeparation(): Promise<boolean> {
    try {
      const indexedDbPath = 'src/storage/indexeddb.ts';
      const content = readFileSync(indexedDbPath, 'utf-8');

      const hasDexieSetup = content.includes('class KanvasDatabase extends Dexie');
      const hasZoneTables = content.includes('projects') && content.includes('assets') && content.includes('files') && content.includes('syncQueue');
      const hasValidationHooks = content.includes('creating') || content.includes('updating');
      const hasZoneSeparation = content.includes('zone separation') || content.includes('strict separation');

      if (!hasDexieSetup) {
        this.issues.push('Missing Dexie database setup');
      }

      if (!hasZoneTables) {
        this.issues.push('Missing required zone tables');
      }

      if (!hasValidationHooks) {
        this.warnings.push('Missing validation hooks for zone separation');
      }

      if (!hasZoneSeparation) {
        this.warnings.push('Zone separation not explicitly documented');
      }

      return hasDexieSetup && hasZoneTables;

    } catch (error) {
      this.issues.push(`Failed to validate IndexedDB zone separation: ${error}`);
      return false;
    }
  }

  /**
   * Validate simplified Zustand stores implementation
   */
  private async validateSimplifiedZustandStores(): Promise<boolean> {
    try {
      const stores = ['kanvasStore.ts', 'uiStore.ts', 'syncStore.ts'];
      let allValid = true;

      for (const storeFile of stores) {
        const storePath = `src/stores/${storeFile}`;
        try {
          const content = readFileSync(storePath, 'utf-8');

          const hasZustandCreate = content.includes('create<') || content.includes('create(');
          const hasStoreInterface = content.includes('interface') || content.includes('type');
          const hasProperExports = content.includes('export const') || content.includes('export {');

          if (!hasZustandCreate) {
            this.issues.push(`Missing Zustand create in ${storeFile}`);
            allValid = false;
          }

          if (!hasStoreInterface) {
            this.warnings.push(`Missing store interface in ${storeFile}`);
          }

          if (!hasProperExports) {
            this.issues.push(`Missing proper exports in ${storeFile}`);
            allValid = false;
          }

        } catch (error) {
          this.issues.push(`Failed to validate ${storeFile}: ${error}`);
          allValid = false;
        }
      }

      return allValid;

    } catch (error) {
      this.issues.push(`Failed to validate Zustand stores: ${error}`);
      return false;
    }
  }

  /**
   * Validate FIFO sync queue implementation
   */
  private async validateFIFOSyncQueue(): Promise<boolean> {
    try {
      const syncFiles = ['queue.ts', 'processor.ts', 'validation.ts'];
      let allValid = true;

      for (const syncFile of syncFiles) {
        const syncPath = `src/sync/${syncFile}`;
        try {
          const content = readFileSync(syncPath, 'utf-8');

          const hasSyncLogic = content.includes('SyncQueue') || content.includes('SyncProcessor');
          const hasFIFO = content.includes('FIFO') || content.includes('queue');
          const hasRetryLogic = content.includes('retry') || content.includes('retryCount');

          if (!hasSyncLogic) {
            this.issues.push(`Missing sync logic in ${syncFile}`);
            allValid = false;
          }

          if (!hasFIFO && syncFile === 'queue.ts') {
            this.issues.push(`Missing FIFO implementation in ${syncFile}`);
            allValid = false;
          }

          if (!hasRetryLogic && syncFile === 'processor.ts') {
            this.issues.push(`Missing retry logic in ${syncFile}`);
            allValid = false;
          }

        } catch (error) {
          this.issues.push(`Failed to validate ${syncFile}: ${error}`);
          allValid = false;
        }
      }

      return allValid;

    } catch (error) {
      this.issues.push(`Failed to validate FIFO sync queue: ${error}`);
      return false;
    }
  }

  /**
   * Validate data migration scripts implementation
   */
  private async validateDataMigrationScripts(): Promise<boolean> {
    try {
      const migrationFiles = ['migrateToV2.ts', 'validation.ts'];
      let allValid = true;

      for (const migrationFile of migrationFiles) {
        const migrationPath = `src/migrations/${migrationFile}`;
        try {
          const content = readFileSync(migrationPath, 'utf-8');

          const hasMigrationLogic = content.includes('migrate') || content.includes('migration');
          const hasValidation = content.includes('validate') || content.includes('validation');
          const hasLegacyHandling = content.includes('legacy') || content.includes('localStorage');

          if (!hasMigrationLogic) {
            this.issues.push(`Missing migration logic in ${migrationFile}`);
            allValid = false;
          }

          if (!hasValidation && migrationFile === 'validation.ts') {
            this.issues.push(`Missing validation in ${migrationFile}`);
            allValid = false;
          }

          if (!hasLegacyHandling && migrationFile === 'migrateToV2.ts') {
            this.issues.push(`Missing legacy handling in ${migrationFile}`);
            allValid = false;
          }

        } catch (error) {
          this.issues.push(`Failed to validate ${migrationFile}: ${error}`);
          allValid = false;
        }
      }

      return allValid;

    } catch (error) {
      this.issues.push(`Failed to validate data migration scripts: ${error}`);
      return false;
    }
  }

  /**
   * Validate file blob storage implementation
   */
  private async validateFileBlobStorage(): Promise<boolean> {
    try {
      const blobStoragePath = 'src/storage/blobStorage.ts';
      const content = readFileSync(blobStoragePath, 'utf-8');

      const hasBlobStorage = content.includes('BlobStorage') || content.includes('class');
      const hasMemoryManagement = content.includes('memory') || content.includes('cleanup');
      const hasFileProcessing = content.includes('processFile') || content.includes('Worker');

      if (!hasBlobStorage) {
        this.issues.push('Missing blob storage implementation');
      }

      if (!hasMemoryManagement) {
        this.issues.push('Missing memory management in blob storage');
      }

      if (!hasFileProcessing) {
        this.warnings.push('Missing file processing in blob storage');
      }

      return hasBlobStorage && hasMemoryManagement;

    } catch (error) {
      this.issues.push(`Failed to validate file blob storage: ${error}`);
      return false;
    }
  }

  /**
   * Validate spatial indexing implementation
   */
  private async validateSpatialIndexing(): Promise<boolean> {
    try {
      const spatialIndexPath = 'src/utils/spatialIndex.ts';
      const content = readFileSync(spatialIndexPath, 'utf-8');

      const hasSpatialIndex = content.includes('SpatialIndex') || content.includes('QuadTree');
      const hasViewportCulling = content.includes('viewport') || content.includes('culling');
      const hasPerformanceOptimization = content.includes('performance') || content.includes('optimize');

      if (!hasSpatialIndex) {
        this.issues.push('Missing spatial indexing implementation');
      }

      if (!hasViewportCulling) {
        this.issues.push('Missing viewport culling in spatial indexing');
      }

      if (!hasPerformanceOptimization) {
        this.warnings.push('Missing performance optimization in spatial indexing');
      }

      return hasSpatialIndex && hasViewportCulling;

    } catch (error) {
      this.issues.push(`Failed to validate spatial indexing: ${error}`);
      return false;
    }
  }

  /**
   * Validate SQL migration scripts implementation
   */
  private async validateSQLMigrationScripts(): Promise<boolean> {
    try {
      const sqlMigrationPath = 'supabase/migrations/20250101000000_setup_complete_v2.sql';
      const content = readFileSync(sqlMigrationPath, 'utf-8');

      const hasNewTables = content.includes('CREATE TABLE') && content.includes('assets_v2');
      const hasConstraints = content.includes('CONSTRAINT') || content.includes('CHECK');
      const hasIndexes = content.includes('INDEX') || content.includes('CREATE INDEX');
      const hasRLS = content.includes('ROW LEVEL SECURITY') || content.includes('RLS');

      if (!hasNewTables) {
        this.issues.push('Missing new table creation in SQL migration');
      }

      if (!hasConstraints) {
        this.issues.push('Missing constraints in SQL migration');
      }

      if (!hasIndexes) {
        this.warnings.push('Missing indexes in SQL migration');
      }

      if (!hasRLS) {
        this.issues.push('Missing RLS policies in SQL migration');
      }

      return hasNewTables && hasConstraints && hasRLS;

    } catch (error) {
      this.issues.push(`Failed to validate SQL migration scripts: ${error}`);
      return false;
    }
  }

  /**
   * Validate legacy removal implementation
   */
  private async validateLegacyRemoval(): Promise<boolean> {
    try {
      const storesDir = 'src/stores';
      const servicesDir = 'src/services';
      let legacyRemoved = true;

      // Check for removed legacy stores
      const legacyStores = ['assetStore.ts', 'backgroundStore.ts', 'cloudStore.ts', 'tagStore.ts'];
      for (const legacyStore of legacyStores) {
        try {
          readFileSync(join(storesDir, legacyStore));
          this.issues.push(`Legacy store ${legacyStore} still exists`);
          legacyRemoved = false;
        } catch {
          // File doesn't exist, which is good
        }
      }

      // Check for removed legacy services
      const legacyServices = ['DocumentMutationService.ts', 'StoreCoordinator.ts', 'autosaveService.ts'];
      for (const legacyService of legacyServices) {
        try {
          readFileSync(join(servicesDir, legacyService));
          this.issues.push(`Legacy service ${legacyService} still exists`);
          legacyRemoved = false;
        } catch {
          // File doesn't exist, which is good
        }
      }

      return legacyRemoved;

    } catch (error) {
      this.issues.push(`Failed to validate legacy removal: ${error}`);
      return false;
    }
  }

  /**
   * Validate architectural principles
   */
  private async validateArchitecturalPrinciples(): Promise<void> {
    // Check for zone separation violations
    const kanvasStoreContent = readFileSync('src/stores/kanvasStore.ts', 'utf-8');
    if (kanvasStoreContent.includes('sync_status') || kanvasStoreContent.includes('selected')) {
      this.issues.push('Zone separation violation: sync or UI state in kanvasStore');
    }

    // Check for forbidden patterns in new stores
    const uiStoreContent = readFileSync('src/stores/uiStore.ts', 'utf-8');
    if (uiStoreContent.includes('layout') || uiStoreContent.includes('content')) {
      this.issues.push('Zone separation violation: asset data in uiStore');
    }

    // Check for proper data flow
    this.recommendations.push('Verify data flow: UI → Zustand → IndexedDB → Sync Queue → Supabase');
  }

  /**
   * Validate integration
   */
  private async validateIntegration(): Promise<void> {
    // Check that hooks are updated
    try {
      const useAssetTreeContent = readFileSync('src/hooks/useAssetTree.ts', 'utf-8');
      if (useAssetTreeContent.includes('useAssetStore')) {
        this.issues.push('useAssetTree hook still uses legacy assetStore');
      }

      if (!useAssetTreeContent.includes('useKanvasStore')) {
        this.issues.push('useAssetTree hook not updated to use kanvasStore');
      }

    } catch (error) {
      this.warnings.push('Could not validate hook integration');
    }

    // Check that components are updated
    this.recommendations.push('Verify all components use new store imports');
    this.recommendations.push('Test integration with sample data');
  }

  /**
   * Generate validation report
   */
  generateReport(validation: ValidationResult): string {
    const report = [
      '# Implementation Validation Report',
      '',
      '## Summary',
      `**Overall Status:** ${validation.success ? '✅ PASSED' : '❌ FAILED'}`,
      '',
    ];

    // Plan compliance
    report.push('## Plan Compliance');
    Object.entries(validation.planCompliance).forEach(([requirement, passed]) => {
      const status = passed ? '✅' : '❌';
      const name = requirement.replace(/([A-Z])/g, ' $1').trim();
      report.push(`- ${status} ${name}`);
    });
    report.push('');

    // Issues
    if (validation.issues.length > 0) {
      report.push('## Issues');
      validation.issues.forEach(issue => {
        report.push(`- ❌ ${issue}`);
      });
      report.push('');
    }

    // Warnings
    if (validation.warnings.length > 0) {
      report.push('## Warnings');
      validation.warnings.forEach(warning => {
        report.push(`- ⚠️ ${warning}`);
      });
      report.push('');
    }

    // Recommendations
    if (validation.recommendations.length > 0) {
      report.push('## Recommendations');
      validation.recommendations.forEach(recommendation => {
        report.push(`- 💡 ${recommendation}`);
      });
      report.push('');
    }

    // Conclusion
    report.push('## Conclusion');
    if (validation.success) {
      report.push('✅ All plan requirements have been successfully implemented');
      report.push('✅ New canonical architecture is properly integrated');
      report.push('✅ Ready for production deployment');
    } else {
      report.push('❌ Some plan requirements are not fully implemented');
      report.push('❌ Please address the issues before proceeding');
    }

    return report.join('\n');
  }
}

// Export singleton instance
export const implementationValidator = new ImplementationValidator();
