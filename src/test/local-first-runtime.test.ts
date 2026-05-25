import { describe, expect, it, vi } from 'vitest';

vi.mock('@/persistence/projects', () => ({
  projectPersistence: {
    get: vi.fn(),
  },
}));

vi.mock('@/persistence/assets', () => ({
  assetPersistence: {
    getProjectAssets: vi.fn(),
  },
}));

describe('local-first runtime', () => {
  it('loads projects from IndexedDB-backed persistence when Supabase is disabled', async () => {
    const { projectPersistence } = await import('@/persistence/projects');
    const { assetPersistence } = await import('@/persistence/assets');
    const { loadProject } = await import('@/services/assetLoadService');

    vi.mocked(projectPersistence.get).mockResolvedValue({
      id: 'project-1',
      userId: 'guest',
      name: 'Local Project',
      description: 'Stored locally',
      settings: {
        viewport: { zoom: 1 },
        backgrounds: { theme: 'dark' },
        tagsConfig: { mode: 'local' },
      },
      version: 3,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    });

    vi.mocked(assetPersistence.getProjectAssets).mockResolvedValue([
      {
        id: 'asset-1',
        projectId: 'project-1',
        parentId: undefined,
        layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 },
        content: { title: 'Root asset', description: '', text: '' },
        style: {},
        behavior: {},
        metadata: { tags: [], createdAt: '2026-05-20T00:00:00.000Z', updatedAt: '2026-05-20T00:00:00.000Z', version: 1 },
      } as any,
    ]);

    const result = await loadProject('project-1');

    expect(result.project.id).toBe('project-1');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].id).toBe('asset-1');
  });
});
