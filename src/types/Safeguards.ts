/**
 * FORBIDDEN PATTERN DETECTION & VALIDATION
 * 
 * This module enforces the architectural safeguards defined in the plan.
 * It prevents anti-patterns that would break the single canonical asset structure.
 * 
 * 🔒 CRITICAL: These validations are NEVER to be bypassed or disabled
 */

import { Asset, AssetSchema } from './Asset';

// Forbidden fields that must NEVER appear in canonical asset data
export const FORBIDDEN_ASSET_FIELDS = [
  'sync_status',
  'upload_progress', 
  'selection_state',
  'hover_state',
  'drag_state',
  'retry_metadata',
  'transient_ui_state',
  'cloud_status',
  'cloud_id',
  'cloud_path',
  'cloud_size',
  'cloud_updated_at',
  'cloud_error',
  'file',
  'children', // This should be computed, not stored
  'parent_id', // Should be parentId (camelCase)
  'asset_id', // Should be id
  'z_index', // Should be zIndex
  'is_expanded', // UI state only
  'is_locked', // UI state only
  'border_shape', // Should be in style.shape
  'show_tag_border', // Should be in style
  'deleted_at', // Use soft delete pattern
  'updated_at', // Should be in metadata.updatedAt
  'created_at', // Should be in metadata.createdAt
] as const;

// Forbidden patterns that indicate architectural drift
export interface ForbiddenPattern {
  type: 'field_name' | 'state_pollution' | 'schema_drift' | 'nested_violation';
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate asset structure and detect forbidden patterns
 */
export function validateAssetStructure(asset: any): ForbiddenPattern[] {
  const violations: ForbiddenPattern[] = [];

  // Check for forbidden field names (case-insensitive) FIRST, before schema validation
  const assetKeys = Object.keys(asset).map(k => k.toLowerCase());
  
  for (const forbiddenField of FORBIDDEN_ASSET_FIELDS) {
    if (assetKeys.includes(forbiddenField.toLowerCase())) {
      violations.push({
        type: 'field_name',
        field: forbiddenField,
        message: `Forbidden field '${forbiddenField}' found in asset data. This violates state separation principles.`,
        severity: 'error',
      });
    }
  }

  // Check nested objects for forbidden patterns
  checkNestedObjects(asset, violations);

  // Check for state pollution in nested structures
  checkStatePollution(asset, violations);

  // Check for schema drift (behavior evolving into asset types)
  checkSchemaDrift(asset, violations);

  // Check if it's a valid asset at all (but don't return early)
  const basicValidation = AssetSchema.safeParse(asset);
  if (!basicValidation.success) {
    violations.push({
      type: 'schema_drift',
      message: `Asset does not conform to canonical schema: ${basicValidation.error.message}`,
      severity: 'error',
    });
  }

  return violations;
}

/**
 * Check nested objects for forbidden patterns
 */
function checkNestedObjects(obj: any, violations: ForbiddenPattern[], path = ''): void {
  if (typeof obj !== 'object' || obj === null) return;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Check for forbidden fields in nested objects
    if (FORBIDDEN_ASSET_FIELDS.includes(key as any)) {
      violations.push({
        type: 'nested_violation',
        field: currentPath,
        message: `Forbidden field '${key}' found in nested structure at ${currentPath}`,
        severity: 'error',
      });
    }

    // Recursively check nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      checkNestedObjects(value, violations, currentPath);
    }
  }
}

/**
 * Check for runtime state pollution
 */
function checkStatePollution(asset: Asset, violations: ForbiddenPattern[]): void {
  // Check for UI state in asset data
  const uiStateIndicators = ['selected', 'hovered', 'dragging', 'focused', 'active'];
  
  function searchForUIState(obj: any, path = ''): void {
    if (typeof obj !== 'object' || obj === null) return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check for UI state indicators
      if (uiStateIndicators.some(indicator => key.toLowerCase().includes(indicator))) {
        violations.push({
          type: 'state_pollution',
          field: currentPath,
          message: `UI state detected in asset data at ${currentPath}. UI state must be kept separate.`,
          severity: 'error',
        });
      }

      // Check for boolean fields that might be UI state
      if (typeof value === 'boolean' && isLikelyUIState(key)) {
        violations.push({
          type: 'state_pollution',
          field: currentPath,
          message: `Likely UI state field '${key}' found in asset data at ${currentPath}`,
          severity: 'warning',
        });
      }

      // Recursively search
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        searchForUIState(value, currentPath);
      }
    }
  }

  searchForUIState(asset);
}

/**
 * Check for schema drift patterns
 */
function checkSchemaDrift(asset: Asset, violations: ForbiddenPattern[]): void {
  // Check if behavior.renderMode is being used as an asset type
  if (asset.behavior?.renderMode) {
    const renderMode = asset.behavior.renderMode.toLowerCase();
    
    // Common asset type names that should not be used as render modes
    const assetTypeNames = ['image', 'document', 'video', 'audio', 'text', 'container', 'card'];
    
    if (assetTypeNames.includes(renderMode)) {
      violations.push({
        type: 'schema_drift',
        field: 'behavior.renderMode',
        message: `RenderMode '${renderMode}' looks like an asset type. RenderMode should describe behavior, not asset type.`,
        severity: 'warning',
      });
    }
  }

  // Check for customFields being used to store asset-type data
  if (asset.content?.customFields) {
    const customFieldKeys = Object.keys(asset.content.customFields);
    const assetTypeNames = ['image', 'document', 'video', 'audio', 'text', 'container', 'card'];
    
    for (const key of customFieldKeys) {
      if (assetTypeNames.includes(key.toLowerCase())) {
        violations.push({
          type: 'schema_drift',
          field: `content.customFields.${key}`,
          message: `CustomField '${key}' looks like asset type data. Use behavior.renderMode for rendering behavior.`,
          severity: 'warning',
        });
      }
    }
  }
}

/**
 * Helper function to determine if a field is likely UI state
 */
function isLikelyUIState(fieldName: string): boolean {
  const uiStatePatterns = [
    /^is[A-Z]/, // isExpanded, isSelected, etc.
    /selected$/i,
    /hovered$/i,
    /focused$/i,
    /active$/i,
    /dragging$/i,
    /expanded$/i,
    /collapsed$/i,
    /visible$/i, // unless it's for visibility control
  ];

  return uiStatePatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Runtime validation function that throws on violations
 */
export function validateAssetStrict(asset: any): asserts asset is Asset {
  const violations = validateAssetStructure(asset);
  
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  // Log warnings but don't throw
  if (warnings.length > 0) {
    console.warn('Asset validation warnings:', warnings);
  }

  // Throw on errors
  if (errors.length > 0) {
    const errorMessage = errors.map(e => e.message).join('; ');
    throw new Error(`Asset validation failed: ${errorMessage}`);
  }
}

/**
 * Check if an object follows the canonical asset structure
 */
export function isCanonicalAsset(obj: any): obj is Asset {
  try {
    validateAssetStrict(obj);
    return true;
  } catch {
    return false;
  }
}

/**
 * Development-time linting helpers
 */
export const lintingRules = {
  /**
   * Check if code contains forbidden patterns (for ESLint rules)
   */
  checkForForbiddenPatterns: (code: string): string[] => {
    const issues: string[] = [];
    
    // Check for forbidden field access patterns
    FORBIDDEN_ASSET_FIELDS.forEach(field => {
      const regex = new RegExp(`\\.${field}\\b`, 'g');
      if (regex.test(code)) {
        issues.push(`Forbidden field access: .${field}`);
      }
    });

    // Check for direct localStorage usage
    if (/localStorage\.setItem|localStorage\.getItem/.test(code)) {
      issues.push('Direct localStorage usage detected - use IndexedDB instead');
    }

    return issues;
  },

  /**
   * Check for branching logic based on asset behavior
   */
  checkForBehaviorBranching: (code: string): string[] => {
    const issues: string[] = [];
    
    // Look for if/switch statements based on asset properties
    const branchingPatterns = [
      /if\s*\(\s*asset\.\w+.*\)/g,
      /switch\s*\(\s*asset\.\w+/g,
      /asset\.\w+===\s*['"][^'"]*['"]/g,
    ];

    branchingPatterns.forEach(pattern => {
      const matches = code.match(pattern);
      if (matches) {
        issues.push(`Potential behavior-based branching: ${matches.join(', ')}`);
      }
    });

    return issues;
  },
};
