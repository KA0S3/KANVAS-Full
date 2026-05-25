import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  getProjectAssets: vi.fn(),
  loadProjectBundle: vi.fn(),
  getUserProjects: vi.fn(),
  getAllProjects: vi.fn(),
};

const mockTimedAssetSaver = {
  forceSave: vi.fn(),
  queueAssetUpdate: vi.fn(),
  flushAll: vi.fn(),
};

vi.mock('@/storage/indexeddb', async () => {
  const actual = await vi.importActual<typeof import('@/storage/indexeddb')>('@/storage/indexeddb');
  return {
    ...actual,
    db: mockDb,
  };
});

vi.mock('@/utils/errorHandling', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/services/TimedAssetSaver', () => ({
  timedAssetSaver: mockTimedAssetSaver,
}));

describe('local persistence stores', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useKanvasStore } = await import('@/stores/kanvasStore');
    const { useTagStore } = await import('@/stores/tagStore');
    const { useAssetStore } = await import('@/stores/assetStore');
    const { useProjectStore } = await import('@/stores/projectStore');

    useKanvasStore.getState().clearProject();
    useTagStore.getState().clearTags();
    useAssetStore.getState().clearAssets();
    useProjectStore.setState({
      projects: new Map(),
      currentProjectId: null,
      isLoading: false,
      error: null,
    });
  });

  it('queues asset updates for debounced indexeddb persistence', async () => {
    const { useKanvasStore } = await import('@/stores/kanvasStore');
    const { createCanonicalAsset } = await import('@/types/Asset');

    const asset = createCanonicalAsset('project-1', {
      projectId: 'project-1',
      parentId: undefined,
      layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 },
      content: { title: 'Test asset', description: '', text: '' },
      style: {},
      behavior: {},
    });

    useKanvasStore.getState().setAssets([asset]);

    await useKanvasStore.getState().updateAsset(asset.id, {
      content: {
        ...asset.content,
        title: 'Updated title',
      },
    });

    expect(mockTimedAssetSaver.queueAssetUpdate).toHaveBeenCalledTimes(1);
    expect(useKanvasStore.getState().getAsset(asset.id)?.content.title).toBe('Updated title');
  });

  it('merges project and global tags during hydration', async () => {
    const { useTagStore } = await import('@/stores/tagStore');

    useTagStore.getState().hydrateTags(
      [{
        id: 'project-tag',
        projectId: 'project-1',
        name: 'Project Tag',
        color: '#111111',
        scope: 'project',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      }],
      [{
        id: 'global-tag',
        userId: 'local-user',
        name: 'Global Tag',
        color: '#222222',
        scope: 'global',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      }],
      'project-1',
      'local-user'
    );

    expect(useTagStore.getState().getAllTags().map(tag => tag.id).sort()).toEqual(['global-tag', 'project-tag']);
  });

  it('hydrates project bundle into project, asset, and tag stores', async () => {
    const { useProjectStore } = await import('@/stores/projectStore');
    const { useAssetStore } = await import('@/stores/assetStore');
    const { useKanvasStore } = await import('@/stores/kanvasStore');
    const { useTagStore } = await import('@/stores/tagStore');
    const { createCanonicalAsset } = await import('@/types/Asset');

    const asset = createCanonicalAsset('project-1', {
      projectId: 'project-1',
      parentId: undefined,
      layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 },
      content: { title: 'Hydrated asset', description: '', text: '' },
      style: {},
      behavior: {},
    });

    mockDb.loadProjectBundle.mockResolvedValue({
      project: {
        id: 'project-1',
        userId: 'local-user',
        name: 'Project One',
        description: 'Local project',
        settings: {},
        version: 1,
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
      assets: [asset],
      projectTags: [],
      globalTags: [],
      files: [],
    });

    await useProjectStore.getState().loadProjectBundle('project-1', 'local-user');

    expect(useKanvasStore.getState().currentProjectId).toBe('project-1');
    expect(useAssetStore.getState().getAllAssets()).toHaveLength(1);
    expect(useTagStore.getState().getAllTags()).toHaveLength(0);
  });
});
