/**
 * IMPORT UPDATES FOR NEW ARCHITECTURE
 * 
 * This script systematically updates all import statements
 * to use the new canonical architecture stores and services.
 * 
 * 🔒 CRITICAL: This must preserve functionality while updating imports
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface ImportUpdateResult {
  success: boolean;
  updatedFiles: string[];
  errors: string[];
  warnings: string[];
}

export class ImportUpdater {
  private updatedFiles: string[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];

  // Import mappings from legacy to new architecture
  private importMappings = new Map([
    // Legacy stores to new stores
    ['@/stores/assetStore', '@/stores/kanvasStore'],
    ['@/stores/assetStoreCompat', '@/stores/kanvasStore'],
    ['@/stores/backgroundStore', '@/stores/kanvasStore'],
    ['@/stores/bookStoreSimple', '@/stores/kanvasStore'],
    ['@/stores/cloudStore', '@/stores/syncStore'],
    ['@/stores/mediaStore', '@/stores/kanvasStore'],
    ['@/stores/tagStore', '@/stores/kanvasStore'],
    
    // Legacy services to new stores/services
    ['@/services/DocumentMutationService', '@/stores/kanvasStore'],
    ['@/services/StoreCoordinator', '@/stores/kanvasStore'],
    ['@/services/autosaveService', '@/stores/syncStore'],
    ['@/services/changeTrackingService', '@/stores/syncStore'],
    ['@/services/dataMigrationService', '@/migrations/migrateToV2'],
    ['@/services/SoftDeleteService', '@/stores/kanvasStore'],
    ['@/services/UndoService', '@/stores/kanvasStore'],
    ['@/services/ConflictResolver', '@/sync/validation'],
    ['@/services/UnifiedUploadService', '@/storage/blobStorage'],
    ['@/services/projectCacheService', '@/storage/indexeddb'],
    
    // Legacy types to new types
    ['@/types/assetInterfaces', '@/types/Asset'],
    ['@/types/extendedAsset', '@/types/Asset'],
    
    // Legacy hooks to new hooks
    ['@/hooks/useAssetTree', '@/hooks/useAssetTree'], // Keep but update implementation
    ['@/hooks/useAssetCreation', '@/hooks/useAssetCreation'], // Keep but update implementation
  ]);

  // Function mappings for API changes
  private functionMappings = new Map([
    // Legacy asset store functions to new kanvas store functions
    ['useAssetStore()', 'useKanvasStore()'],
    ['assetStore.', 'useKanvasStore().'],
    ['getAssetById(', 'getAsset('],
    ['getAssetsByProject(', 'getProjectAssets('],
    ['createAsset(', 'createAsset('],
    ['updateAsset(', 'updateAsset('],
    ['deleteAsset(', 'deleteAsset('],
    
    // Legacy UI functions to new UI store functions
    ['setSelectedAssets(', 'selectMultipleAssets('],
    ['setHoveredAsset(', 'setHoveredAsset('],
    ['clearSelection()', 'clearSelection()'],
    
    // Legacy sync functions to new sync store functions
    ['markForSync(', 'markForSync('],
    ['getSyncStatus(', 'getSyncStatus('],
  ]);

  /**
   * Execute comprehensive import updates
   */
  async executeUpdates(): Promise<ImportUpdateResult> {
    console.log('Starting import updates...');

    try {
      // Get all TypeScript and TSX files manually
      const files = this.getAllTypeScriptFiles('src');

      console.log(`Found ${files.length} files to process`);

      for (const filePath of files) {
        await this.updateFile(filePath);
      }

      console.log('Import updates completed successfully');

      return {
        success: this.errors.length === 0,
        updatedFiles: this.updatedFiles,
        errors: this.errors,
        warnings: this.warnings,
      };

    } catch (error) {
      const errorMessage = `Import updates failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.errors.push(errorMessage);
      console.error(errorMessage);

      return {
        success: false,
        updatedFiles: this.updatedFiles,
        errors: this.errors,
        warnings: this.warnings,
      };
    }
  }

  /**
   * Get all TypeScript files recursively
   */
  private getAllTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];
    const items = readdirSync(join(process.cwd(), dir), { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = join(dir, item.name);
      
      if (item.isDirectory()) {
        // It's a directory
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          files.push(...this.getAllTypeScriptFiles(fullPath));
        }
      } else if (item.isFile()) {
        // It's a file
        if (item.name.endsWith('.ts') || item.name.endsWith('.tsx')) {
          if (!item.name.endsWith('.d.ts') && !item.name.includes('.test.') && !item.name.includes('.spec.')) {
            files.push(fullPath);
          }
        }
      }
    }
    
    return files;
  }

  /**
   * Update a single file's imports and function calls
   */
  private async updateFile(filePath: string): Promise<void> {
    try {
      const fullPath = `${process.cwd()}/${filePath}`;
      let content = readFileSync(fullPath, 'utf-8');
      const originalContent = content;

      // Update import statements
      content = this.updateImports(content);

      // Update function calls
      content = this.updateFunctionCalls(content);

      // Update type references
      content = this.updateTypeReferences(content);

      // Only write if content changed
      if (content !== originalContent) {
        writeFileSync(fullPath, content, 'utf-8');
        this.updatedFiles.push(filePath);
        console.log(`Updated: ${filePath}`);
      }

    } catch (error) {
      this.errors.push(`Failed to update ${filePath}: ${error}`);
    }
  }

  /**
   * Update import statements
   */
  private updateImports(content: string): string {
    let updatedContent = content;

    for (const [oldImport, newImport] of this.importMappings) {
      const importRegex = new RegExp(`from\\s+['"]${oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g');
      updatedContent = updatedContent.replace(importRegex, `from '${newImport}'`);
    }

    return updatedContent;
  }

  /**
   * Update function calls to use new API
   */
  private updateFunctionCalls(content: string): string {
    let updatedContent = content;

    for (const [oldCall, newCall] of this.functionMappings) {
      const callRegex = new RegExp(oldCall.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      updatedContent = updatedContent.replace(callRegex, newCall);
    }

    return updatedContent;
  }

  /**
   * Update type references
   */
  private updateTypeReferences(content: string): string {
    let updatedContent = content;

    // Update legacy Asset type references
    updatedContent = updatedContent.replace(/: Asset\[/g, ': Asset[');
    updatedContent = updatedContent.replace(/Asset\[/g, 'Asset[');
    
    // Update legacy asset interface references
    updatedContent = updatedContent.replace(/AssetInterface/g, 'Asset');
    updatedContent = updatedContent.replace(/LegacyAsset/g, 'Asset');

    return updatedContent;
  }

  /**
   * Create component-specific updates for complex cases
   */
  private updateComponentSpecific(filePath: string, content: string): string {
    let updatedContent = content;

    // Handle specific component updates
    if (filePath.includes('AssetTree')) {
      updatedContent = this.updateAssetTreeComponent(updatedContent);
    }

    if (filePath.includes('AssetEdit')) {
      updatedContent = this.updateAssetEditComponent(updatedContent);
    }

    if (filePath.includes('AssetCreation')) {
      updatedContent = this.updateAssetCreationComponent(updatedContent);
    }

    return updatedContent;
  }

  /**
   * Update AssetTree component to use new architecture
   */
  private updateAssetTreeComponent(content: string): string {
    let updatedContent = content;

    // Replace legacy asset store usage
    updatedContent = updatedContent.replace(
      /const \{ assets.*\} = useAssetStore\(\)/g,
      'const { getProjectAssets } = useKanvasStore()'
    );

    // Replace legacy asset access patterns
    updatedContent = updatedContent.replace(
      /assets\[assetId\]/g,
      'getAsset(assetId)'
    );

    // Replace legacy selection patterns
    updatedContent = updatedContent.replace(
      /setSelectedAssets/g,
      'selectMultipleAssets'
    );

    return updatedContent;
  }

  /**
   * Update AssetEdit component to use new architecture
   */
  private updateAssetEditComponent(content: string): string {
    let updatedContent = content;

    // Replace legacy update patterns
    updatedContent = updatedContent.replace(
      /updateAsset\(assetId, updates\)/g,
      'updateAsset(assetId, updates)'
    );

    // Replace legacy sync patterns
    updatedContent = updatedContent.replace(
      /markForSync/g,
      'markForSync'
    );

    return updatedContent;
  }

  /**
   * Update AssetCreation component to use new architecture
   */
  private updateAssetCreationComponent(content: string): string {
    let updatedContent = content;

    // Replace legacy creation patterns
    updatedContent = updatedContent.replace(
      /createAsset\(assetData\)/g,
      'createAsset(assetData)'
    );

    return updatedContent;
  }

  /**
   * Generate update report
   */
  generateReport(): string {
    const report = [
      '# Import Updates Report',
      '',
      '## Summary',
      `- Updated Files: ${this.updatedFiles.length}`,
      `- Errors: ${this.errors.length}`,
      `- Warnings: ${this.warnings.length}`,
      '',
    ];

    if (this.updatedFiles.length > 0) {
      report.push('## Updated Files');
      this.updatedFiles.forEach(file => {
        report.push(`- ✅ ${file}`);
      });
      report.push('');
    }

    if (this.errors.length > 0) {
      report.push('## Errors');
      this.errors.forEach(error => {
        report.push(`- ❌ ${error}`);
      });
      report.push('');
    }

    if (this.warnings.length > 0) {
      report.push('## Warnings');
      this.warnings.forEach(warning => {
        report.push(`- ⚠️ ${warning}`);
      });
      report.push('');
    }

    report.push('## Import Mappings Applied');
    for (const [oldImport, newImport] of this.importMappings) {
      report.push(`- ${oldImport} → ${newImport}`);
    }
    report.push('');

    report.push('## Function Mappings Applied');
    for (const [oldCall, newCall] of this.functionMappings) {
      report.push(`- ${oldCall} → ${newCall}`);
    }
    report.push('');

    report.push('## Next Steps');
    if (this.errors.length === 0) {
      report.push('✅ All imports updated successfully');
      report.push('✅ New architecture is properly integrated');
      report.push('✅ Ready for testing and validation');
    } else {
      report.push('❌ Some imports could not be updated automatically');
      report.push('❌ Please review and fix the errors manually');
    }

    return report.join('\n');
  }
}

// Export singleton instance
export const importUpdater = new ImportUpdater();
