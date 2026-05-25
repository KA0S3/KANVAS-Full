import type { Asset } from '@/types/Asset';
import type { FileBlob, GlobalTag, Project, ProjectTag } from '@/storage/indexeddb';

export const PROJECT_SCHEMA_VERSION = 1 as const;
export const SERIALIZER_VERSION = 1 as const;

export type SerializationSeverity = 'warning' | 'error';

export interface SerializationWarning {
  code: string;
  message: string;
  path?: string;
  assetId?: string;
  severity: SerializationSeverity;
}

export interface SerializationError {
  code: string;
  message: string;
  path?: string;
  assetId?: string;
}

export interface ProjectSerializerInput {
  project: Project;
  assets: Asset[] | Map<string, Asset>;
  files?: FileBlob[];
  projectTags?: ProjectTag[];
  globalTags?: GlobalTag[];
  appVersion?: string;
}

export interface CleanProjectState {
  project: Project;
  assets: Asset[];
  files: FileBlob[];
  projectTags: ProjectTag[];
  globalTags: GlobalTag[];
  appVersion?: string;
  warnings: SerializationWarning[];
}

export interface NormalizedProject {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  settings: Record<string, unknown>;
  canvases: SerializedCanvas[];
  assets: SerializedAsset[];
  tags: SerializedTag[];
  files: FileBlob[];
  warnings: SerializationWarning[];
}

export interface SerializedCanvas {
  id: string;
  rootAssetIds: string[];
}

export interface SerializedAsset {
  id: string;
  projectId: string;
  parentId?: string;
  layout: Asset['layout'];
  content: {
    title?: string;
    description?: string;
    text?: string;
    imageRef?: string;
    customFields?: Record<string, unknown>;
  };
  style: Record<string, unknown>;
  behavior: Asset['behavior'];
  metadata: Asset['metadata'];
}

export interface SerializedTag {
  id: string;
  projectId?: string;
  name: string;
  color?: string;
  scope: 'project' | 'global';
  createdAt: string;
  updatedAt: string;
}

export interface AssetReference {
  id: string;
  assetId?: string;
  sourceField: string;
  originalValue?: string;
  relativePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  status: 'safe' | 'unsafe' | 'missing' | 'external';
  warnings: SerializationWarning[];
}

export interface SerializedProjectJson {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  settings: Record<string, unknown>;
  canvases: SerializedCanvas[];
  assets: SerializedAsset[];
  tags: SerializedTag[];
}

export interface ProjectMetadata {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  serializerVersion: typeof SERIALIZER_VERSION;
  assetCount: number;
  fileReferenceCount: number;
  warningCount: number;
  folderLayout: {
    project: 'project.kanvas.json';
    metadata: 'metadata.json';
    assetManifest: 'asset-manifest.json';
    assets: 'assets/';
    indexes: 'indexes/';
  };
}

export interface SerializedProject {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectJson: SerializedProjectJson;
  metadataJson: ProjectMetadata;
  assetManifest: AssetReference[];
  warnings: SerializationWarning[];
  errors: SerializationError[];
  projectJsonString: string;
  metadataJsonString: string;
  assetManifestJsonString: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: SerializationError[];
  warnings: SerializationWarning[];
}
