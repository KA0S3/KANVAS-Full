import { describe, expect, it } from 'vitest';
import { exportProject } from '../exportProject';
import { hydrateProjectFromDisk } from '../diskProject';
import type { Project } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';

const now = '2026-05-20T00:00:00.000Z';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project_1',
    userId: 'user_1',
    name: 'Test Project',
    settings: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    projectId: 'project_1',
    parentId: overrides.parentId,
    layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0, ...overrides.layout },
    content: { title: id, ...overrides.content },
    style: { ...overrides.style },
    behavior: { ...overrides.behavior },
    metadata: { createdAt: now, updatedAt: now, version: 1, ...overrides.metadata },
  };
}

describe('project serializer', () => {
  it('serializes a simple project', () => {
    const result = exportProject({
      project: project(),
      assets: [asset('asset_1')],
      appVersion: '0.0.0-test',
    });

    expect(result.errors).toEqual([]);
    expect(result.projectJson.schemaVersion).toBe(1);
    expect(result.projectJson.projectId).toBe('project_1');
    expect(result.projectJson.assets).toHaveLength(1);
    expect(result.metadataJson.assetCount).toBe(1);
    expect(result.metadataJson.folderLayout).toEqual({
      project: 'project.kanvas.json',
      metadata: 'metadata.json',
      assetManifest: 'asset-manifest.json',
      assets: 'assets/',
      indexes: 'indexes/',
    });
    expect(result.assetManifestJsonString).toContain('[]');
  });

  it('serializes nested assets and preserves stable IDs', () => {
    const result = exportProject({
      project: project(),
      assets: [
        asset('child_b', { parentId: 'root' }),
        asset('root'),
        asset('child_a', { parentId: 'root' }),
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.projectJson.canvases[0].rootAssetIds).toEqual(['root']);
    expect(result.projectJson.assets.map(item => item.id)).toEqual(['root', 'child_a', 'child_b']);
    expect(result.projectJson.assets.find(item => item.id === 'child_a')?.parentId).toBe('root');
  });

  it('strips UI-only and non-serializable state', () => {
    const polluted = {
      ...asset('asset_1'),
      selectedAssets: new Set(['asset_1']),
      dragState: { isDragging: true },
      syncQueue: new Map(),
      content: {
        title: 'Clean',
        customFields: {
          isExpanded: true,
          selectedNodeIds: ['asset_1'],
          keepMe: 'stable',
        },
      },
    } as unknown as Asset;

    const result = exportProject({ project: project(), assets: [polluted] });

    expect(result.projectJsonString).not.toContain('selectedAssets');
    expect(result.projectJsonString).not.toContain('dragState');
    expect(result.projectJsonString).not.toContain('syncQueue');
    expect(result.projectJsonString).not.toContain('isExpanded');
    expect(result.projectJsonString).toContain('keepMe');
  });

  it('excludes Base64 image data and reports it as unsafe', () => {
    const result = exportProject({
      project: project(),
      assets: [asset('asset_1', { content: { imageUrl: 'data:image/png;base64,abc123' } })],
    });

    expect(result.projectJsonString).not.toContain('data:image');
    expect(result.warnings.some(warning => warning.code === 'base64_asset_reference')).toBe(true);
  });

  it('excludes absolute file paths', () => {
    const result = exportProject({
      project: project(),
      assets: [asset('asset_1', { content: { imageUrl: 'C:\\Users\\shade\\image.png' } })],
    });

    expect(result.projectJsonString).not.toContain('C:\\Users');
    expect(result.warnings.some(warning => warning.code === 'absolute_asset_path')).toBe(true);
  });

  it('detects Supabase URLs and keeps them out of permanent project data', () => {
    const result = exportProject({
      project: project(),
      assets: [asset('asset_1', { content: { imageUrl: 'https://example.supabase.co/storage/v1/object/public/file.png' } })],
    });

    expect(result.projectJsonString).not.toContain('supabase.co');
    expect(result.warnings.some(warning => warning.code === 'cloud_asset_reference')).toBe(true);
  });

  it('excludes blob URLs and reports them as unsafe', () => {
    const result = exportProject({
      project: project(),
      assets: [asset('asset_1', { content: { imageUrl: 'blob:http://localhost/image' } })],
    });

    expect(result.projectJsonString).not.toContain('blob:http');
    expect(result.warnings.some(warning => warning.code === 'object_url_asset_reference')).toBe(true);
  });

  it('hydrates serialized image refs back to canonical imageUrl fields', () => {
    const result = exportProject({
      project: project(),
      assets: [asset('asset_1', { content: { imageUrl: 'portrait.png' } })],
      files: [{
        id: 'file_1',
        projectId: 'project_1',
        assetId: 'asset_1',
        storageKey: 'portrait.png',
        mimeType: 'image/png',
        sizeBytes: 123,
        createdAt: now,
      }],
    });

    const hydrated = hydrateProjectFromDisk(result.projectJson, 'guest', result.assetManifest);

    expect(hydrated.project.id).toBe('project_1');
    expect(hydrated.assets[0].content.imageUrl).toBe('assets/asset_1/portrait.png');
    expect(hydrated.files).toEqual([
      expect.objectContaining({
        id: 'file_1',
        projectId: 'project_1',
        assetId: 'asset_1',
        storageKey: 'assets/asset_1/portrait.png',
        mimeType: 'image/png',
        sizeBytes: 123,
      }),
    ]);
  });

  it('produces deterministic output from the same input', () => {
    const input = {
      project: project({ settings: { b: 2, a: 1 } }),
      assets: [asset('b'), asset('a')],
    };

    expect(exportProject(input).projectJsonString).toBe(exportProject(input).projectJsonString);
  });

  it('handles a large project smoke test', () => {
    const assets = Array.from({ length: 3000 }, (_, index) => asset(`asset_${index.toString().padStart(4, '0')}`));
    const result = exportProject({ project: project(), assets });

    expect(result.errors).toEqual([]);
    expect(result.projectJson.assets).toHaveLength(3000);
    expect(result.metadataJson.assetCount).toBe(3000);
  });
});
