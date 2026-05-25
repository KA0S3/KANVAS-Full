import type { CleanProjectState, AssetReference, SerializationWarning } from './types';
import { classifyReference, isLikelyReferenceKey, toRelativeAssetPath } from './assetReferenceRules';

export function collectAssetReferences(projectState: CleanProjectState): AssetReference[] {
  const references: AssetReference[] = [];
  const seen = new Set<string>();

  for (const asset of projectState.assets) {
    collectFromObject(asset.content, `assets.${asset.id}.content`, asset.id, references, seen);
    collectFromObject(asset.style, `assets.${asset.id}.style`, asset.id, references, seen);
    collectFromObject(asset.behavior, `assets.${asset.id}.behavior`, asset.id, references, seen);
  }

  for (const file of projectState.files) {
    const warnings: SerializationWarning[] = [];
    if (!file.assetId) {
      warnings.push({
        code: 'file_missing_asset_id',
        message: 'File record has no assetId and cannot be tied to a durable asset folder.',
        path: `files.${file.id}`,
        severity: 'warning',
      });
    }

    const relativePath = file.assetId ? toRelativeAssetPath(file.assetId, file.storageKey, file.id) : undefined;
    const key = `file:${file.id}:${relativePath || file.storageKey}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    references.push({
      id: file.id,
      assetId: file.assetId,
      sourceField: 'files.storageKey',
      originalValue: file.storageKey,
      relativePath,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: file.assetId ? 'safe' : 'missing',
      warnings,
    });

    if (file.cloudUrl) {
      references.push(buildReference(`file-cloud:${file.id}`, file.assetId, 'files.cloudUrl', file.cloudUrl));
    }
  }

  return references.sort((a, b) => {
    const byStatus = a.status.localeCompare(b.status);
    if (byStatus) return byStatus;
    return (a.relativePath || a.originalValue || a.id).localeCompare(b.relativePath || b.originalValue || b.id);
  });
}

function collectFromObject(
  value: unknown,
  path: string,
  assetId: string,
  references: AssetReference[],
  seen: Set<string>
): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectFromObject(entry, `${path}.${index}`, assetId, references, seen));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (typeof child === 'string' && isLikelyReferenceKey(key)) {
      const reference = buildReference(`${assetId}:${childPath}`, assetId, childPath, child);
      const seenKey = `${reference.assetId}:${reference.sourceField}:${reference.originalValue}`;
      if (!seen.has(seenKey)) {
        references.push(reference);
        seen.add(seenKey);
      }
      continue;
    }

    if (child && typeof child === 'object') {
      collectFromObject(child, childPath, assetId, references, seen);
    }
  }
}

function buildReference(id: string, assetId: string | undefined, sourceField: string, value: string): AssetReference {
  const classification = classifyReference(value);
  const warnings: SerializationWarning[] = classification.status === 'safe'
    ? []
    : [{
        code: classification.code || 'unsafe_asset_reference',
        message: classification.message || 'Unsafe asset reference.',
        path: sourceField,
        assetId,
        severity: 'warning',
      }];

  return {
    id,
    assetId,
    sourceField,
    originalValue: value,
    relativePath: classification.status === 'safe' ? toRelativeAssetPath(assetId, value, id) : undefined,
    status: classification.status,
    warnings,
  };
}
