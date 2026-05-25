/**
 * PROJECT SERVICE - Canonical project orchestration
 *
 * This service centralizes project load and runtime coordination.
 * It keeps project state in sync with the canonical persistence layer
 * and the asset runtime store.
 */

import { projectPersistence } from '@/persistence/projects';
import { assetPersistence } from '@/persistence/assets';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSyncStore } from '@/stores/syncStore';
import type { Project } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';

export class ProjectService {
  async loadProject(projectId: string): Promise<Project> {
    const project = await projectPersistence.get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const assets = await assetPersistence.getProjectAssets(projectId);

    useProjectStore.getState().setCurrentProject(projectId);
    useKanvasStore.getState().setCurrentProjectId(projectId);
    useKanvasStore.getState().setAssets(assets);
    await useSyncStore.getState().loadSyncQueue(projectId);

    return project;
  }

  async clearCurrentProject(): Promise<void> {
    useProjectStore.getState().setCurrentProject(null);
    useKanvasStore.getState().clearProject();
    useKanvasStore.getState().setCurrentProjectId(null);
    useSyncStore.getState().clearSyncQueue();
    await useSyncStore.getState().clearSyncQueueDB();
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return await projectPersistence.get(projectId);
  }

  async getProjectAssets(projectId: string): Promise<Asset[]> {
    return await assetPersistence.getProjectAssets(projectId);
  }
}

export const projectService = new ProjectService();
