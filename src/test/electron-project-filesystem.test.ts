import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  assertInsideProjectsRoot,
  collectRelativeAssetReferences,
  exportLibraryToZip,
  exportProjectFolderToZip,
  getProjectFolderInfo,
  importProjectFolderIntoRoot,
  importProjectZipIntoRoot,
  inspectProjectImportConflicts,
  sanitizeFilename,
  sanitizeProjectSlug,
  validateProjectFolder,
} from '../../electron/projectFilesystem';
import { hydrateProjectFromDisk } from '@/persistence/serializer';

const canonicalProjectJson = {
  schemaVersion: 1,
  projectId: 'project_1',
  projectName: 'Imported Project',
  createdAt: '2026-05-22T00:00:00.000Z',
  updatedAt: '2026-05-22T00:00:00.000Z',
  settings: {
    rootBackgroundConfig: {
      type: 'image',
      imageUrl: 'bundled:parchment',
    },
  },
  canvases: [{ id: 'root', rootAssetIds: ['asset_1', 'asset_2'] }],
  assets: [
    {
      id: 'asset_1',
      projectId: 'project_1',
      layout: {},
      content: { title: 'Custom background', imageRef: 'assets/asset_1/background.png' },
      style: { backgroundImage: 'assets/asset_1/background.png' },
      behavior: {},
      metadata: {},
    },
    {
      id: 'asset_2',
      projectId: 'project_1',
      layout: {},
      content: { title: 'Built in background', imageRef: 'bundled:marble' },
      style: { backgroundImage: 'bundled:marble' },
      behavior: {},
      metadata: {},
    },
  ],
  tags: [],
};

const metadataJson = {
  schemaVersion: 1,
  projectId: 'project_1',
  projectName: 'Imported Project',
  createdAt: '2026-05-22T00:00:00.000Z',
  updatedAt: '2026-05-22T00:00:00.000Z',
  serializerVersion: 1,
  assetCount: 2,
  fileReferenceCount: 1,
  warningCount: 0,
  folderLayout: {
    project: 'project.kanvas.json',
    metadata: 'metadata.json',
    assetManifest: 'asset-manifest.json',
    assets: 'assets/',
    indexes: 'indexes/',
  },
};

const assetManifest = [
  {
    id: 'file_1',
    assetId: 'asset_1',
    sourceField: 'files.storageKey',
    relativePath: 'assets/asset_1/background.png',
    mimeType: 'image/png',
    sizeBytes: 4,
    status: 'safe',
    warnings: [],
  },
];

async function createCanonicalProjectFolder() {
  const root = await fs.mkdtemp(join(tmpdir(), 'kanvas-test-project-'));
  await fs.mkdir(join(root, 'assets', 'asset_1'), { recursive: true });
  await fs.mkdir(join(root, 'indexes'), { recursive: true });
  await fs.writeFile(join(root, 'project.kanvas.json'), JSON.stringify(canonicalProjectJson, null, 2));
  await fs.writeFile(join(root, 'metadata.json'), JSON.stringify(metadataJson, null, 2));
  await fs.writeFile(join(root, 'asset-manifest.json'), JSON.stringify(assetManifest, null, 2));
  await fs.writeFile(join(root, 'assets', 'asset_1', 'background.png'), 'data');
  return root;
}

describe('electron project filesystem helpers', () => {
  it('creates safe project slugs and filenames', () => {
    expect(sanitizeProjectSlug("Kaos' Test World!")).toBe('kaos-test-world');
    expect(sanitizeFilename('weird name../cover image.png')).toBe('cover_image.png');
  });

  it('rejects paths outside the projects root', () => {
    const root = 'C:\\Users\\shade\\Documents\\KANVAS\\Projects';
    expect(() => assertInsideProjectsRoot(root, 'C:\\Users\\shade\\Documents\\KANVAS\\Projects\\world')).not.toThrow();
    expect(() => assertInsideProjectsRoot(root, 'C:\\Users\\shade\\Desktop\\escape')).toThrow();
  });

  it('collects only relative project asset references', () => {
    const refs = collectRelativeAssetReferences({
      imageRef: 'assets/asset_1_cover.png',
      ignoredAbsolute: 'C:\\temp\\cover.png',
      nested: [{ src: 'assets/nested.png' }],
    });

    expect(refs).toEqual(['assets/asset_1_cover.png', 'assets/nested.png']);
  });

  it('uses the new desktop project folder layout with legacy fallback path metadata', () => {
    const info = getProjectFolderInfo('C:\\Users\\shade\\Documents\\KANVAS\\Projects', {
      projectName: "Kaos' Test World!",
    });

    expect(info.projectPath.endsWith('project.kanvas.json')).toBe(true);
    expect(info.legacyProjectPath.endsWith('project.json')).toBe(true);
    expect(info.assetManifestPath.endsWith('asset-manifest.json')).toBe(true);
    expect(info.indexesPath.endsWith('indexes')).toBe(true);
  });

  it('validates a canonical project folder', async () => {
    const folder = await createCanonicalProjectFolder();
    const result = await validateProjectFolder(folder);

    expect(result.usesLegacyProjectJson).toBe(false);
    expect(result.projectJson.projectId).toBe('project_1');
    expect(result.warnings).toEqual([]);
  });

  it('exports a canonical ZIP without project.json as the main file', async () => {
    const folder = await createCanonicalProjectFolder();
    const zipBuffer = await exportProjectFolderToZip(folder);
    const zip = await JSZip.loadAsync(zipBuffer);

    expect(zip.file('project.kanvas.json')).toBeTruthy();
    expect(zip.file('metadata.json')).toBeTruthy();
    expect(zip.file('asset-manifest.json')).toBeTruthy();
    expect(zip.folder('assets')).toBeTruthy();
    expect(zip.folder('indexes')).toBeTruthy();
    expect(zip.file('project.json')).toBeNull();
  });

  it('rejects malformed ZIP imports', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const badZip = join(projectsRoot, 'bad.zip');
    await fs.writeFile(badZip, 'not a zip');

    await expect(importProjectZipIntoRoot(projectsRoot, badZip)).rejects.toThrow(/Malformed ZIP file/);
  });

  it('rejects ZIP path traversal entries', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const zip = new JSZip();
    zip.file('../escape.txt', 'bad');
    zip.file('project.kanvas.json', JSON.stringify(canonicalProjectJson));
    zip.file('metadata.json', JSON.stringify(metadataJson));
    zip.file('asset-manifest.json', JSON.stringify(assetManifest));
    zip.folder('assets');
    zip.folder('indexes');
    const zipPath = join(projectsRoot, 'unsafe.zip');
    await fs.writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));

    await expect(importProjectZipIntoRoot(projectsRoot, zipPath)).rejects.toThrow(/unsafe path/);
  });

  it('imports project.kanvas.json into a unique desktop project folder', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const sourceFolder = await createCanonicalProjectFolder();

    await importProjectFolderIntoRoot(projectsRoot, sourceFolder);
    const imported = await importProjectFolderIntoRoot(projectsRoot, sourceFolder);

    expect(imported.folderPath.startsWith(projectsRoot)).toBe(true);
    expect(imported.folderName).toBe('imported-project-1');
    await expect(fs.stat(join(imported.folderPath, 'project.kanvas.json'))).resolves.toBeTruthy();
    await expect(fs.stat(join(imported.folderPath, 'assets', 'asset_1', 'background.png'))).resolves.toBeTruthy();
  });

  it('hydrates imported manifest-backed files for IndexedDB cache restoration', () => {
    const hydrated = hydrateProjectFromDisk(canonicalProjectJson as any, 'guest', assetManifest as any);

    expect(hydrated.project.id).toBe('project_1');
    expect(hydrated.assets[0].content.imageUrl).toBe('assets/asset_1/background.png');
    expect(hydrated.files).toEqual([
      expect.objectContaining({
        assetId: 'asset_1',
        storageKey: 'assets/asset_1/background.png',
      }),
    ]);
  });

  it('preserves custom asset refs and bundled background refs through export/import', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const sourceFolder = await createCanonicalProjectFolder();
    const zipPath = join(projectsRoot, 'project.zip');
    await fs.writeFile(zipPath, await exportProjectFolderToZip(sourceFolder));

    const [imported] = await importProjectZipIntoRoot(projectsRoot, zipPath);
    const importedJson = JSON.parse(await fs.readFile(join(imported.folderPath, 'project.kanvas.json'), 'utf8'));
    const zip = await JSZip.loadAsync(await exportProjectFolderToZip(imported.folderPath));

    expect(JSON.stringify(importedJson)).toContain('assets/asset_1/background.png');
    expect(JSON.stringify(importedJson)).toContain('bundled:marble');
    expect(zip.file('assets/asset_1/background.png')).toBeTruthy();
    expect(zip.file('assets/bundled:marble')).toBeNull();
  });

  it('exports the full library under KANVAS/Projects', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const sourceFolder = await createCanonicalProjectFolder();
    await importProjectFolderIntoRoot(projectsRoot, sourceFolder);

    const zip = await JSZip.loadAsync(await exportLibraryToZip(projectsRoot));

    expect(zip.file('KANVAS/Projects/imported-project/project.kanvas.json')).toBeTruthy();
    expect(zip.file('KANVAS/Projects/imported-project/metadata.json')).toBeTruthy();
    expect(zip.file('KANVAS/Projects/imported-project/asset-manifest.json')).toBeTruthy();
    expect(zip.file('KANVAS/Projects/imported-project/assets/asset_1/background.png')).toBeTruthy();
  });

  it('imports a library ZIP with multiple projects', async () => {
    const sourceProjectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-source-projects-'));
    const targetProjectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-target-projects-'));
    const firstFolder = await createCanonicalProjectFolder();
    const secondFolder = await createCanonicalProjectFolder();
    const secondJson = { ...canonicalProjectJson, projectId: 'project_2', projectName: 'Second Project' };
    await fs.writeFile(join(secondFolder, 'project.kanvas.json'), JSON.stringify(secondJson, null, 2));
    await importProjectFolderIntoRoot(sourceProjectsRoot, firstFolder);
    await importProjectFolderIntoRoot(sourceProjectsRoot, secondFolder);
    const zipPath = join(targetProjectsRoot, 'library.zip');
    await fs.writeFile(zipPath, await exportLibraryToZip(sourceProjectsRoot));

    const imported = await importProjectZipIntoRoot(targetProjectsRoot, zipPath);

    expect(imported.map(project => project.folderName).sort()).toEqual(['imported-project', 'second-project']);
  });

  it('detects conflicts and can keep both or replace existing projects', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const sourceFolder = await createCanonicalProjectFolder();
    await importProjectFolderIntoRoot(projectsRoot, sourceFolder);

    const conflicts = await inspectProjectImportConflicts(projectsRoot, sourceFolder);
    const kept = await importProjectFolderIntoRoot(projectsRoot, sourceFolder, { conflictAction: 'keep_both' });
    const replacementFolder = await createCanonicalProjectFolder();
    const replacementJson = { ...canonicalProjectJson, projectName: 'Imported Project', updatedAt: '2026-05-23T00:00:00.000Z' };
    await fs.writeFile(join(replacementFolder, 'project.kanvas.json'), JSON.stringify(replacementJson, null, 2));
    const replaced = await importProjectFolderIntoRoot(projectsRoot, replacementFolder, { conflictAction: 'replace' });
    const replacedJson = JSON.parse(await fs.readFile(join(replaced.folderPath, 'project.kanvas.json'), 'utf8'));

    expect(conflicts).toEqual([
      expect.objectContaining({
        incomingProjectId: 'project_1',
        existingFolderName: 'imported-project',
        reason: 'project_id',
      }),
    ]);
    expect(kept.folderName).toBe('imported-project-1');
    expect(replaced.folderName).toBe('imported-project');
    expect(replaced.replaced).toBe(true);
    expect(replacedJson.updatedAt).toBe('2026-05-23T00:00:00.000Z');
  });

  it('cancels conflicting project imports without writing a copy', async () => {
    const projectsRoot = await fs.mkdtemp(join(tmpdir(), 'kanvas-projects-'));
    const sourceFolder = await createCanonicalProjectFolder();
    await importProjectFolderIntoRoot(projectsRoot, sourceFolder);
    const zipPath = join(projectsRoot, 'project.zip');
    await fs.writeFile(zipPath, await exportProjectFolderToZip(sourceFolder));

    const imported = await importProjectZipIntoRoot(projectsRoot, zipPath, { conflictAction: 'cancel' });
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });

    expect(imported).toEqual([]);
    expect(entries.filter(entry => entry.isDirectory()).map(entry => entry.name)).toEqual(['imported-project']);
  });
});
