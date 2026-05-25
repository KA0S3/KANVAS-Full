import Ajv from 'ajv';
import type { SerializedProject, SerializedProjectJson, ProjectMetadata, ValidationResult, SerializationError, SerializationWarning } from './types';
import { projectJsonSchema } from './projectSchema';
import { metadataJsonSchema } from './metadataSchema';
import { isAbsolutePath, isBase64DataUrl, isSupabaseOrCloudUrl } from './assetReferenceRules';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validateProjectJsonSchema = ajv.compile(projectJsonSchema);
const validateMetadataJsonSchema = ajv.compile(metadataJsonSchema);

export function validateSerializedProject(serialized: Pick<SerializedProject, 'projectJson' | 'metadataJson' | 'assetManifest'>): ValidationResult {
  const errors: SerializationError[] = [];
  const warnings: SerializationWarning[] = [];

  collectSchemaErrors(validateProjectJsonSchema(serialized.projectJson), validateProjectJsonSchema.errors, 'projectJson', errors);
  collectSchemaErrors(validateMetadataJsonSchema(serialized.metadataJson), validateMetadataJsonSchema.errors, 'metadataJson', errors);

  validateProjectContent(serialized.projectJson, errors, warnings);
  validateMetadataContent(serialized.metadataJson, errors);
  validateAssetManifest(serialized, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function collectSchemaErrors(valid: boolean, schemaErrors: typeof validateProjectJsonSchema.errors, root: string, errors: SerializationError[]): void {
  if (valid) {
    return;
  }

  for (const error of schemaErrors || []) {
    errors.push({
      code: 'schema_validation_failed',
      message: error.message || 'Schema validation failed.',
      path: `${root}${error.instancePath}`,
    });
  }
}

function validateProjectContent(projectJson: SerializedProjectJson, errors: SerializationError[], warnings: SerializationWarning[]): void {
  const assetIds = new Set<string>();
  for (const asset of projectJson.assets) {
    if (assetIds.has(asset.id)) {
      errors.push({ code: 'duplicate_asset_id', message: `Duplicate asset id '${asset.id}'.`, path: `assets.${asset.id}`, assetId: asset.id });
    }
    assetIds.add(asset.id);

    if (asset.projectId !== projectJson.projectId) {
      errors.push({ code: 'asset_project_mismatch', message: `Asset '${asset.id}' belongs to a different project.`, path: `assets.${asset.id}.projectId`, assetId: asset.id });
    }
  }

  for (const asset of projectJson.assets) {
    if (asset.parentId && !assetIds.has(asset.parentId)) {
      errors.push({ code: 'missing_parent_asset', message: `Asset '${asset.id}' references missing parent '${asset.parentId}'.`, path: `assets.${asset.id}.parentId`, assetId: asset.id });
    }
  }

  detectParentCycles(projectJson, errors);
  scanStrings(projectJson, 'projectJson', errors, warnings);
}

function validateMetadataContent(metadataJson: ProjectMetadata, errors: SerializationError[]): void {
  if (metadataJson.assetCount < 0 || metadataJson.fileReferenceCount < 0) {
    errors.push({ code: 'invalid_metadata_counts', message: 'Metadata counts cannot be negative.', path: 'metadataJson' });
  }
}

function validateAssetManifest(
  serialized: Pick<SerializedProject, 'projectJson' | 'assetManifest'>,
  errors: SerializationError[],
  warnings: SerializationWarning[]
): void {
  const manifestPaths = new Set(serialized.assetManifest.map(reference => reference.relativePath).filter(Boolean));

  for (const asset of serialized.projectJson.assets) {
    if (asset.content.imageRef && !manifestPaths.has(asset.content.imageRef)) {
      warnings.push({
        code: 'asset_reference_not_in_manifest',
        message: `Asset '${asset.id}' has an imageRef that is not present in the asset manifest.`,
        path: `assets.${asset.id}.content.imageRef`,
        assetId: asset.id,
        severity: 'warning',
      });
    }
  }

  for (const reference of serialized.assetManifest) {
    if (reference.relativePath && isAbsolutePath(reference.relativePath)) {
      errors.push({ code: 'absolute_manifest_path', message: 'Asset manifest contains an absolute path.', path: reference.sourceField, assetId: reference.assetId });
    }
  }
}

function detectParentCycles(projectJson: SerializedProjectJson, errors: SerializationError[]): void {
  const parentById = new Map(projectJson.assets.map(asset => [asset.id, asset.parentId]));

  for (const asset of projectJson.assets) {
    const visited = new Set<string>();
    let current = asset.id;
    while (current) {
      if (visited.has(current)) {
        errors.push({ code: 'parent_cycle', message: `Parent cycle detected at asset '${asset.id}'.`, path: `assets.${asset.id}.parentId`, assetId: asset.id });
        break;
      }
      visited.add(current);
      current = parentById.get(current) || '';
    }
  }
}

function scanStrings(value: unknown, path: string, errors: SerializationError[], warnings: SerializationWarning[]): void {
  if (typeof value === 'string') {
    if (isBase64DataUrl(value)) {
      errors.push({ code: 'base64_in_project_json', message: 'Base64/data URL found in project.json.', path });
    } else if (isAbsolutePath(value)) {
      errors.push({ code: 'absolute_path_in_project_json', message: 'Absolute path found in project.json.', path });
    } else if (isSupabaseOrCloudUrl(value)) {
      errors.push({ code: 'cloud_url_in_project_json', message: 'Supabase/R2/cloud URL found in project.json.', path });
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanStrings(entry, `${path}.${index}`, errors, warnings));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    scanStrings(child, `${path}.${key}`, errors, warnings);
  }
}
