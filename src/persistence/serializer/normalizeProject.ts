import type { Asset } from '@/types/Asset';
import type {
  CleanProjectState,
  NormalizedProject,
  SerializationWarning,
  SerializedAsset,
  SerializedTag,
} from './types';
import { PROJECT_SCHEMA_VERSION } from './types';
import { isLikelyReferenceKey, isUnsafeAssetReference, toRelativeAssetPath, warningForReference } from './assetReferenceRules';

export function normalizeProject(projectState: CleanProjectState): NormalizedProject {
  const warnings = [...projectState.warnings];
  const assets = [...projectState.assets]
    .filter(asset => asset.projectId === projectState.project.id)
    .sort(compareAssets)
    .map(asset => normalizeAsset(asset, warnings));

  const rootAssetIds = assets
    .filter(asset => !asset.parentId)
    .map(asset => asset.id)
    .sort();

  const tags = [
    ...projectState.projectTags.map(tag => ({
      id: tag.id,
      projectId: tag.projectId,
      name: tag.name,
      color: tag.color,
      scope: 'project' as const,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    })),
    ...projectState.globalTags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      scope: 'global' as const,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    })),
  ].sort((a, b) => `${a.scope}:${a.name}:${a.id}`.localeCompare(`${b.scope}:${b.name}:${b.id}`));

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: projectState.project.id,
    projectName: projectState.project.name,
    description: projectState.project.description,
    createdAt: projectState.project.createdAt,
    updatedAt: projectState.project.updatedAt,
    appVersion: projectState.appVersion,
    settings: sanitizeObject(projectState.project.settings || {}, 'project.settings', warnings) as Record<string, unknown>,
    canvases: [{ id: 'default', rootAssetIds }],
    assets,
    tags: tags as SerializedTag[],
    files: [...projectState.files].sort((a, b) => a.id.localeCompare(b.id)),
    warnings,
  };
}

function normalizeAsset(asset: Asset, warnings: SerializationWarning[]): SerializedAsset {
  const imageRef = normalizeReference(asset.content?.imageUrl, `assets.${asset.id}.content.imageUrl`, asset.id, warnings);
  const customFields = sanitizeObject(asset.content?.customFields || {}, `assets.${asset.id}.content.customFields`, warnings, asset.id);
  const style = sanitizeObject(asset.style || {}, `assets.${asset.id}.style`, warnings, asset.id) as Record<string, unknown>;
  const behavior = sanitizeObject(asset.behavior || {}, `assets.${asset.id}.behavior`, warnings, asset.id) as Asset['behavior'];

  return {
    id: asset.id,
    projectId: asset.projectId,
    parentId: asset.parentId || undefined,
    layout: {
      x: asset.layout.x,
      y: asset.layout.y,
      width: asset.layout.width,
      height: asset.layout.height,
      scale: asset.layout.scale,
      rotation: asset.layout.rotation,
      zIndex: asset.layout.zIndex,
    },
    content: {
      title: asset.content?.title,
      description: asset.content?.description,
      text: asset.content?.text,
      imageRef,
      customFields: Object.keys(customFields).length ? customFields : undefined,
    },
    style,
    behavior,
    metadata: {
      tags: asset.metadata.tags ? [...asset.metadata.tags].sort() : undefined,
      createdAt: asset.metadata.createdAt,
      updatedAt: asset.metadata.updatedAt,
      version: asset.metadata.version,
    },
  };
}

function sanitizeObject(value: unknown, path: string, warnings: SerializationWarning[], assetId?: string): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => sanitizeObject(entry, `${path}.${index}`, warnings, assetId))
      .filter(entry => entry !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    const childPath = `${path}.${key}`;
    if (typeof child === 'string' && (isLikelyReferenceKey(key) || isUnsafeAssetReference(child))) {
      const normalized = normalizeReference(child, childPath, assetId, warnings);
      if (normalized) {
        output[key] = normalized;
      }
      continue;
    }

    const sanitized = sanitizeObject(child, childPath, warnings, assetId);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
}

function normalizeReference(
  value: string | undefined,
  path: string,
  assetId: string | undefined,
  warnings: SerializationWarning[]
): string | undefined {
  if (!value) {
    return undefined;
  }

  const warning = warningForReference(value, path, assetId);
  if (warning) {
    warnings.push(warning);
    return undefined;
  }

  return value.startsWith('assets/') ? value : toRelativeAssetPath(assetId, value, path);
}

function compareAssets(a: Asset, b: Asset): number {
  return `${a.parentId || ''}:${a.layout?.zIndex || 0}:${a.id}`.localeCompare(`${b.parentId || ''}:${b.layout?.zIndex || 0}:${b.id}`);
}
