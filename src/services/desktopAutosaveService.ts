import { loadProject as loadCachedProject } from '@/persistence';
import { saveProjectToDesktop } from '@/persistence/desktopProjectPersistence';
import { timedAssetSaver } from '@/services/TimedAssetSaver';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useProjectStore } from '@/stores/projectStore';

class DesktopAutosaveService {
  private initialized = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queuedProjectId: string | null = null;
  private isSaving = false;
  private unsubscribers: Array<() => void> = [];
  private debounceMs = 3000;

  initialize(): void {
    if (this.initialized || !this.isDesktop()) {
      return;
    }

    this.initialized = true;

    this.unsubscribers.push(
      useProjectStore.subscribe((state, previous) => {
        if (state.currentProjectId !== previous.currentProjectId || state.projects !== previous.projects) {
          this.schedule(state.currentProjectId);
        }
      }),
      useKanvasStore.subscribe((state, previous) => {
        if (state.currentProjectId !== previous.currentProjectId || state.assets !== previous.assets) {
          this.schedule(state.currentProjectId);
        }
      })
    );
  }

  schedule(projectId: string | null): void {
    if (!this.isDesktop() || !projectId) {
      return;
    }

    this.queuedProjectId = projectId;
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  async flush(projectId = this.queuedProjectId): Promise<void> {
    if (!this.isDesktop() || !projectId) {
      return;
    }

    if (this.isSaving) {
      this.schedule(projectId);
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.isSaving = true;
    this.queuedProjectId = null;

    try {
      await timedAssetSaver.flushAll();
      const bundle = await loadCachedProject(projectId);
      if (!bundle.project) {
        return;
      }

      await saveProjectToDesktop({
        project: bundle.project,
        assets: bundle.assets,
        files: bundle.files,
        projectTags: bundle.projectTags,
        globalTags: bundle.globalTags,
        appVersion: import.meta.env.VITE_APP_VERSION || undefined,
      });
    } catch (error) {
      console.warn('[DesktopAutosave] Failed to save project to disk:', error);
    } finally {
      this.isSaving = false;
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    this.initialized = false;
    this.queuedProjectId = null;
    this.isSaving = false;
  }

  private isDesktop(): boolean {
    return typeof window !== 'undefined' && Boolean(window.kanvasDesktop);
  }
}

export const desktopAutosaveService = new DesktopAutosaveService();
