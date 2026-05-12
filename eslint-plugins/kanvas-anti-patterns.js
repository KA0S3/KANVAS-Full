/**
 * KANVAS ANTI-PATTERNS ESLint PLUGIN
 * 
 * Enforces architectural safeguards to prevent drift from
 * the canonical asset structure and zone separation principles.
 * 
 * 🔒 CRITICAL: These rules protect architectural integrity
 */

// Forbidden fields that must NEVER appear in canonical asset data
const FORBIDDEN_ASSET_FIELDS = [
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
  'children',
  'parent_id',
  'asset_id',
  'z_index',
  'is_expanded',
  'is_locked',
  'border_shape',
  'show_tag_border',
  'deleted_at',
  'updated_at',
  'created_at',
];

export default {
  rules: {
    // Rule: No forbidden fields in asset objects
    'no-forbidden-fields': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent use of forbidden fields that violate zone separation',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          MemberExpression(node) {
            const propertyName = node.property && node.property.name;
            
            if (propertyName && FORBIDDEN_ASSET_FIELDS.includes(propertyName)) {
              context.report({
                node,
                message: `Forbidden field '${propertyName}' detected. This violates zone separation principles.`,
              });
            }
          },
          
          Property(node) {
            const propertyName = node.key && node.key.name;
            
            if (propertyName && FORBIDDEN_ASSET_FIELDS.includes(propertyName)) {
              context.report({
                node,
                message: `Forbidden field '${propertyName}' detected. This violates zone separation principles.`,
              });
            }
          },
        };
      },
    },

    // Rule: No direct localStorage usage
    'no-direct-localstorage': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent direct localStorage usage, use IndexedDB instead',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (node.object && node.object.name === 'localStorage') {
              context.report({
                node,
                message: 'Direct localStorage usage detected. Use IndexedDB through the storage layer instead.',
              });
            }
          },
        };
      },
    },

    // Rule: No embedded files in assets
    'no-embedded-files': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent embedding file data in asset objects',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          Property(node) {
            const propertyName = node.key && node.key.name;
            
            if (propertyName && (propertyName === 'file' || propertyName === 'blob')) {
              context.report({
                node,
                message: `Embedded file data detected in '${propertyName}'. Files must be stored separately, not embedded in assets.`,
              });
            }
          },
        };
      },
    },

    // Rule: No sync state pollution
    'no-sync-state-pollution': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent sync state pollution in canonical asset data',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        const syncStateFields = ['sync_status', 'upload_progress', 'retry_metadata', 'cloud_status'];
        
        return {
          Property(node) {
            const propertyName = node.key && node.key.name;
            
            if (propertyName && syncStateFields.includes(propertyName)) {
              context.report({
                node,
                message: `Sync state field '${propertyName}' detected. Sync state must be kept separate from canonical asset data.`,
              });
            }
          },
        };
      },
    },

    // Rule: No UI state pollution
    'no-ui-state-pollution': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent UI state pollution in persistent data',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        const uiStatePatterns = ['selected', 'hovered', 'dragging', 'focused', 'active'];
        
        return {
          Property(node) {
            const propertyName = node.key && node.key.name;
            
            if (propertyName && uiStatePatterns.some(pattern => 
              propertyName.toLowerCase().includes(pattern))) {
              context.report({
                node,
                message: `UI state field '${propertyName}' detected. UI state must be kept separate from persistent data.`,
              });
            }
          },
        };
      },
    },

    // Rule: No behavior-based branching
    'no-behavior-branching': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Prevent branching logic based on asset behavior/types',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          IfStatement(node) {
            const test = node.test;
            
            // Check for asset.property comparisons
            if (test && test.type === 'BinaryExpression') {
              const left = test.left;
              const right = test.right;
              
              if (left.type === 'MemberExpression' && 
                  left.object.type === 'Identifier' &&
                  left.object.name === 'asset') {
                context.report({
                  node,
                  message: 'Behavior-based branching detected. Use configuration-based rendering instead of type-specific logic.',
                });
              }
            }
            
            // Check for switch statements on asset properties
            if (test && test.type === 'MemberExpression' &&
                test.object.type === 'Identifier' &&
                test.object.name === 'asset') {
              context.report({
                node,
                message: 'Behavior-based branching detected. Use configuration-based rendering instead of type-specific logic.',
              });
            }
          },
          
          SwitchStatement(node) {
            const discriminant = node.discriminant;
            
            if (discriminant && discriminant.type === 'MemberExpression' &&
                discriminant.object.type === 'Identifier' &&
                discriminant.object.name === 'asset') {
              context.report({
                node,
                message: 'Behavior-based branching detected. Use configuration-based rendering instead of type-specific logic.',
              });
            }
          },
        };
      },
    },

    // Rule: No full project reloads
    'no-full-project-reload': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent full project reloads after operations',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;
            
            if (callee && callee.type === 'MemberExpression') {
              const propertyName = callee.property && callee.property.name;
              const objectName = callee.object && callee.object.name;
              
              // Check for common reload patterns
              if (propertyName === 'reload' || propertyName === 'refresh') {
                context.report({
                  node,
                  message: 'Full project reload detected. Use incremental updates instead of full reloads.',
                });
              }
            }
          },
        };
      },
    },

    // Rule: No conditional schemas
    'no-conditional-schema': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent conditional database schemas based on asset configuration',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          IfStatement(node) {
            const test = node.test;
            
            // Check for schema-related conditions
            if (test && test.type === 'BinaryExpression') {
              const left = test.left;
              const right = test.right;
              
              const schemaKeywords = ['schema', 'table', 'index', 'column'];
              const hasSchemaKeyword = (node) => {
                if (!node) return false;
                const source = context.getSourceCode().getText(node);
                return schemaKeywords.some(keyword => 
                  source.toLowerCase().includes(keyword));
              };
              
              if (hasSchemaKeyword(left) || hasSchemaKeyword(right)) {
                context.report({
                  node,
                  message: 'Conditional schema detected. Database schema must be unified, not conditional.',
                });
              }
            }
          },
        };
      },
    },

    // Rule: Require zone separation
    'require-zone-separation': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Ensure proper zone separation in data structures',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          ObjectExpression(node) {
            const properties = node.properties;
            
            // Check for mixed zones in same object
            const hasCanonicalFields = properties.some(prop => 
              prop.key && prop.key.name && ['layout', 'content', 'style', 'behavior', 'metadata'].includes(prop.key.name));
            
            const hasSyncFields = properties.some(prop => 
              prop.key && prop.key.name && ['sync_status', 'upload_progress', 'retry_count'].includes(prop.key.name));
            
            const hasUIFields = properties.some(prop => 
              prop.key && prop.key.name && ['selected', 'hovered', 'dragging'].includes(prop.key.name));
            
            if (hasCanonicalFields && (hasSyncFields || hasUIFields)) {
              context.report({
                node,
                message: 'Zone separation violation detected. Canonical asset data, sync state, and UI state must be kept separate.',
              });
            }
          },
        };
      },
    },

    // Rule: No asset type branching (NEW - from document requirements)
    'no-asset-type-branching': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent branching logic based on asset types - use configuration-based rendering instead',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          IfStatement(node) {
            const test = node.test;
            
            // Check for asset.type or asset.behavior.renderMode branching
            if (test && test.type === 'BinaryExpression') {
              const checkForAssetTypeBranching = (expr) => {
                if (expr.type === 'MemberExpression' &&
                    expr.object.type === 'Identifier' &&
                    expr.object.name === 'asset') {
                  const property = expr.property.name;
                  if (property === 'type' || property === 'renderMode') {
                    return true;
                  }
                  // Check for nested behavior.renderMode
                  if (property === 'behavior' && expr.parent && expr.parent.property) {
                    return expr.parent.property.name === 'renderMode';
                  }
                }
                return false;
              };
              
              if (checkForAssetTypeBranching(test.left) || checkForAssetTypeBranching(test.right)) {
                context.report({
                  node,
                  message: 'Asset type branching detected. Use configuration-based rendering instead of type-specific logic.',
                });
              }
            }
          },
          
          SwitchStatement(node) {
            const discriminant = node.discriminant;
            
            if (discriminant && discriminant.type === 'MemberExpression' &&
                discriminant.object && discriminant.object.type === 'Identifier' &&
                discriminant.object.name === 'asset') {
              const property = discriminant.property && discriminant.property.name;
              if (property === 'type' || property === 'renderMode') {
                context.report({
                  node,
                  message: 'Asset type branching detected. Use configuration-based rendering instead of type-specific logic.',
                });
              }
            }
          },
        };
      },
    },

    // Rule: No sync state in assets (NEW - from document requirements)
    'no-sync-state-in-assets': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent sync state fields in canonical asset data',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        const syncStateFields = [
          'sync_status', 'syncStatus', 'status',
          'upload_progress', 'uploadProgress', 'progress',
          'retry_count', 'retryCount', 'retry_metadata', 'retryMetadata',
          'cloud_status', 'cloudStatus', 'cloud_id', 'cloudId',
          'cloud_path', 'cloudPath', 'cloud_updated_at', 'cloudUpdatedAt',
          'error', 'lastError', 'is_syncing', 'isSyncing'
        ];
        
        return {
          Property(node) {
            const propertyName = node.key && node.key.name;
            
            if (propertyName && syncStateFields.includes(propertyName)) {
              context.report({
                node,
                message: `Sync state field '${propertyName}' detected. Sync state must be kept in separate sync queue, not in asset data.`,
              });
            }
          },
          
          MemberExpression(node) {
            const propertyName = node.property && node.property.name;
            
            if (propertyName && syncStateFields.includes(propertyName)) {
              // Check if we're accessing these on an asset object
              let object = node.object;
              while (object) {
                if (object.type === 'Identifier' && object.name === 'asset') {
                  context.report({
                    node,
                    message: `Sync state access '${propertyName}' on asset detected. Use sync store instead.`,
                  });
                  break;
                }
                object = object.object;
              }
            }
          },
        };
      },
    },

    // Rule: Require canonical structure (NEW - from document requirements)
    'require-canonical-structure': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Ensure assets follow the canonical structure with required sections',
          category: 'Best Practices',
          recommended: true,
        },
        fixable: null,
        schema: [],
      },
      create(context) {
        return {
          ObjectExpression(node) {
            // Only check objects that look like assets (have id field)
            const properties = node.properties;
            const hasId = properties.some(prop => prop.key && prop.key.name === 'id');
            
            if (!hasId) return;
            
            const propertyNames = properties.map(prop => prop.key && prop.key.name).filter(Boolean);
            
            // Check for required canonical sections
            const requiredSections = ['layout', 'content', 'style', 'behavior', 'metadata'];
            const missingSections = requiredSections.filter(section => !propertyNames.includes(section));
            
            if (missingSections.length > 0) {
              context.report({
                node,
                message: `Asset missing required canonical sections: ${missingSections.join(', ')}. All assets must have layout, content, style, behavior, and metadata sections.`,
              });
            }
            
            // Check for forbidden top-level fields
            const forbiddenTopLevel = ['name', 'title', 'text', 'image', 'file', 'x', 'y', 'width', 'height'];
            const foundForbidden = forbiddenTopLevel.filter(field => propertyNames.includes(field));
            
            if (foundForbidden.length > 0) {
              context.report({
                node,
                message: `Forbidden top-level fields detected: ${foundForbidden.join(', ')}. These must be nested in appropriate sections (layout, content, style, behavior, or metadata).`,
              });
            }
          },
        };
      },
    },
  },
};
