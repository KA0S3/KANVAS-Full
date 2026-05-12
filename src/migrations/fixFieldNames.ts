/**
 * FIELD NAME MIGRATION - Legacy to Canonical Field Names
 * 
 * This script systematically updates all forbidden field names
 * throughout the codebase to use canonical asset structure.
 * 
 * 🔒 CRITICAL: This updates field names throughout the entire codebase
 */

// Field mapping from legacy to canonical
export const FIELD_MAPPINGS = {
  // Asset identity fields
  'asset_id': 'id',
  'parent_id': 'parentId',
  
  // Layout fields
  'z_index': 'zIndex',
  
  // Cloud fields (should be removed entirely)
  'cloud_status': undefined,
  'cloud_id': undefined,
  'cloud_path': undefined,
  'cloud_size': undefined,
  'cloud_updated_at': undefined,
  'cloud_error': undefined,
  
  // UI state fields (should be removed from asset data)
  'is_expanded': undefined,
  'is_locked': undefined,
  'selected': undefined,
  'hovered': undefined,
  
  // Other legacy fields
  'updated_at': 'updatedAt',
  'created_at': 'createdAt',
  'deleted_at': undefined,
  'border_shape': 'shape',
  'show_tag_border': undefined,
  
  // Database specific fields
  'parent_asset_id': 'parentId',
  'storage_key': 'storageKey',
  'mime_type': 'mimeType',
  'size_bytes': 'sizeBytes',
} as const;

// Reverse mapping for finding legacy field names
export const LEGACY_FIELD_MAPPINGS = {
  'id': 'asset_id',
  'parentId': 'parent_id',
  'zIndex': 'z_index',
  'updatedAt': 'updated_at',
  'createdAt': 'created_at',
  'shape': 'border_shape',
  'storageKey': 'storage_key',
  'mimeType': 'mime_type',
  'sizeBytes': 'size_bytes',
} as const;

/**
 * Field name migration utilities
 */
export class FieldNameMigration {
  /**
   * Convert legacy field name to canonical
   */
  static toCanonical(legacyField: string): string | undefined {
    return FIELD_MAPPINGS[legacyField as keyof typeof FIELD_MAPPINGS];
  }

  /**
   * Convert canonical field name to legacy
   */
  static toLegacy(canonicalField: string): string {
    return LEGACY_FIELD_MAPPINGS[canonicalField as keyof typeof LEGACY_FIELD_MAPPINGS] || canonicalField;
  }

  /**
   * Check if field is forbidden
   */
  static isForbidden(field: string): boolean {
    return field in FIELD_MAPPINGS && FIELD_MAPPINGS[field as keyof typeof FIELD_MAPPINGS] === undefined;
  }

  /**
   * Get all forbidden fields
   */
  static getForbiddenFields(): string[] {
    return Object.keys(FIELD_MAPPINGS).filter(key => 
      FIELD_MAPPINGS[key as keyof typeof FIELD_MAPPINGS] === undefined
    );
  }

  /**
   * Transform object keys from legacy to canonical
   */
  static transformObjectKeys<T extends Record<string, any>>(
    obj: T,
    options: {
      removeForbidden?: boolean;
      keepUnknown?: boolean;
    } = {}
  ): Record<string, any> {
    const { removeForbidden = true, keepUnknown = true } = options;
    const result: Record<string, any> = {};

    for (const [legacyKey, value] of Object.entries(obj)) {
      const canonicalKey = this.toCanonical(legacyKey);
      
      if (canonicalKey === undefined) {
        // Field is forbidden and should be removed
        if (removeForbidden) {
          continue;
        } else {
          // Keep with original key
          result[legacyKey] = value;
        }
      } else {
        // Transform to canonical name
        result[canonicalKey] = value;
      }
    }

    return result;
  }

  /**
   * Transform object keys from canonical to legacy
   */
  static transformObjectKeysToLegacy<T extends Record<string, any>>(
    obj: T,
    options: {
      includeForbidden?: boolean;
    } = {}
  ): Record<string, any> {
    const { includeForbidden = false } = options;
    const result: Record<string, any> = {};

    for (const [canonicalKey, value] of Object.entries(obj)) {
      const legacyKey = this.toLegacy(canonicalKey);
      
      if (legacyKey === canonicalKey && !includeForbidden) {
        // No mapping exists and we don't want forbidden fields
        continue;
      }
      
      result[legacyKey] = value;
    }

    return result;
  }

  /**
   * Generate field replacement regex patterns
   */
  static generateReplacementPatterns(): Array<{
    pattern: RegExp;
    replacement: string;
    description: string;
  }> {
    return [
      // Asset identity
      {
        pattern: /\basset_id\b/g,
        replacement: 'id',
        description: 'asset_id → id'
      },
      {
        pattern: /\bparent_id\b/g,
        replacement: 'parentId',
        description: 'parent_id → parentId'
      },
      
      // Layout
      {
        pattern: /\bz_index\b/g,
        replacement: 'zIndex',
        description: 'z_index → zIndex'
      },
      
      // Timestamps
      {
        pattern: /\bupdated_at\b/g,
        replacement: 'updatedAt',
        description: 'updated_at → updatedAt'
      },
      {
        pattern: /\bcreated_at\b/g,
        replacement: 'createdAt',
        description: 'created_at → createdAt'
      },
      
      // Database fields
      {
        pattern: /\bparent_asset_id\b/g,
        replacement: 'parentId',
        description: 'parent_asset_id → parentId'
      },
      {
        pattern: /\bstorage_key\b/g,
        replacement: 'storageKey',
        description: 'storage_key → storageKey'
      },
      {
        pattern: /\bmime_type\b/g,
        replacement: 'mimeType',
        description: 'mime_type → mimeType'
      },
      {
        pattern: /\bsize_bytes\b/g,
        replacement: 'sizeBytes',
        description: 'size_bytes → sizeBytes'
      },
      
      // UI state (should be removed from asset data)
      {
        pattern: /\bis_expanded\b/g,
        replacement: '/* REMOVED: is_expanded (UI state) */',
        description: 'Remove is_expanded (UI state)'
      },
      {
        pattern: /\bis_locked\b/g,
        replacement: '/* REMOVED: is_locked (UI state) */',
        description: 'Remove is_locked (UI state)'
      },
      
      // Cloud fields (should be removed)
      {
        pattern: /\bcloud_status\b/g,
        replacement: '/* REMOVED: cloud_status (sync state) */',
        description: 'Remove cloud_status (sync state)'
      },
      {
        pattern: /\bcloud_id\b/g,
        replacement: '/* REMOVED: cloud_id (sync state) */',
        description: 'Remove cloud_id (sync state)'
      },
      {
        pattern: /\bcloud_path\b/g,
        replacement: '/* REMOVED: cloud_path (sync state) */',
        description: 'Remove cloud_path (sync state)'
      },
      {
        pattern: /\bcloud_size\b/g,
        replacement: '/* REMOVED: cloud_size (sync state) */',
        description: 'Remove cloud_size (sync state)'
      },
      {
        pattern: /\bcloud_updated_at\b/g,
        replacement: '/* REMOVED: cloud_updated_at (sync state) */',
        description: 'Remove cloud_updated_at (sync state)'
      },
      {
        pattern: /\bcloud_error\b/g,
        replacement: '/* REMOVED: cloud_error (sync state) */',
        description: 'Remove cloud_error (sync state)'
      },
      
      // Other legacy fields
      {
        pattern: /\bdeleted_at\b/g,
        replacement: '/* REMOVED: deleted_at (use soft delete) */',
        description: 'Remove deleted_at (use soft delete)'
      },
      {
        pattern: /\bborder_shape\b/g,
        replacement: 'shape',
        description: 'border_shape → shape'
      },
      {
        pattern: /\bshow_tag_border\b/g,
        replacement: '/* REMOVED: show_tag_border (move to style) */',
        description: 'Remove show_tag_border (move to style)'
      },
    ];
  }

  /**
   * Apply field name replacements to code
   */
  static applyReplacements(code: string): string {
    const patterns = this.generateReplacementPatterns();
    let result = code;

    for (const { pattern, replacement } of patterns) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * Validate object has only canonical field names
   */
  static validateCanonicalFields(obj: any): {
    isValid: boolean;
    forbiddenFields: string[];
    suggestions: Array<{
      field: string;
      suggestion: string;
    }>;
  } {
    const forbiddenFields: string[] = [];
    const suggestions: Array<{ field: string; suggestion: string }> = [];

    for (const field of Object.keys(obj)) {
      if (this.isForbidden(field)) {
        forbiddenFields.push(field);
        
        const canonical = this.toCanonical(field);
        if (canonical) {
          suggestions.push({ field, suggestion: canonical });
        }
      }
    }

    return {
      isValid: forbiddenFields.length === 0,
      forbiddenFields,
      suggestions,
    };
  }

  /**
   * Generate migration report
   */
  static generateReport(files: Array<{
    path: string;
    changes: number;
    issues: string[];
  }>): {
    totalFiles: number;
    totalChanges: number;
    totalIssues: number;
    summary: string;
  } {
    const totalFiles = files.length;
    const totalChanges = files.reduce((sum, file) => sum + (file.changes || 0), 0);
    const totalIssues = files.reduce((sum, file) => sum + (file.issues?.length || 0), 0);

    const summary = `
Field Name Migration Report
========================
Total files processed: ${totalFiles}
Total field name changes: ${totalChanges}
Total issues found: ${totalIssues}

Files with most changes:
${files
  .sort((a, b) => b.changes - a.changes)
  .slice(0, 5)
  .map(file => `  ${file.path}: ${file.changes} changes`)
  .join('\n')}

Common issues:
${(() => {
  const issueCounts = files
    .flatMap(file => file.issues)
    .reduce((acc, issue) => {
      acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  
  return Object.entries(issueCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([issue, count]) => `  ${issue}: ${count} occurrences`)
    .join('\n');
})()}
    `.trim();

    return {
      totalFiles,
      totalChanges,
      totalIssues,
      summary,
    };
  }
}

// Export for use in migration scripts
export const fieldNameMigration = FieldNameMigration;
