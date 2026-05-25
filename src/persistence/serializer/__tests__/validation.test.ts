import { describe, expect, it } from 'vitest';
import { exportProject } from '../exportProject';
import { validateSerializedProject } from '../validateSerializedProject';
import type { Project } from '@/storage/indexeddb';
import type { Asset } from '@/types/Asset';

const now = '2026-05-20T00:00:00.000Z';

const project: Project = {
  id: 'project_1',
  userId: 'user_1',
  name: 'Validation Project',
  settings: {},
  version: 1,
  createdAt: now,
  updatedAt: now,
};

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    projectId: 'project_1',
    parentId: overrides.parentId,
    layout: { x: 0, y: 0, width: 100, height: 100, ...overrides.layout },
    content: { title: id, ...overrides.content },
    style: { ...overrides.style },
    behavior: { ...overrides.behavior },
    metadata: { createdAt: now, updatedAt: now, version: 1, ...overrides.metadata },
  };
}

describe('serialized project validation', () => {
  it('validates schemaVersion', () => {
    const serialized = exportProject({ project, assets: [asset('asset_1')] });
    const result = validateSerializedProject({
      ...serialized,
      projectJson: { ...serialized.projectJson, schemaVersion: 999 as 1 },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.code === 'schema_validation_failed')).toBe(true);
  });

  it('rejects Base64 if it leaks into project.json', () => {
    const serialized = exportProject({ project, assets: [asset('asset_1')] });
    const result = validateSerializedProject({
      ...serialized,
      projectJson: {
        ...serialized.projectJson,
        assets: [{
          ...serialized.projectJson.assets[0],
          content: { ...serialized.projectJson.assets[0].content, text: 'data:image/png;base64,abc123' },
        }],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.code === 'base64_in_project_json')).toBe(true);
  });

  it('rejects absolute paths if they leak into project.json', () => {
    const serialized = exportProject({ project, assets: [asset('asset_1')] });
    const result = validateSerializedProject({
      ...serialized,
      projectJson: {
        ...serialized.projectJson,
        assets: [{
          ...serialized.projectJson.assets[0],
          content: { ...serialized.projectJson.assets[0].content, imageRef: 'C:\\temp\\image.png' },
        }],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.code === 'absolute_path_in_project_json')).toBe(true);
  });

  it('detects missing parents', () => {
    const serialized = exportProject({ project, assets: [asset('child', { parentId: 'missing' })] });

    expect(serialized.errors.some(error => error.code === 'missing_parent_asset')).toBe(true);
  });

  it('detects parent cycles', () => {
    const serialized = exportProject({
      project,
      assets: [
        asset('a', { parentId: 'b' }),
        asset('b', { parentId: 'a' }),
      ],
    });

    expect(serialized.errors.some(error => error.code === 'parent_cycle')).toBe(true);
  });

  it('collects nested asset references into the manifest', () => {
    const serialized = exportProject({
      project,
      assets: [asset('asset_1', { content: { imageUrl: 'portrait.png' } })],
      files: [],
    });

    expect(serialized.projectJson.assets[0].content.imageRef).toBe('assets/asset_1/portrait.png');
    expect(serialized.assetManifest.some(reference => reference.relativePath === 'assets/asset_1/portrait.png')).toBe(true);
  });
});
