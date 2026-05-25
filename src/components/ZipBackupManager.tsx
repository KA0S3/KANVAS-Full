import { useEffect, useMemo, useState } from 'react';
import { Archive, Download, FolderOpen, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { loadProject as loadCachedProject } from '@/persistence';
import { loadProjectFromDesktop, saveProjectToDesktop } from '@/persistence/desktopProjectPersistence';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useProjectStore } from '@/stores/projectStore';
import { useSyncStore } from '@/stores/syncStore';

interface ZipBackupManagerProps {
  children: React.ReactNode;
}

type ExportScope = 'library' | 'project';
type ImportKind = 'zip' | 'folder';

interface PendingConflict {
  kind: ImportKind;
  sourcePath: string;
  conflicts: KanvasDesktopImportConflict[];
}

export function ZipBackupManager({ children }: ZipBackupManagerProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('library');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const projectsMap = useProjectStore(state => state.projects);
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const setCurrentBook = useBookStore(state => state.setCurrentBook);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.kanvasDesktop);

  const sortedProjects = useMemo(
    () => Array.from(projectsMap.values())
      .filter(project => !project.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap]
  );

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedProjectId(currentProjectId || sortedProjects[0]?.id || '');
    }
  }, [currentProjectId, selectedProjectId, sortedProjects]);

  const saveProjectForExport = async (projectId: string) => {
    const bundle = await loadCachedProject(projectId);
    if (!bundle.project) {
      throw new Error(`Project ${projectId} is not available in local storage.`);
    }

    await saveProjectToDesktop({
      project: bundle.project,
      assets: bundle.assets,
      files: bundle.files,
      projectTags: bundle.projectTags,
      globalTags: bundle.globalTags,
      appVersion: import.meta.env.VITE_APP_VERSION || undefined,
    });

    return bundle.project;
  };

  const restoreCurrentProject = async (projectId: string | null) => {
    if (!projectId) {
      return;
    }

    await useProjectStore.getState().loadProjectBundle(projectId);
    setCurrentBook(projectId);
    await useSyncStore.getState().loadSyncQueue(projectId);
  };

  const hydrateImportedProjects = async (result: KanvasDesktopImportResult, previousProjectId: string | null) => {
    if (result.canceled || result.needsConflictResolution) {
      return;
    }

    const imported = result.imported || [];
    let warningCount = 0;
    for (const project of imported) {
      if (!project.folderName) {
        continue;
      }
      const loaded = await loadProjectFromDesktop(project.folderName);
      warningCount += (project.warnings?.length || 0) + loaded.warnings.length;
    }

    if (previousProjectId && imported.length > 0) {
      await restoreCurrentProject(previousProjectId);
    }

    toast.success(
      warningCount > 0
        ? `Imported ${imported.length} project(s) with ${warningCount} warning(s).`
        : `Imported ${imported.length} project(s).`
    );
  };

  const handleExport = async () => {
    if (!window.kanvasDesktop) {
      toast.error('ZIP backup uses the Electron desktop filesystem API.');
      return;
    }

    setBusy(true);
    try {
      if (exportScope === 'project') {
        if (!selectedProjectId) {
          throw new Error('Select a project to export.');
        }
        const project = await saveProjectForExport(selectedProjectId);
        const result = await window.kanvasDesktop.exportProjectZip({
          projectId: project.id,
          projectName: project.name,
        });
        if (!result.canceled) {
          toast.success(`Exported ${project.name} as a ZIP backup.`);
        }
        return;
      }

      for (const project of sortedProjects) {
        await saveProjectForExport(project.id);
      }
      const result = await window.kanvasDesktop.exportLibraryZip();
      if (!result.canceled) {
        toast.success('Exported the full library as a ZIP backup.');
      }
    } catch (error) {
      toast.error(`ZIP export failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const beginImport = async (kind: ImportKind) => {
    if (!window.kanvasDesktop) {
      toast.error('ZIP import uses the Electron desktop filesystem API.');
      return;
    }

    setBusy(true);
    const previousProjectId = useProjectStore.getState().currentProjectId;
    try {
      const result = kind === 'zip'
        ? await window.kanvasDesktop.importProjectZip()
        : await window.kanvasDesktop.openProjectFolder();

      if (result.needsConflictResolution && result.sourcePath && result.conflicts) {
        setPendingConflict({ kind, sourcePath: result.sourcePath, conflicts: result.conflicts });
        return;
      }

      await hydrateImportedProjects(result, previousProjectId);
    } catch (error) {
      toast.error(`Import failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = async (conflictAction: KanvasDesktopConflictAction) => {
    if (!window.kanvasDesktop || !pendingConflict) {
      return;
    }

    setBusy(true);
    const previousProjectId = useProjectStore.getState().currentProjectId;
    try {
      const result = pendingConflict.kind === 'zip'
        ? await window.kanvasDesktop.importProjectZip({ sourcePath: pendingConflict.sourcePath, conflictAction })
        : await window.kanvasDesktop.openProjectFolder({ sourcePath: pendingConflict.sourcePath, conflictAction });

      setPendingConflict(null);
      if (conflictAction !== 'cancel') {
        await hydrateImportedProjects(result, previousProjectId);
      }
    } catch (error) {
      toast.error(`Import failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="max-w-xl glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              ZIP Backup
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="export" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="export">Export ZIP</TabsTrigger>
              <TabsTrigger value="zip">Import ZIP</TabsTrigger>
              <TabsTrigger value="folder">Import Folder</TabsTrigger>
            </TabsList>

            <TabsContent value="export" className="space-y-4">
              {!isDesktop && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Desktop filesystem actions are unavailable in web preview.
                </div>
              )}

              <div className="space-y-2">
                <Label>Export</Label>
                <Select value={exportScope} onValueChange={(value) => setExportScope(value as ExportScope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="library">Entire Library</SelectItem>
                    <SelectItem value="project">Selected Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {exportScope === 'project' && (
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedProjects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleExport} disabled={busy || sortedProjects.length === 0} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Export ZIP
              </Button>
            </TabsContent>

            <TabsContent value="zip" className="space-y-4">
              <Button onClick={() => beginImport('zip')} disabled={busy} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Import ZIP
              </Button>
            </TabsContent>

            <TabsContent value="folder" className="space-y-4">
              <Button onClick={() => beginImport('folder')} disabled={busy} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2" />}
                Import Project Folder
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingConflict)} onOpenChange={(nextOpen) => !nextOpen && setPendingConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Project already exists</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConflict?.conflicts.length === 1
                ? `${pendingConflict.conflicts[0].incomingProjectName || pendingConflict.conflicts[0].incomingFolderName} conflicts with an existing project.`
                : `${pendingConflict?.conflicts.length || 0} imported projects conflict with existing projects.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConflict('cancel')}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveConflict('keep_both')}>Keep Both</AlertDialogAction>
            <AlertDialogAction onClick={() => resolveConflict('replace')}>Replace Existing</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
