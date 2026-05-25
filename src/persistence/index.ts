import { assetPersistence } from '@/persistence/assets';
import { projectPersistence } from '@/persistence/projects';
import { db, type FileBlob, type GlobalTag, type Project, type ProjectTag } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';
import { exportProject as serializeProject } from '@/persistence/serializer';
import type { SerializedProject } from '@/persistence/serializer';

export interface LoadProjectOptions {
  userId?: string;
}

export interface LoadedProjectBundle {
  project: Project | undefined;
  assets: Asset[];
  projectTags: ProjectTag[];
  globalTags: GlobalTag[];
  files: FileBlob[];
}

export interface SaveProjectInput extends Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> {
  settings?: Project['settings'];
}

const logPersistence = (operation: string, backend: string): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(`[Persistence] ${operation} via ${backend}`);
};

export async function createProject(
  projectData: Omit<Project, 'createdAt' | 'updatedAt' | 'version'> &
    Partial<Pick<Project, 'id' | 'createdAt' | 'updatedAt' | 'version'>>
): Promise<Project> {
  logPersistence('createProject', 'IndexedDB');

  const now = new Date().toISOString();
  const project: Project = {
    id: projectData.id || crypto.randomUUID(),
    userId: projectData.userId,
    name: projectData.name,
    description: projectData.description,
    settings: projectData.settings || {},
    version: projectData.version || 1,
    createdAt: projectData.createdAt || now,
    updatedAt: projectData.updatedAt || now,
    lastSyncAt: projectData.lastSyncAt,
    deletedAt: projectData.deletedAt,
  };

  await db.projects.put(project);

  const persistedProject = await db.getProject(project.id);
  if (!persistedProject) {
    throw new Error(`Project ${project.id} was not readable after IndexedDB write`);
  }

  return persistedProject;
}

export async function saveProject(projectId: string, updates: SaveProjectInput): Promise<Project> {
  logPersistence('saveProject', 'IndexedDB');

  const currentProject = await projectPersistence.get(projectId);
  if (!currentProject) {
    throw new Error(`Project ${projectId} not found`);
  }

  const mergedProject: Project = {
    ...currentProject,
    ...updates,
    settings: {
      ...currentProject.settings,
      ...(updates.settings || {}),
    },
    updatedAt: new Date().toISOString(),
    version: (currentProject.version || 0) + 1,
  };

  await db.updateProject(mergedProject);

  const persistedProject = await projectPersistence.get(projectId);
  if (!persistedProject) {
    throw new Error(`Project ${projectId} was not readable after save`);
  }

  return persistedProject;
}

export async function loadProject(projectId: string, options: LoadProjectOptions = {}): Promise<LoadedProjectBundle> {
  logPersistence('loadProject', 'IndexedDB');

  return await db.loadProjectBundle(projectId, options.userId);
}

export async function autosaveProject(data: unknown): Promise<void> {
  logPersistence('autosaveProject', 'localStorage');

  // TODO: Replace this browser-only backup path with filesystem/project-folder autosave during Electron work.
  localStorage.setItem('autosave-backup', JSON.stringify(data));
}

export async function exportProject(projectId: string): Promise<unknown> {
  logPersistence('exportProject', 'IndexedDB');
  return await projectPersistence.exportProject(projectId);
}

export async function serializeProjectForInspection(projectId: string, options: LoadProjectOptions = {}): Promise<SerializedProject> {
  logPersistence('serializeProjectForInspection', 'serializer');

  const bundle = await loadProject(projectId, options);
  if (!bundle.project) {
    throw new Error(`Project ${projectId} not found`);
  }

  return serializeProject({
    project: bundle.project,
    assets: bundle.assets,
    files: bundle.files,
    projectTags: bundle.projectTags,
    globalTags: bundle.globalTags,
    appVersion: import.meta.env.VITE_APP_VERSION || undefined,
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  logPersistence('deleteProject', 'IndexedDB');
  await projectPersistence.delete(projectId);
}

export async function listProjects(userId: string): Promise<Project[]> {
  logPersistence('listProjects', 'IndexedDB');

  const projects = await projectPersistence.getUserProjects(userId);
  if (projects.length > 0) {
    return projects;
  }

  return await db.getAllProjects();
}
