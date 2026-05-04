/**
 * Asset Type Validation System
 * Provides runtime validation for asset types and properties
 */

import type { Asset } from '@/components/AssetItem';

// Valid asset types - must match the Asset interface
export const VALID_ASSET_TYPES = [
  "image",
  "document", 
  "video",
  "audio",
  "code",
  "other",
  "card",
  "text",
  "container",
  "viewport",
  "tag"
] as const;

export type AssetType = typeof VALID_ASSET_TYPES[number];

export class AssetValidationError extends Error {
  constructor(field: string, value: unknown, expectedType: string) {
    super(`Invalid asset ${field}: expected ${expectedType}, got ${typeof value} (${value})`);
    this.name = 'AssetValidationError';
  }
}

/**
 * Validates if a value is a valid asset type
 */
export function isValidAssetType(type: unknown): type is AssetType {
  return typeof type === 'string' && VALID_ASSET_TYPES.includes(type as AssetType);
}

/**
 * Validates asset type and throws error if invalid
 */
export function validateAssetType(type: unknown): AssetType {
  if (!isValidAssetType(type)) {
    throw new AssetValidationError('type', type, `one of: ${VALID_ASSET_TYPES.join(', ')}`);
  }
  return type;
}

/**
 * Validates numeric asset properties
 */
export function validateNumber(value: unknown, fieldName: string, min?: number, max?: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new AssetValidationError(fieldName, value, 'valid number');
  }
  
  if (min !== undefined && value < min) {
    throw new AssetValidationError(fieldName, value, `number >= ${min}`);
  }
  
  if (max !== undefined && value > max) {
    throw new AssetValidationError(fieldName, value, `number <= ${max}`);
  }
  
  return value;
}

/**
 * Validates string properties
 */
export function validateString(value: unknown, fieldName: string, minLength?: number, maxLength?: number): string {
  if (typeof value !== 'string') {
    throw new AssetValidationError(fieldName, value, 'string');
  }
  
  if (minLength !== undefined && value.length < minLength) {
    throw new AssetValidationError(fieldName, value, `string with length >= ${minLength}`);
  }
  
  if (maxLength !== undefined && value.length > maxLength) {
    throw new AssetValidationError(fieldName, value, `string with length <= ${maxLength}`);
  }
  
  return value;
}

/**
 * Validates array properties
 */
export function validateArray<T>(value: unknown, fieldName: string, itemValidator?: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) {
    throw new AssetValidationError(fieldName, value, 'array');
  }
  
  if (itemValidator) {
    return value.map(itemValidator);
  }
  
  return value as T[];
}

/**
 * Validates optional properties
 */
export function validateOptional<T>(
  value: unknown, 
  validator: (val: unknown) => T,
  fieldName: string
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  
  return validator(value);
}

/**
 * Validates asset ID format
 */
export function validateAssetId(id: unknown): string {
  const idStr = validateString(id, 'id', 1, 100);
  
  // Basic validation for asset ID format
  if (!/^[a-zA-Z0-9_-]+$/.test(idStr)) {
    throw new AssetValidationError('id', idStr, 'alphanumeric string with underscores and hyphens');
  }
  
  return idStr;
}

/**
 * Validates viewport configuration
 */
export function validateViewportConfig(config: unknown) {
  if (config === null || config === undefined) {
    return undefined;
  }
  
  if (typeof config !== 'object' || config === null) {
    throw new AssetValidationError('viewportConfig', config, 'object or null');
  }
  
  const cfg = config as Record<string, unknown>;
  
  return {
    zoom: validateNumber(cfg.zoom, 'viewportConfig.zoom', 0.1, 10),
    panX: validateNumber(cfg.panX, 'viewportConfig.panX'),
    panY: validateNumber(cfg.panY, 'viewportConfig.panY')
  };
}

/**
 * Validates background configuration
 */
export function validateBackgroundConfig(config: unknown) {
  if (config === null || config === undefined) {
    return undefined;
  }
  
  if (typeof config !== 'object' || config === null) {
    throw new AssetValidationError('backgroundConfig', config, 'object or null');
  }
  
  const cfg = config as Record<string, unknown>;
  
  return {
    isClear: validateOptional(cfg.isClear, (val) => {
      if (typeof val !== 'boolean') {
        throw new AssetValidationError('backgroundConfig.isClear', val, 'boolean');
      }
      return val;
    }, 'backgroundConfig.isClear'),
    color: validateOptional(cfg.color, (val) => validateString(val, 'backgroundConfig.color'), 'backgroundConfig.color'),
    image: validateOptional(cfg.image, (val) => validateString(val, 'backgroundConfig.image'), 'backgroundConfig.image'),
    position: validateOptional(cfg.position, (val) => {
      if (typeof val !== 'object' || val === null) {
        throw new AssetValidationError('backgroundConfig.position', val, 'object');
      }
      const pos = val as Record<string, unknown>;
      return {
        x: validateNumber(pos.x, 'backgroundConfig.position.x'),
        y: validateNumber(pos.y, 'backgroundConfig.position.y')
      };
    }, 'backgroundConfig.position'),
    scale: validateOptional(cfg.scale, (val) => validateNumber(val, 'backgroundConfig.scale', 0.1, 10), 'backgroundConfig.scale'),
    gridSize: validateOptional(cfg.gridSize, (val) => validateNumber(val, 'backgroundConfig.gridSize', 1, 200), 'backgroundConfig.gridSize'),
    edgeOpacity: validateOptional(cfg.edgeOpacity, (val) => validateNumber(val, 'backgroundConfig.edgeOpacity', 0, 1), 'backgroundConfig.edgeOpacity'),
    useParchment: validateOptional(cfg.useParchment, (val) => {
      if (typeof val !== 'boolean') {
        throw new AssetValidationError('backgroundConfig.useParchment', val, 'boolean');
      }
      return val;
    }, 'backgroundConfig.useParchment')
  };
}

/**
 * Complete asset validation
 */
export function validateAsset(asset: unknown): Asset {
  if (typeof asset !== 'object' || asset === null) {
    throw new AssetValidationError('asset', asset, 'object');
  }
  
  const assetObj = asset as Record<string, unknown>;
  
  return {
    id: validateAssetId(assetObj.id),
    name: validateString(assetObj.name, 'name', 1, 200),
    type: validateAssetType(assetObj.type),
    x: validateNumber(assetObj.x, 'x'),
    y: validateNumber(assetObj.y, 'y'),
    width: validateNumber(assetObj.width, 'width', 1),
    height: validateNumber(assetObj.height, 'height', 1),
    parentId: validateOptional(assetObj.parentId, validateAssetId, 'parentId'),
    children: validateArray(assetObj.children, 'children', validateAssetId),
    description: validateOptional(assetObj.description, (val) => validateString(val, 'description', 0, 1000), 'description'),
    customFields: validateArray(assetObj.customFields, 'customFields') || [],
    customFieldValues: validateArray(assetObj.customFieldValues, 'customFieldValues') || [],
    thumbnail: validateOptional(assetObj.thumbnail, (val) => validateString(val, 'thumbnail'), 'thumbnail'),
    background: validateOptional(assetObj.background, (val) => validateString(val, 'background'), 'background'),
    tags: validateOptional(assetObj.tags, (val) => validateArray(val, 'tags', (item) => validateString(item, 'tags item')), 'tags'),
    content: validateOptional(assetObj.content, (val) => validateString(val, 'content'), 'content'),
    viewportConfig: validateViewportConfig(assetObj.viewportConfig),
    backgroundConfig: validateBackgroundConfig(assetObj.backgroundConfig),
    viewportDisplaySettings: validateOptional(assetObj.viewportDisplaySettings, (val) => {
      if (typeof val !== 'object' || val === null) {
        throw new AssetValidationError('viewportDisplaySettings', val, 'object');
      }
      const settings = val as Record<string, unknown>;
      return {
        name: typeof settings.name === 'boolean' ? settings.name : true,
        description: typeof settings.description === 'boolean' ? settings.description : true,
        thumbnail: typeof settings.thumbnail === 'boolean' ? settings.thumbnail : true,
        portraitBlur: validateNumber(settings.portraitBlur, 'viewportDisplaySettings.portraitBlur', 0, 1)
      };
    }, 'viewportDisplaySettings'),
    createdAt: validateOptional(assetObj.createdAt, (val) => validateNumber(val, 'createdAt'), 'createdAt'),
    updatedAt: validateOptional(assetObj.updatedAt, (val) => validateNumber(val, 'updatedAt'), 'updatedAt'),
    isExpanded: validateOptional(assetObj.isExpanded, (val) => {
      if (typeof val !== 'boolean') {
        throw new AssetValidationError('isExpanded', val, 'boolean');
      }
      return val;
    }, 'isExpanded'),
    isLocked: validateOptional(assetObj.isLocked, (val) => {
      if (typeof val !== 'boolean') {
        throw new AssetValidationError('isLocked', val, 'boolean');
      }
      return val;
    }, 'isLocked'),
    borderShape: validateOptional(assetObj.borderShape, (val) => {
      if (!['square', 'circle'].includes(val as string)) {
        throw new AssetValidationError('borderShape', val, 'square or circle');
      }
      return val as 'square' | 'circle';
    }, 'borderShape'),
    showTagBorder: validateOptional(assetObj.showTagBorder, (val) => {
      if (typeof val !== 'boolean') {
        throw new AssetValidationError('showTagBorder', val, 'boolean');
      }
      return val;
    }, 'showTagBorder'),
    cloudStatus: validateOptional(assetObj.cloudStatus, (val) => {
      if (!['local', 'uploading', 'synced', 'failed'].includes(val as string)) {
        throw new AssetValidationError('cloudStatus', val, 'local, uploading, synced, or failed');
      }
      return val as 'local' | 'uploading' | 'synced' | 'failed';
    }, 'cloudStatus'),
    cloudId: validateOptional(assetObj.cloudId, (val) => validateString(val, 'cloudId'), 'cloudId'),
    cloudPath: validateOptional(assetObj.cloudPath, (val) => validateString(val, 'cloudPath'), 'cloudPath'),
    cloudSize: validateOptional(assetObj.cloudSize, (val) => validateNumber(val, 'cloudSize', 0), 'cloudSize'),
    cloudUpdatedAt: validateOptional(assetObj.cloudUpdatedAt, (val) => validateString(val, 'cloudUpdatedAt'), 'cloudUpdatedAt'),
    cloudError: validateOptional(assetObj.cloudError, (val) => validateString(val, 'cloudError'), 'cloudError'),
    deletedAt: validateOptional(assetObj.deletedAt, (val) => validateString(val, 'deletedAt'), 'deletedAt'),
    file: validateOptional(assetObj.file, (val) => {
      if (!(val instanceof File)) {
        throw new AssetValidationError('file', val, 'File object');
      }
      return val;
    }, 'file')
  };
}

/**
 * Safe asset validation that returns validation result instead of throwing
 */
export function safeValidateAsset(asset: unknown): { isValid: boolean; asset?: Asset; errors: string[] } {
  try {
    const validatedAsset = validateAsset(asset);
    return { isValid: true, asset: validatedAsset, errors: [] };
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return { isValid: false, errors: [error.message] };
    }
    return { isValid: false, errors: ['Unknown validation error'] };
  }
}
