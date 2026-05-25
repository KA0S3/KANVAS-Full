import type { Asset } from '@/types/Asset';
import type { GlobalTag, Project, ProjectTag, FileBlob } from '@/storage/indexeddb';
import { exportProject } from './exportProject';
import { PROJECT_SCHEMA_VERSION, type AssetReference, type ProjectSerializerInput, type SerializedProjectJson } from './types';

export const serializeProjectForDisk = (projectState: ProjectSerializerInput) => exportProject(projectState);

export interface HydratedDiskProject {
  project: Project;
  assets: Asset[];
  projectTags: ProjectTag[];
  globalTags: GlobalTag[];
  files: FileBlob[];
}

export function hydrateProjectFromDisk(
  projectJson: SerializedProjectJson,
  userId = 'guest',
  assetManifest?: AssetReference[]
): HydratedDiskProject {
  if (!projectJson || projectJson.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error('Project file is missing a supported schemaVersion');
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: projectJson.projectId,
    userId,
    name: projectJson.projectName,
    description: projectJson.description,
    settings: projectJson.settings || {},
    version: 1,
    createdAt: projectJson.createdAt || now,
    updatedAt: projectJson.updatedAt || now,
  };

  const assets: Asset[] = projectJson.assets.map(asset => ({
    id: asset.id,
    projectId: asset.projectId,
    parentId: asset.parentId,
    layout: asset.layout,
    content: {
      title: asset.content.title,
      description: asset.content.description,
      text: asset.content.text,
      imageUrl: asset.content.imageRef,
      customFields: asset.content.customFields,
    },
    style: asset.style,
    behavior: asset.behavior,
    metadata: asset.metadata,
  }));

  const projectTags: ProjectTag[] = projectJson.tags
    .filter(tag => tag.scope === 'project')
    .map(tag => ({
      id: tag.id,
      projectId: tag.projectId || projectJson.projectId,
      name: tag.name,
      color: tag.color,
      scope: 'project',
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }));

  const globalTags: GlobalTag[] = projectJson.tags
    .filter(tag => tag.scope === 'global')
    .map(tag => ({
      id: tag.id,
      userId,
      name: tag.name,
      color: tag.color,
      scope: 'global',
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }));

  const files: FileBlob[] = (assetManifest || [])
    .filter(
      reference =>
        reference.sourceField === 'files.storageKey' &&
        reference.status === 'safe' &&
        reference.assetId &&
        reference.relativePath
    )
    .map(reference => ({
      id: reference.id,
      projectId: project.id,
      assetId: reference.assetId,
      storageKey: reference.relativePath!,
      mimeType: reference.mimeType,
      sizeBytes: reference.sizeBytes,
      createdAt: now,
    }));

  return { project, assets, projectTags, globalTags, files };
}
