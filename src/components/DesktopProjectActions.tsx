import { useEffect, useState } from 'react';
import { FolderOpen, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadProject as loadCachedProject } from '@/persistence';
import { listDesktopProjects, loadProjectFromDesktop, saveProjectToDesktop } from '@/persistence/desktopProjectPersistence';
import { useProjectStore } from '@/stores/projectStore';

export function DesktopProjectActions() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<KanvasDesktopProjectEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const currentProject = useProjectStore(state => state.currentProjectId ? state.projects.get(state.currentProjectId) || null : null);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.kanvasDesktop);

  useEffect(() => {
    if (!open || !isDesktop) {
      return;
    }

    void refreshProjects();
  }, [open, isDesktop]);

  if (!isDesktop) {
    return null;
  }

  const refreshProjects = async () => {
    try {
      setProjects(await listDesktopProjects());
    } catch (error) {
      toast.error(`Failed to list desktop projects: ${(error as Error).message}`);
    }
  };

  const handleSave = async () => {
    if (!currentProjectId) {
      toast.error('Select a project before saving.');
      return;
    }

    setBusy(true);
    try {
      const bundle = await loadCachedProject(currentProjectId);
      if (!bundle.project) {
        throw new Error(`Project ${currentProjectId} is not in IndexedDB`);
      }

      const result = await saveProjectToDesktop({
        project: bundle.project,
        assets: bundle.assets,
        files: bundle.files,
        projectTags: bundle.projectTags,
        globalTags: bundle.globalTags,
        appVersion: import.meta.env.VITE_APP_VERSION || undefined,
      });

      if (result.warnings.length > 0) {
        toast.warning(`Saved with ${result.warnings.length} warning(s).`);
      } else {
        toast.success(`Saved ${bundle.project.name} to Documents/KANVAS/Projects.`);
      }
      await refreshProjects();
    } catch (error) {
      toast.error(`Desktop save failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (entry: KanvasDesktopProjectEntry) => {
    setBusy(true);
    try {
      const result = await loadProjectFromDesktop(entry.projectId || entry.folderName);
      if (result.warnings.length > 0) {
        toast.warning(`Loaded with ${result.warnings.length} warning(s).`);
      } else {
        toast.success(`Loaded ${entry.projectName || entry.folderName}.`);
      }
      setOpen(false);
    } catch (error) {
      toast.error(`Desktop load failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={busy || !currentProject} size="sm">
          <Save className="w-4 h-4 mr-2" />
          Save Project
        </Button>
        <Button onClick={() => setOpen(true)} disabled={busy} variant="outline" size="sm">
          <FolderOpen className="w-4 h-4 mr-2" />
          Load Project
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Load Desktop Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved desktop projects found.</p>
            ) : projects.map(project => (
              <Button
                key={project.folderName}
                variant="outline"
                className="w-full justify-start h-auto py-3"
                disabled={busy || !project.projectId}
                onClick={() => handleLoad(project)}
              >
                <span className="flex flex-col items-start">
                  <span>{project.projectName || project.folderName}</span>
                  <span className="text-xs text-muted-foreground">{project.folderName}</span>
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
