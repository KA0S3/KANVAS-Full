/**
 * PROJECT STORE - local-first project metadata and hydration
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createProject as createProjectEntry, deleteProject as deleteProjectEntry, listProjects, loadProject, saveProject } from '@/persistence';
import type { Project } from '@/storage/indexeddb';
import { useKanvasStore } from './kanvasStore';
import { useTagStore } from './tagStore';
import { useAssetStore } from './assetStore';
import { handleError } from '@/utils/errorHandling';

export interface ProjectStore {
  projects: Map<string, Project>;
  currentProjectId: string | null;
  isLoading: boolean;
  error: string | null;

  currentProject: Project | null;
  userProjects: Project[];

  loadProjects: (userId?: string) => Promise<void>;
  createProject: (project: Omit<Project, 'createdAt' | 'updatedAt' | 'version'> & { id?: string }) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (id: string | null) => Promise<void>;
  loadProjectBundle: (projectId: string, userId?: string) => Promise<void>;
  clearError: () => void;
}

const DEFAULT_USER_ID = 'guest';

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: new Map(),
      currentProjectId: null,
      isLoading: false,
      error: null,

      get currentProject() {
        const { currentProjectId, projects } = get();
        return currentProjectId ? projects.get(currentProjectId) || null : null;
      },

      get userProjects() {
        return Array.from(get().projects.values()).filter(project => !project.deletedAt);
      },

      loadProjects: async (userId = DEFAULT_USER_ID) => {
        set({ isLoading: true, error: null });

        try {
          const projects = await listProjects(userId);
          set({
            projects: new Map(projects.map(project => [project.id, project])),
            isLoading: false,
          });
        } catch (error) {
          const message = `Failed to load projects: ${(error as Error).message}`;
          set({ error: message, isLoading: false });
          await handleError(error as Error, 'loadProjects', 'ProjectStore');
        }
      },

      createProject: async (projectData) => {
        set({ isLoading: true, error: null });

        try {
          const persistedProject = await createProjectEntry({
            ...projectData,
            userId: projectData.userId || DEFAULT_USER_ID,
          });

          set(state => ({
            projects: new Map(state.projects).set(persistedProject.id, persistedProject),
            isLoading: false,
          }));

          await get().setCurrentProject(persistedProject.id);
          return persistedProject.id;
        } catch (error) {
          const message = `Failed to create project: ${(error as Error).message}`;
          set({ error: message, isLoading: false });
          await handleError(error as Error, 'createProject', 'ProjectStore');
          throw error;
        }
      },

      updateProject: async (id, updates) => {
        set({ isLoading: true, error: null });

        try {
          const updatedProject = await saveProject(id, updates);

          set(state => ({
            projects: new Map(state.projects).set(id, updatedProject),
            isLoading: false,
          }));
        } catch (error) {
          const message = `Failed to update project: ${(error as Error).message}`;
          set({ error: message, isLoading: false });
          await handleError(error as Error, 'updateProject', 'ProjectStore');
          throw error;
        }
      },

      deleteProject: async (id) => {
        set({ isLoading: true, error: null });

        try {
          await deleteProjectEntry(id);

          if (get().currentProjectId === id) {
            await get().setCurrentProject(null);
          }

          set(state => {
            const projects = new Map(state.projects);
            projects.delete(id);
            return {
              projects,
              isLoading: false,
            };
          });
        } catch (error) {
          const message = `Failed to delete project: ${(error as Error).message}`;
          set({ error: message, isLoading: false });
          await handleError(error as Error, 'deleteProject', 'ProjectStore');
          throw error;
        }
      },

      setCurrentProject: async (id) => {
        if (id) {
          localStorage.setItem('currentProjectId', id);
        } else {
          localStorage.removeItem('currentProjectId');
        }
        set({ currentProjectId: id || null });

        if (!id) {
          useKanvasStore.getState().clearProject();
          useAssetStore.getState().clearAssets();
          useTagStore.getState().clearTags();
          return;
        }

        await get().loadProjectBundle(id);
      },

      loadProjectBundle: async (projectId, userId = DEFAULT_USER_ID) => {
        try {
          const bundle = await loadProject(projectId, { userId });
          if (!bundle.project) {
            throw new Error(`Project ${projectId} not found`);
          }

          const resolvedUserId = bundle.project.userId || userId;

          useTagStore.getState().hydrateTags(bundle.projectTags, bundle.globalTags, projectId, resolvedUserId);
          useKanvasStore.getState().setAssets(bundle.assets);
          useKanvasStore.getState().setCurrentProjectId(projectId);
          useAssetStore.getState().setAssets(bundle.assets);

          set(state => ({
            currentProjectId: projectId,
            projects: new Map(state.projects).set(projectId, bundle.project!),
          }));
        } catch (error) {
          await handleError(error as Error, 'loadProjectBundle', 'ProjectStore');
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'kanvas-project-store',
      partialize: state => ({
        currentProjectId: state.currentProjectId,
      }),
    }
  )
);

export const selectCurrentProject = (state: ProjectStore) => state.currentProject;
export const selectUserProjects = (state: ProjectStore) => state.userProjects;
export const selectProjectById = (id: string) => (state: ProjectStore) => state.projects.get(id);

export const projectActions = {
  loadProjects: (userId?: string) => useProjectStore.getState().loadProjects(userId),
  createProject: (data: Omit<Project, 'createdAt' | 'updatedAt' | 'version'> & { id?: string }) =>
    useProjectStore.getState().createProject(data),
  updateProject: (id: string, updates: Partial<Project>) =>
    useProjectStore.getState().updateProject(id, updates),
  deleteProject: (id: string) => useProjectStore.getState().deleteProject(id),
  setCurrentProject: (id: string | null) => useProjectStore.getState().setCurrentProject(id),
};
