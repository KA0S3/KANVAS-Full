import { listProjects } from '@/persistence';
import { hydrateDesktopProjectsFromDisk } from '@/persistence/desktopProjectPersistence';
import type { Project } from '@/storage/indexeddb';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useProjectStore } from '@/stores/projectStore';
import { useSyncStore } from '@/stores/syncStore';

const getStoredCurrentProjectId = () => {
  try {
    return localStorage.getItem('currentProjectId');
  } catch {
    return null;
  }
};

const chooseProjectToRestore = (projects: Project[], preferredProjectId?: string | null) => {
  const validProjectIds = new Set(projects.map(project => project.id));
  const candidates = [
    preferredProjectId,
    useProjectStore.getState().currentProjectId,
    useBookStore.getState().currentBookId,
    getStoredCurrentProjectId(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (validProjectIds.has(candidate)) {
      return candidate;
    }
  }

  const staleCandidate = candidates.find(candidate => !validProjectIds.has(candidate));
  if (staleCandidate) {
    console.warn(`[StartupHydration] Ignoring stale currentProjectId "${staleCandidate}" because it is not present in IndexedDB.`);
  }

  return projects[0]?.id || null;
};

export async function hydrateLocalPersistenceFromIndexedDB(): Promise<void> {
  const projectIdBeforeDiskHydration = getStoredCurrentProjectId();
  await hydrateDesktopProjectsFromDisk();

  const projects = await listProjects('guest');

  useProjectStore.setState({
    projects: new Map(projects.map(project => [project.id, project])),
    isLoading: false,
    error: null,
  });

  useBookStore.getState().hydrateBooks(projects);

  const hydratedBooks = useBookStore.getState().getAllBooks();
  if (projects.length > 0 && hydratedBooks.length === 0) {
    console.warn(`[StartupHydration] IndexedDB contains ${projects.length} projects but the world library is empty after hydration.`);
  }

  const projectIdToRestore = chooseProjectToRestore(projects, projectIdBeforeDiskHydration);
  if (!projectIdToRestore) {
    useProjectStore.setState({ currentProjectId: null });
    useBookStore.getState().setCurrentBook(null);
    return;
  }

  await useProjectStore.getState().loadProjectBundle(projectIdToRestore);
  useBookStore.getState().setCurrentBook(projectIdToRestore);
  await useSyncStore.getState().loadSyncQueue(projectIdToRestore);
}
