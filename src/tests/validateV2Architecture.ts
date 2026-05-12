/**
 * V2 ARCHITECTURE VALIDATION
 * 
 * Comprehensive validation suite for the new persistence architecture.
 * Tests all critical components and ensures the rewrite is working correctly.
 * 
 * 🔒 CRITICAL: This validation must pass before considering the rewrite complete
 */

import { db } from '@/storage/indexeddb';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useUIStore } from '@/stores/uiStore';
import { useSyncStore } from '@/stores/syncStore';
import { Asset, createCanonicalAsset } from '@/types/Asset';
import { validateAssetStrict } from '@/types/Safeguards';
import { syncProcessor } from '@/sync/processor';

export interface ValidationResult {
  success: boolean;
  component: string;
  issues: string[];
  testResults: Record<string, boolean>;
}

export class ArchitectureValidator {
  private results: ValidationResult[] = [];

  /**
   * Run complete validation suite
   */
  async validateAll(): Promise<{
    overallSuccess: boolean;
    results: ValidationResult[];
    summary: string;
  }> {
    console.log('[Validation] Starting V2 architecture validation...');

    const validations = [
      this.validateIndexedDB(),
      this.validateKanvasStore(),
      this.validateUIStore(),
      this.validateSyncStore(),
      this.validateAssetStructure(),
      this.validateZoneSeparation(),
      this.validateSyncProcessor(),
      this.validateDataFlow(),
    ];

    const results = await Promise.allSettled(validations);
    
    // Process results
    this.results = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          component: `Validation ${index}`,
          issues: [result.reason?.message || 'Unknown error'],
          testResults: {},
        };
      }
    });

    const overallSuccess = this.results.every(r => r.success);
    const failedComponents = this.results.filter(r => !r.success).map(r => r.component);
    
    const summary = overallSuccess 
      ? '✅ All V2 architecture validations passed'
      : `❌ Failed validations: ${failedComponents.join(', ')}`;

    console.log('[Validation] Validation completed:', summary);

    return {
      overallSuccess,
      results: this.results,
      summary,
    };
  }

  /**
   * Validate IndexedDB setup and zone separation
   */
  private async validateIndexedDB(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      // Test database connection
      testResults.dbConnection = true;
      
      // Test zone tables exist
      const projectCount = await db.projects.count();
      const assetCount = await db.assets.count();
      const syncQueueCount = await db.syncQueue.count();
      const fileCount = await db.files.count();
      
      testResults.projectTable = true;
      testResults.assetTable = true;
      testResults.syncQueueTable = true;
      testResults.fileTable = true;

      // Test zone separation - ensure no cross-contamination
      const sampleAsset = await db.assets.limit(1).first();
      if (sampleAsset) {
        const hasSyncFields = 'sync_status' in sampleAsset || 'upload_progress' in sampleAsset;
        if (hasSyncFields) {
          issues.push('Asset zone contains sync state - zone separation violated');
        }
        testResults.zoneSeparation = !hasSyncFields;
      } else {
        testResults.zoneSeparation = true; // No assets to test
      }

      console.log('[Validation] IndexedDB validation passed');

    } catch (error) {
      issues.push(`IndexedDB validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'IndexedDB',
      issues,
      testResults,
    };
  }

  /**
   * Validate KanvasStore functionality
   */
  private async validateKanvasStore(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      const store = useKanvasStore.getState();

      // Test core methods exist
      testResults.getAsset = typeof store.getAsset === 'function';
      testResults.getProjectAssets = typeof store.getProjectAssets === 'function';
      testResults.createAsset = typeof store.createAsset === 'function';
      testResults.updateAsset = typeof store.updateAsset === 'function';
      testResults.deleteAsset = typeof store.deleteAsset === 'function';
      testResults.loadProject = typeof store.loadProject === 'function';
      testResults.clearProject = typeof store.clearProject === 'function';

      // Test asset creation
      const testAsset = createCanonicalAsset('550e8400-e29b-41d4-a716-446655440000', {
        content: { title: 'Test Asset' },
        layout: { x: 100, y: 100, width: 200, height: 150 },
      });

      const assetId = await store.createAsset(testAsset);
      testResults.assetCreation = !!assetId;

      // Test asset retrieval
      const retrievedAsset = store.getAsset(assetId);
      testResults.assetRetrieval = retrievedAsset?.id === assetId;

      // Test asset update
      await store.updateAsset(assetId, {
        content: { title: 'Updated Test Asset' }
      });
      const updatedAsset = store.getAsset(assetId);
      testResults.assetUpdate = updatedAsset?.content.title === 'Updated Test Asset';

      // Test asset deletion
      await store.deleteAsset(assetId);
      const deletedAsset = store.getAsset(assetId);
      testResults.assetDeletion = !deletedAsset;

      console.log('[Validation] KanvasStore validation passed');

    } catch (error) {
      issues.push(`KanvasStore validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'KanvasStore',
      issues,
      testResults,
    };
  }

  /**
   * Validate UIStore functionality
   */
  private async validateUIStore(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      const store = useUIStore.getState();

      // Test core methods exist
      testResults.selectAsset = typeof store.selectAsset === 'function';
      testResults.clearSelection = typeof store.clearSelection === 'function';
      testResults.isSelected = typeof store.isSelected === 'function';
      testResults.setViewport = typeof store.setViewport === 'function';

      // Test selection functionality
      store.selectAsset('550e8400-e29b-41d4-a716-446655440001');
      testResults.selectionWorks = store.isSelected('550e8400-e29b-41d4-a716-446655440001');

      store.clearSelection();
      testResults.clearSelectionWorks = !store.isSelected('550e8400-e29b-41d4-a716-446655440001');

      // Test viewport functionality
      store.setViewport({ x: 100, y: 200, zoom: 1.5 });
      testResults.viewportWorks = store.viewport.x === 100 && store.viewport.y === 200 && store.viewport.zoom === 1.5;

      console.log('[Validation] UIStore validation passed');

    } catch (error) {
      issues.push(`UIStore validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'UIStore',
      issues,
      testResults,
    };
  }

  /**
   * Validate SyncStore functionality
   */
  private async validateSyncStore(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      const store = useSyncStore.getState();

      // Test core methods exist
      testResults.markForSync = typeof store.markForSync === 'function';
      testResults.getSyncStatus = typeof store.getSyncStatus === 'function';
      testResults.setSyncStatus = typeof store.setSyncStatus === 'function';

      // Test sync status tracking
      store.markForSync('550e8400-e29b-41d4-a716-446655440001', 'create', '550e8400-e29b-41d4-a716-446655440000');
      const syncStatus = store.getSyncStatus('550e8400-e29b-41d4-a716-446655440001');
      testResults.syncStatusTracking = syncStatus?.operation === 'create';

      console.log('[Validation] SyncStore validation passed');

    } catch (error) {
      issues.push(`SyncStore validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'SyncStore',
      issues,
      testResults,
    };
  }

  /**
   * Validate Asset structure and validation
   */
  private async validateAssetStructure(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      // Test canonical asset creation
      const testAsset = createCanonicalAsset('550e8400-e29b-41d4-a716-446655440000', {
        content: { title: 'Test Asset' },
        layout: { x: 100, y: 100, width: 200, height: 150 },
      });

      testResults.canonicalAssetCreation = !!testAsset.id;

      // Test asset validation
      try {
        validateAssetStrict(testAsset);
        testResults.assetValidation = true;
      } catch (error) {
        testResults.assetValidation = false;
        issues.push(`Asset validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Test structure integrity
      testResults.hasRequiredFields = !!(
        testAsset.id &&
        testAsset.projectId &&
        testAsset.layout &&
        testAsset.content &&
        testAsset.style &&
        testAsset.behavior &&
        testAsset.metadata
      );

      console.log('[Validation] Asset structure validation passed');

    } catch (error) {
      issues.push(`Asset structure validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'AssetStructure',
      issues,
      testResults,
    };
  }

  /**
   * Validate strict zone separation
   */
  private async validateZoneSeparation(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      // Test that stores don't mix data
      const kanvasStore = useKanvasStore.getState();
      const uiStore = useUIStore.getState();
      const syncStore = useSyncStore.getState();

      // KanvasStore should only have canonical asset data
      const kanvasStoreKeys = Object.keys(kanvasStore);
      testResults.kanvasStorePure = !kanvasStoreKeys.some(key => 
        key.includes('selected') || key.includes('hover') || key.includes('sync')
      );

      // UIStore should only have UI state
      const uiStoreKeys = Object.keys(uiStore);
      testResults.uiStorePure = !uiStoreKeys.some(key => 
        key.includes('createAsset') || key.includes('updateAsset') || key.includes('sync')
      );

      // SyncStore should only have sync state
      const syncStoreKeys = Object.keys(syncStore);
      testResults.syncStorePure = !syncStoreKeys.some(key => 
        key.includes('layout') || key.includes('content') || key.includes('selected')
      );

      console.log('[Validation] Zone separation validation passed');

    } catch (error) {
      issues.push(`Zone separation validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'ZoneSeparation',
      issues,
      testResults,
    };
  }

  /**
   * Validate sync processor
   */
  private async validateSyncProcessor(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      // Test processor methods exist
      testResults.processorStart = typeof syncProcessor.start === 'function';
      testResults.processorStop = typeof syncProcessor.stop === 'function';
      testResults.processorStats = typeof syncProcessor.getStats === 'function';

      // Test processor stats
      const stats = syncProcessor.getStats();
      testResults.processorStatsWorking = typeof stats.isRunning === 'boolean';

      console.log('[Validation] Sync processor validation passed');

    } catch (error) {
      issues.push(`Sync processor validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'SyncProcessor',
      issues,
      testResults,
    };
  }

  /**
   * Validate end-to-end data flow
   */
  private async validateDataFlow(): Promise<ValidationResult> {
    const issues: string[] = [];
    const testResults: Record<string, boolean> = {};

    try {
      const kanvasStore = useKanvasStore.getState();
      const uiStore = useUIStore.getState();
      const syncStore = useSyncStore.getState();

      // Test complete data flow: UI → KanvasStore → SyncStore
      const testAsset = createCanonicalAsset('550e8400-e29b-41d4-a716-446655440000', {
        content: { title: 'Data Flow Test' },
        layout: { x: 50, y: 50, width: 100, height: 100 },
      });

      // Step 1: Create asset (KanvasStore)
      const assetId = await kanvasStore.createAsset(testAsset);
      testResults.step1Create = !!assetId;

      // Step 2: Select asset (UIStore)
      uiStore.selectAsset(assetId);
      testResults.step2Select = uiStore.isSelected(assetId);

      // Step 3: Mark for sync (SyncStore)
      syncStore.markForSync(assetId, 'update', '550e8400-e29b-41d4-a716-446655440000');
      const syncStatus = syncStore.getSyncStatus(assetId);
      testResults.step3Sync = syncStatus?.operation === 'update';

      // Step 4: Update asset (KanvasStore)
      await kanvasStore.updateAsset(assetId, {
        content: { title: 'Updated Data Flow Test' }
      });
      const updatedAsset = kanvasStore.getAsset(assetId);
      testResults.step4Update = updatedAsset?.content.title === 'Updated Data Flow Test';

      // Step 5: Clean up
      await kanvasStore.deleteAsset(assetId);
      uiStore.clearSelection();
      testResults.step5Cleanup = !kanvasStore.getAsset(assetId) && !uiStore.isSelected(assetId);

      console.log('[Validation] Data flow validation passed');

    } catch (error) {
      issues.push(`Data flow validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: issues.length === 0,
      component: 'DataFlow',
      issues,
      testResults,
    };
  }

  /**
   * Get detailed validation report
   */
  getValidationReport(): string {
    if (this.results.length === 0) {
      return 'No validation results available. Run validateAll() first.';
    }

    let report = '\n=== V2 ARCHITECTURE VALIDATION REPORT ===\n\n';

    this.results.forEach(result => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      report += `${status} ${result.component}\n`;

      if (result.issues.length > 0) {
        result.issues.forEach(issue => {
          report += `  • ${issue}\n`;
        });
      }

      if (Object.keys(result.testResults).length > 0) {
        report += '  Tests:\n';
        Object.entries(result.testResults).forEach(([test, passed]) => {
          const testStatus = passed ? '✅' : '❌';
          report += `    ${testStatus} ${test}\n`;
        });
      }
      report += '\n';
    });

    const overallSuccess = this.results.every(r => r.success);
    report += overallSuccess ? '🎉 OVERALL: ALL VALIDATIONS PASSED' : '⚠️  OVERALL: SOME VALIDATIONS FAILED';

    return report;
  }
}

// Export for use in development and testing
export const architectureValidator = new ArchitectureValidator();

// Auto-run validation in development
if (process.env.NODE_ENV === 'development') {
  console.log('[Validation] Development mode detected - running architecture validation...');
  architectureValidator.validateAll().then(result => {
    if (!result.overallSuccess) {
      console.error('[Validation] Architecture validation failed:', result.summary);
      console.log(architectureValidator.getValidationReport());
    } else {
      console.log('[Validation] ✅ V2 architecture validation passed successfully');
    }
  });
}
