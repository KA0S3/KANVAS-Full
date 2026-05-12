/**
 * SYNC VALIDATION - Anti-Pattern Detection
 * 
 * Validates sync operations and prevents architectural violations.
 * Ensures the sync system remains simple and deterministic.
 * 
 * 🔒 CRITICAL: These validations must NEVER be bypassed
 */

import { Asset } from '@/types/Asset';
import { SyncQueueEntry, RuntimeSyncState } from '@/types/SyncTypes';
import { validateAssetStructure, isCanonicalAsset } from '@/types/Safeguards';
import { validateSyncStateSeparation } from '@/types/SyncTypes';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SyncValidator {
  /**
   * Validate a sync queue entry before processing
   */
  validateSyncEntry(entry: SyncQueueEntry): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!entry.id) {
      errors.push('Sync entry missing required field: id');
    }

    if (!entry.projectId) {
      errors.push('Sync entry missing required field: projectId');
    }

    if (!entry.assetId) {
      errors.push('Sync entry missing required field: assetId');
    }

    if (!entry.operation) {
      errors.push('Sync entry missing required field: operation');
    }

    if (!entry.status) {
      errors.push('Sync entry missing required field: status');
    }

    // Validate operation type
    const validOperations = ['create', 'update', 'delete'];
    if (entry.operation && !validOperations.includes(entry.operation)) {
      errors.push(`Invalid operation: ${entry.operation}`);
    }

    // Validate status type
    const validStatuses = ['dirty', 'syncing', 'synced', 'failed'];
    if (entry.status && !validStatuses.includes(entry.status)) {
      errors.push(`Invalid status: ${entry.status}`);
    }

    // Validate retry count
    if (entry.retryCount < 0) {
      errors.push('Retry count cannot be negative');
    }

    // Validate asset data if present
    if (entry.assetData) {
      const assetValidation = this.validateAssetData(entry.assetData);
      errors.push(...assetValidation.errors);
      warnings.push(...assetValidation.warnings);
    }

    // Validate state separation
    if (entry.assetData) {
      const separationValidation = validateSyncStateSeparation(entry.assetData, entry);
      if (!separationValidation.valid) {
        errors.push(...separationValidation.violations);
      }
    }

    // Check for architectural violations
    const architecturalValidation = this.validateArchitecturalIntegrity(entry);
    errors.push(...architecturalValidation.errors);
    warnings.push(...architecturalValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate asset data structure
   */
  validateAssetData(assetData: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if it's a canonical asset
      if (!isCanonicalAsset(assetData)) {
        errors.push('Asset data does not conform to canonical structure');
        return { valid: false, errors, warnings };
      }

      // Check for forbidden patterns
      const violations = validateAssetStructure(assetData);
      violations.forEach(violation => {
        if (violation.severity === 'error') {
          errors.push(violation.message);
        } else {
          warnings.push(violation.message);
        }
      });

    } catch (error) {
      errors.push(`Asset validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate architectural integrity
   */
  private validateArchitecturalIntegrity(entry: SyncQueueEntry): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for complex conflict resolution (forbidden)
    if (entry.assetData && 'conflictResolution' in entry.assetData) {
      errors.push('Complex conflict resolution detected - only last-write-wins allowed');
    }

    // Check for branching logic patterns
    if (entry.assetData && 'assetType' in entry.assetData) {
      warnings.push('AssetType field detected - use behavior.renderMode instead');
    }

    // Check for embedded files (forbidden)
    if (entry.assetData && this.hasEmbeddedFiles(entry.assetData)) {
      errors.push('Embedded files detected - use separate file storage');
    }

    // Check for UI state pollution
    if (entry.assetData && this.hasUIState(entry.assetData)) {
      errors.push('UI state found in asset data - use separate UI store');
    }

    // Check for sync state pollution
    if (entry.assetData && this.hasSyncState(entry.assetData)) {
      errors.push('Sync state found in asset data - use separate sync store');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check for embedded files
   */
  private hasEmbeddedFiles(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    // Check for File objects or large base64 strings
    for (const [key, value] of Object.entries(obj)) {
      if (value instanceof File) {
        return true;
      }

      if (typeof value === 'string' && value.startsWith('data:') && value.length > 1000) {
        return true;
      }

      if (typeof value === 'object' && this.hasEmbeddedFiles(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for UI state
   */
  private hasUIState(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const uiStatePatterns = [
      'selected', 'hovered', 'focused', 'active', 'dragging',
      'expanded', 'collapsed', 'visible', 'hidden'
    ];

    for (const [key, value] of Object.entries(obj)) {
      if (uiStatePatterns.some(pattern => key.toLowerCase().includes(pattern))) {
        return true;
      }

      if (typeof value === 'object' && this.hasUIState(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for sync state
   */
  private hasSyncState(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const syncStatePatterns = [
      'syncStatus', 'uploadProgress', 'retryCount', 'lastAttempt',
      'cloudStatus', 'cloudId', 'cloudPath'
    ];

    for (const [key, value] of Object.entries(obj)) {
      if (syncStatePatterns.some(pattern => key.toLowerCase().includes(pattern))) {
        return true;
      }

      if (typeof value === 'object' && this.hasSyncState(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate batch of sync entries
   */
  validateBatch(entries: SyncQueueEntry[]): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    entries.forEach((entry, index) => {
      const validation = this.validateSyncEntry(entry);
      validation.errors.forEach(error => {
        allErrors.push(`Entry ${index}: ${error}`);
      });
      validation.warnings.forEach(warning => {
        allWarnings.push(`Entry ${index}: ${warning}`);
      });
    });

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Validate sync queue health
   */
  async validateQueueHealth(): Promise<ValidationResult & {
    stats: {
      totalEntries: number;
      dirtyEntries: number;
      failedEntries: number;
      oldEntries: number;
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalEntries = 0;
    let dirtyEntries = 0;
    let failedEntries = 0;
    let oldEntries = 0;

    try {
      // This would require access to the database
      // For now, return placeholder stats
      const stats = {
        totalEntries,
        dirtyEntries,
        failedEntries,
        oldEntries,
      };

      // Check for queue health issues
      if (failedEntries > 10) {
        warnings.push(`High number of failed entries: ${failedEntries}`);
      }

      if (oldEntries > 50) {
        warnings.push(`High number of old entries: ${oldEntries}`);
      }

      if (dirtyEntries > 100) {
        warnings.push(`High number of pending entries: ${dirtyEntries}`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        stats,
      };

    } catch (error) {
      errors.push(`Queue health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        valid: false,
        errors,
        warnings,
        stats: {
          totalEntries: 0,
          dirtyEntries: 0,
          failedEntries: 0,
          oldEntries: 0,
        },
      };
    }
  }
}

// Singleton validator instance
export const syncValidator = new SyncValidator();
