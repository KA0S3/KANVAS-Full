/**
 * PROJECT STORE - Project Management
 * 
 * Handles project operations and state management.
 * Integrates with other stores for coordinated operations.
 * 
 * 🔒 CRITICAL: Must maintain data consistency across stores
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '@/storage/indexeddb';
import { supabaseStorage } from '@/storage/supabase';
import { useKanvasStore } from './kanvasStore';
import { useSyncStore } from './syncStore';
import { handleError } from '@/utils/errorHandling';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  settings: {
    backgrounds?: any;
    tagsConfig?: any;
    viewport?: { x: number; y: number; zoom: number };
  };
  version: number;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ProjectStore {
  // State
  projects: Map<string, Project>;
  currentProjectId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Computed
  currentProject: Project | null;
  userProjects: Project[];
  
  // Actions
  loadProjects: () => Promise<void>;
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (id: string | null) => Promise<void>;
  syncProject: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      // Initial state
      projects: new Map(),
      currentProjectId: null,
      isLoading: false,
      error: null,

      // Computed getters
      get currentProject() {
        const { currentProjectId, projects } = get();
        return currentProjectId ? projects.get(currentProjectId) || null : null;
      },

      get userProjects() {
        const { projects } = get();
        return Array.from(projects.values()).filter(p => !p.deletedAt);
      },

      // Load all projects for current user
      loadProjects: async () => {
        set({ isLoading: true, error: null });
        
        try {
          // Try local first
          const userId = 'current-user'; // TODO: Get actual user ID from auth
          const localProjects = await db.getUserProjects(userId);
          const projectsMap = new Map(localProjects.map(p => [p.id, p]));
          
          set({ 
            projects: projectsMap, 
            isLoading: false 
          });

          // Then refresh from cloud in background
          this.refreshProjects();
          
        } catch (error) {
          const errorMessage = `Failed to load projects: ${(error as Error).message}`;
          set({ error: errorMessage, isLoading: false });
          
          await handleError(
            error as Error,
            'loadProjects',
            'ProjectStore'
          );
        }
      },

      // Create new project
      createProject: async (projectData) => {
        set({ isLoading: true, error: null });
        
        try {
          const project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
            ...projectData,
            userId: 'current-user', // TODO: Get actual user ID
            version: 1,
          };

          // Create locally first
          const projectId = await db.createProject(project);
          
          // Create in cloud
          await supabaseStorage.createProject({
            ...project,
            id: projectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Update local state
          const newProject: Project = {
            ...project,
            id: projectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          set(state => ({
            projects: new Map(state.projects).set(projectId, newProject),
            isLoading: false,
          }));

          // Set as current project
          await get().setCurrentProject(projectId);
          
          return projectId;

        } catch (error) {
          const errorMessage = `Failed to create project: ${(error as Error).message}`;
          set({ error: errorMessage, isLoading: false });
          
          await handleError(
            error as Error,
            'createProject',
            'ProjectStore'
          );
          
          throw error;
        }
      },

      // Update existing project
      updateProject: async (id, updates) => {
        set({ isLoading: true, error: null });
        
        try {
          const currentProject = get().projects.get(id);
          if (!currentProject) {
            throw new Error(`Project ${id} not found`);
          }

          const updatedProject: Project = {
            ...currentProject,
            ...updates,
            updatedAt: new Date().toISOString(),
            version: (currentProject.version || 0) + 1,
          };

          // Update locally
          await db.updateProject(updatedProject);
          
          // Update in cloud
          await supabaseStorage.updateProject(updatedProject);

          // Update state
          set(state => ({
            projects: new Map(state.projects).set(id, updatedProject),
            isLoading: false,
          }));

        } catch (error) {
          const errorMessage = `Failed to update project: ${(error as Error).message}`;
          set({ error: errorMessage, isLoading: false });
          
          await handleError(
            error as Error,
            'updateProject',
            'ProjectStore'
          );
          
          throw error;
        }
      },

      // Delete project
      deleteProject: async (id) => {
        set({ isLoading: true, error: null });
        
        try {
          // Clear current project if it's being deleted
          const { currentProjectId } = get();
          if (currentProjectId === id) {
            await get().setCurrentProject(null);
          }

          // Clear assets from Kanvas store
          useKanvasStore.getState().clearProject();

          // Delete locally
          await db.deleteProject(id); // TODO: Implement deleteProject in IndexedDB
          
          // Delete in cloud
          await supabaseStorage.deleteProject(id); // TODO: Implement deleteProject in Supabase

          // Update state
          set(state => {
            const newProjects = new Map(state.projects);
            newProjects.delete(id);
            return {
              projects: newProjects,
              isLoading: false,
            };
          });

        } catch (error) {
          const errorMessage = `Failed to delete project: ${(error as Error).message}`;
          set({ error: errorMessage, isLoading: false });
          
          await handleError(
            error as Error,
            'deleteProject',
            'ProjectStore'
          );
          
          throw error;
        }
      },

      // Set current project
      setCurrentProject: async (id) => {
        try {
          // Save to localStorage for persistence
          if (id) {
            localStorage.setItem('currentProjectId', id);
          } else {
            localStorage.removeItem('currentProjectId');
          }

          // Load project assets if switching project
          if (id && id !== get().currentProjectId) {
            await useKanvasStore.getState().loadProject(id);
          }

          set({ currentProjectId: id });

        } catch (error) {
          await handleError(
            error as Error,
            'setCurrentProject',
            'ProjectStore'
          );
        }
      },

      // Sync project with cloud
      syncProject: async (id) => {
        try {
          const project = get().projects.get(id);
          if (!project) {
            throw new Error(`Project ${id} not found`);
          }

          // Sync project metadata
          await supabaseStorage.updateProject(project);

          // Trigger asset sync
          await useSyncStore.getState().loadSyncQueue(id);

          // Update last sync time
          const updatedProject: Project = {
            ...project,
            lastSyncAt: new Date().toISOString(),
          };

          set(state => ({
            projects: new Map(state.projects).set(id, updatedProject),
          }));

        } catch (error) {
          await handleError(
            error as Error,
            'syncProject',
            'ProjectStore'
          );
        }
      },

      // Refresh projects from cloud
      refreshProjects: async () => {
        try {
          const userId = 'current-user'; // TODO: Get actual user ID from auth
          const cloudProjects = await supabaseStorage.getUserProjects(userId);
          const projectsMap = new Map(cloudProjects.map(p => [p.id, p]));
          
          set({ projects: projectsMap });

        } catch (error) {
          console.warn('Failed to refresh projects from cloud:', error);
          // Don't show error to user for background refresh
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'kanvas-project-store',
      partialize: (state) => ({
        projects: Array.from(state.projects.entries()),
        currentProjectId: state.currentProjectId,
      }),
    }
  )
);

// Selectors for derived state
export const selectCurrentProject = (state: ProjectStore) => state.currentProject;
export const selectUserProjects = (state: ProjectStore) => state.userProjects;
export const selectProjectById = (id: string) => (state: ProjectStore) => 
  state.projects.get(id);

// Actions for external usage
export const projectActions = {
  loadProjects: () => useProjectStore.getState().loadProjects(),
  createProject: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => 
    useProjectStore.getState().createProject(data),
  updateProject: (id: string, updates: Partial<Project>) => 
    useProjectStore.getState().updateProject(id, updates),
  deleteProject: (id: string) => useProjectStore.getState().deleteProject(id),
  setCurrentProject: (id: string | null) => 
    useProjectStore.getState().setCurrentProject(id),
  syncProject: (id: string) => useProjectStore.getState().syncProject(id),
};
