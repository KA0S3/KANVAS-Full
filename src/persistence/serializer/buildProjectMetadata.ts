import type { AssetReference, NormalizedProject, ProjectMetadata } from './types';
import { PROJECT_SCHEMA_VERSION, SERIALIZER_VERSION } from './types';

export function buildProjectMetadata(projectState: NormalizedProject, assetReferences: AssetReference[] = []): ProjectMetadata {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: projectState.projectId,
    projectName: projectState.projectName,
    createdAt: projectState.createdAt,
    updatedAt: projectState.updatedAt,
    appVersion: projectState.appVersion,
    serializerVersion: SERIALIZER_VERSION,
    assetCount: projectState.assets.length,
    fileReferenceCount: assetReferences.length,
    warningCount: projectState.warnings.length + assetReferences.reduce((count, ref) => count + ref.warnings.length, 0),
    folderLayout: {
      project: 'project.kanvas.json',
      metadata: 'metadata.json',
      assetManifest: 'asset-manifest.json',
      assets: 'assets/',
      indexes: 'indexes/',
    },
  };
}
