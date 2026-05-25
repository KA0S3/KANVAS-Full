import type { ProjectSerializerInput, SerializedProject, SerializedProjectJson } from './types';
import { PROJECT_SCHEMA_VERSION } from './types';
import { stripTransientState } from './stripTransientState';
import { normalizeProject } from './normalizeProject';
import { collectAssetReferences } from './collectAssetReferences';
import { buildProjectMetadata } from './buildProjectMetadata';
import { validateSerializedProject } from './validateSerializedProject';
import { stableStringify } from './stableJson';

export function exportProject(projectState: ProjectSerializerInput): SerializedProject {
  const clean = stripTransientState(projectState);
  const normalized = normalizeProject(clean);
  const assetManifest = collectAssetReferences(clean);

  const projectJson: SerializedProjectJson = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: normalized.projectId,
    projectName: normalized.projectName,
    description: normalized.description,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    appVersion: normalized.appVersion,
    settings: normalized.settings,
    canvases: normalized.canvases,
    assets: normalized.assets,
    tags: normalized.tags,
  };

  const manifestWarnings = assetManifest.flatMap(reference => reference.warnings);
  const metadataJson = buildProjectMetadata({ ...normalized, warnings: [...normalized.warnings, ...manifestWarnings] }, assetManifest);
  const validation = validateSerializedProject({ projectJson, metadataJson, assetManifest });

  const warnings = [...normalized.warnings, ...manifestWarnings, ...validation.warnings];

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectJson,
    metadataJson,
    assetManifest,
    warnings,
    errors: validation.errors,
    projectJsonString: stableStringify(projectJson),
    metadataJsonString: stableStringify(metadataJson),
    assetManifestJsonString: stableStringify(assetManifest),
  };
}
