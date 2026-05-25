import { db, type FileBlob, type GlobalTag, type Project, type ProjectTag } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';
import {
  hydrateProjectFromDisk,
  serializeProjectForDisk,
  type AssetReference,
  type ProjectSerializerInput,
  type SerializedProjectJson,
} from '@/persistence/serializer';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSyncStore } from '@/stores/syncStore';
import { useTagStore } from '@/stores/tagStore';

type DesktopWarning = KanvasDesktopWarning;
type DesktopProjectEntry = KanvasDesktopProjectEntry;

export interface DesktopPersistenceResult {
  folderName: string;
  folderPath?: string;
  warnings: DesktopWarning[];
}

const getDesktopApi = () => {
  if (!window.kanvasDesktop) {
    throw new Error('KANVAS desktop filesystem API is unavailable. Run the app in Electron.');
  }

  return window.kanvasDesktop;
};

export async function ensureDesktopProject(project: Project): Promise<unknown> {
  return await getDesktopApi().ensureProjectStructure({
    projectId: project.id,
    projectName: project.name,
  });
}

export async function saveProjectToDesktop(projectState: ProjectSerializerInput): Promise<DesktopPersistenceResult> {
  const serialized = serializeProjectForDisk(projectState);
  if (serialized.errors.length > 0) {
    throw new Error(serialized.errors.map(error => error.message).join('\n'));
  }

  const result = await getDesktopApi().saveProjectToDisk({
    projectId: serialized.projectJson.projectId,
    projectName: serialized.projectJson.projectName,
    projectJson: serialized.projectJson,
    metadataJson: serialized.metadataJson,
    assetManifest: serialized.assetManifest,
  });

  return {
    folderName: result.folderName,
    folderPath: result.folderPath,
    warnings: [...serialized.warnings.map(warning => ({
      code: warning.code,
      message: warning.message,
      path: warning.path,
    })), ...result.warnings],
  };
}

export async function loadProjectFromDesktop(projectIdOrFolderName: string): Promise<DesktopPersistenceResult> {
  const result = await getDesktopApi().loadProjectFromDisk({
    projectId: projectIdOrFolderName,
    folderName: projectIdOrFolderName,
  });
  const hydrated = hydrateProjectFromDisk(
    result.projectJson as SerializedProjectJson,
    'guest',
    (result.assetManifest as AssetReference[] | undefined) || []
  );

  await hydrateIndexedDBCache(hydrated);
  hydrateRuntimeStores(hydrated);

  return {
    folderName: result.folderName,
    folderPath: result.folderPath,
    warnings: result.warnings,
  };
}

export async function listDesktopProjects(): Promise<DesktopProjectEntry[]> {
  return await getDesktopApi().listProjects();
}

export async function hydrateDesktopProjectsFromDisk(): Promise<void> {
  if (!window.kanvasDesktop) {
    return;
  }

  const entries = await listDesktopProjects();
  for (const entry of entries) {
    try {
      await loadProjectFromDesktop(entry.projectId || entry.folderName);
    } catch (error) {
      console.warn(`[DesktopPersistence] Failed to hydrate ${entry.folderName}:`, error);
    }
  }
}

export async function importAssetToCurrentProject(input: string | File, assetId: string): Promise<{ relativePath: string; filename: string }> {
  const project = useProjectStore.getState().currentProject;
  if (!project) {
    throw new Error('No current project is selected');
  }

  if (typeof input === 'string') {
    return await getDesktopApi().copyAssetIntoProject({
      projectId: project.id,
      projectName: project.name,
      assetId,
      sourcePath: input,
    });
  }

  const bytes = new Uint8Array(await input.arrayBuffer());
  return await getDesktopApi().copyAssetIntoProject({
    projectId: project.id,
    projectName: project.name,
    assetId,
    originalName: input.name,
    bytes,
  });
}

async function hydrateIndexedDBCache(input: {
  project: Project;
  assets: Asset[];
  files: FileBlob[];
  projectTags: ProjectTag[];
  globalTags: GlobalTag[];
}): Promise<void> {
  await db.transaction('rw', db.projects, db.assets, db.files, db.projectTags, db.globalTags, async () => {
    const existingAssets = await db.assets.where('projectId').equals(input.project.id).toArray();
    const existingFiles = await db.files.where('projectId').equals(input.project.id).toArray();
    const existingProjectTags = await db.projectTags.where('projectId').equals(input.project.id).toArray();

    await db.projects.put(input.project);
    await db.assets.bulkDelete(existingAssets.map(asset => asset.id));
    await db.files.bulkDelete(existingFiles.map((file: FileBlob) => file.id));
    await db.projectTags.bulkDelete(existingProjectTags.map(tag => tag.id));

    if (input.assets.length > 0) {
      await db.assets.bulkPut(input.assets);
    }
    if (input.files.length > 0) {
      await db.files.bulkPut(input.files);
    }
    if (input.projectTags.length > 0) {
      await db.projectTags.bulkPut(input.projectTags);
    }
    if (input.globalTags.length > 0) {
      await db.globalTags.bulkPut(input.globalTags as GlobalTag[]);
    }
  });
}

function hydrateRuntimeStores(input: {
  project: Project;
  assets: Asset[];
  files: FileBlob[];
  projectTags: ProjectTag[];
  globalTags: GlobalTag[];
}): void {
  useProjectStore.setState(state => ({
    currentProjectId: input.project.id,
    projects: new Map(state.projects).set(input.project.id, input.project),
    isLoading: false,
    error: null,
  }));
  useKanvasStore.getState().setAssets(input.assets);
  useKanvasStore.getState().setCurrentProjectId(input.project.id);
  useAssetStore.getState().setAssets(input.assets);
  useTagStore.getState().hydrateTags(input.projectTags, input.globalTags, input.project.id, input.project.userId);
  useBookStore.getState().hydrateBooks(Array.from(useProjectStore.getState().projects.values()));
  useBookStore.getState().setCurrentBook(input.project.id);
  void useSyncStore.getState().loadSyncQueue(input.project.id);
}
