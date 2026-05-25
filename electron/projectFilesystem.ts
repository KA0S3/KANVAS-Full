import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";

export type ProjectWarning = {
  code: string;
  message: string;
  path?: string;
};

export type ProjectFolderInfo = {
  folderName: string;
  folderPath: string;
  projectPath: string;
  legacyProjectPath: string;
  metadataPath: string;
  assetManifestPath: string;
  assetsPath: string;
  indexesPath: string;
};

export type ProjectListEntry = {
  folderName: string;
  projectId?: string;
  projectName?: string;
  updatedAt?: string;
  warnings: ProjectWarning[];
};

export type ProjectImportConflict = {
  incomingFolderName: string;
  incomingProjectId?: string;
  incomingProjectName?: string;
  existingFolderName: string;
  existingProjectId?: string;
  reason: "project_id" | "folder_name";
};

export type ProjectImportConflictAction = "keep_both" | "replace" | "cancel";

export type ProjectImportResult = ProjectFolderInfo & {
  warnings: ProjectWarning[];
  usesLegacyProjectJson: boolean;
  replaced?: boolean;
};

const REQUIRED_DIRS = ["assets", "indexes"] as const;
const REQUIRED_FILES = ["project.kanvas.json", "metadata.json", "asset-manifest.json"] as const;
const LEGACY_PROJECT_FILE = "project.json";

export function getProjectsRoot(documentsPath: string): string {
  return resolve(documentsPath, "KANVAS", "Projects");
}

export function sanitizeProjectSlug(value: string | undefined): string {
  const slug = (value || "untitled-project")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "untitled-project";
}

export function sanitizeFilename(value: string | undefined): string {
  const clean = basename(value || "asset")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return clean || "asset";
}

export function assertInsideProjectsRoot(projectsRoot: string, targetPath: string): string {
  const root = resolve(projectsRoot);
  const target = resolve(targetPath);
  const rel = relative(root, target);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return target;
  }

  throw new Error("Resolved project path escapes the KANVAS projects root");
}

export function getProjectFolderInfo(
  projectsRoot: string,
  input: { folderName?: string; projectName?: string; projectId?: string }
): ProjectFolderInfo {
  const folderName = sanitizeProjectSlug(input.folderName || input.projectName || input.projectId);
  const folderPath = assertInsideProjectsRoot(projectsRoot, join(projectsRoot, folderName));

  return {
    folderName,
    folderPath,
    projectPath: assertInsideProjectsRoot(projectsRoot, join(folderPath, "project.kanvas.json")),
    legacyProjectPath: assertInsideProjectsRoot(projectsRoot, join(folderPath, "project.json")),
    metadataPath: assertInsideProjectsRoot(projectsRoot, join(folderPath, "metadata.json")),
    assetManifestPath: assertInsideProjectsRoot(projectsRoot, join(folderPath, "asset-manifest.json")),
    assetsPath: assertInsideProjectsRoot(projectsRoot, join(folderPath, "assets")),
    indexesPath: assertInsideProjectsRoot(projectsRoot, join(folderPath, "indexes")),
  };
}

export async function ensureProjectStructure(
  projectsRoot: string,
  input: { folderName?: string; projectName?: string; projectId?: string }
): Promise<ProjectFolderInfo> {
  const info = getProjectFolderInfo(projectsRoot, input);

  await fs.mkdir(projectsRoot, { recursive: true });
  await fs.mkdir(info.folderPath, { recursive: true });
  await Promise.all(REQUIRED_DIRS.map(dir => fs.mkdir(join(info.folderPath, dir), { recursive: true })));

  return info;
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const json = `${JSON.stringify(value, null, 2)}\n`;

  await fs.writeFile(tempPath, json, "utf8");
  await fs.rename(tempPath, filePath);
}

export function collectRelativeAssetReferences(value: unknown): string[] {
  const refs = new Set<string>();
  collectRefs(value, refs);
  return [...refs].sort();
}

function collectRefs(value: unknown, refs: Set<string>): void {
  if (typeof value === "string") {
    const normalized = value.replace(/\\/g, "/");
    if (normalized.startsWith("assets/") && !normalized.includes("..")) {
      refs.add(normalized);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(entry => collectRefs(entry, refs));
    return;
  }

  Object.values(value as Record<string, unknown>).forEach(entry => collectRefs(entry, refs));
}

export async function validateReferencedAssets(folderPath: string, projectJson: unknown): Promise<ProjectWarning[]> {
  const warnings: ProjectWarning[] = [];
  const refs = collectRelativeAssetReferences(projectJson);

  for (const ref of refs) {
    const assetPath = resolve(folderPath, ref);
    const safeAssetPath = assertInsideProjectsRoot(folderPath, assetPath);
    try {
      await fs.access(safeAssetPath);
    } catch {
      warnings.push({
        code: "missing_asset_file",
        message: `Referenced asset file is missing: ${ref}`,
        path: ref,
      });
    }
  }

  return warnings;
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function assertInsideRoot(rootPath: string, targetPath: string): string {
  const root = resolve(rootPath);
  const target = resolve(targetPath);
  const rel = relative(root, target);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return target;
  }

  throw new Error("Resolved path escapes the expected root");
}

export async function readProjectJsonFile<T>(info: Pick<ProjectFolderInfo, "projectPath" | "legacyProjectPath">): Promise<T> {
  try {
    return await readJsonFile<T>(info.projectPath);
  } catch (error) {
    const readError = error as NodeJS.ErrnoException;
    if (readError?.code !== "ENOENT") {
      throw error;
    }
    return await readJsonFile<T>(info.legacyProjectPath);
  }
}

export async function listProjects(projectsRoot: string): Promise<ProjectListEntry[]> {
  await fs.mkdir(projectsRoot, { recursive: true });
  const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
  const projects: ProjectListEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const info = getProjectFolderInfo(projectsRoot, { folderName: entry.name });
    const warnings: ProjectWarning[] = [];
    try {
      const projectJson = await readProjectJsonFile<Record<string, unknown>>(info);
      projects.push({
        folderName: entry.name,
        projectId: typeof projectJson.projectId === "string" ? projectJson.projectId : undefined,
        projectName: typeof projectJson.projectName === "string" ? projectJson.projectName : undefined,
        updatedAt: typeof projectJson.updatedAt === "string" ? projectJson.updatedAt : undefined,
        warnings,
      });
    } catch (error) {
      warnings.push({
        code: "project_read_failed",
        message: error instanceof Error ? error.message : String(error),
      });
      projects.push({ folderName: entry.name, warnings });
    }
  }

  return projects.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function validateProjectFolder(
  folderPath: string,
  options: { allowLegacyProjectJson?: boolean; createMissingDirs?: boolean } = {}
): Promise<{ projectJson: Record<string, unknown>; usesLegacyProjectJson: boolean; warnings: ProjectWarning[] }> {
  const projectPath = assertInsideRoot(folderPath, join(folderPath, "project.kanvas.json"));
  const legacyProjectPath = assertInsideRoot(folderPath, join(folderPath, LEGACY_PROJECT_FILE));
  const metadataPath = assertInsideRoot(folderPath, join(folderPath, "metadata.json"));
  const assetManifestPath = assertInsideRoot(folderPath, join(folderPath, "asset-manifest.json"));
  const warnings: ProjectWarning[] = [];

  let usesLegacyProjectJson = false;
  let projectJson: Record<string, unknown>;
  try {
    projectJson = await readJsonFile<Record<string, unknown>>(projectPath);
  } catch (error) {
    const readError = error as NodeJS.ErrnoException;
    if (readError?.code !== "ENOENT" || !options.allowLegacyProjectJson) {
      throw new Error("Project folder is missing project.kanvas.json");
    }
    projectJson = await readJsonFile<Record<string, unknown>>(legacyProjectPath);
    usesLegacyProjectJson = true;
    warnings.push({
      code: "legacy_project_json",
      message: "Loaded legacy project.json through the existing fallback path.",
      path: LEGACY_PROJECT_FILE,
    });
  }

  await readJsonFile(metadataPath).catch(error => {
    throw new Error(`Project folder is missing or has invalid metadata.json: ${(error as Error).message}`);
  });
  await readJsonFile(assetManifestPath).catch(error => {
    throw new Error(`Project folder is missing or has invalid asset-manifest.json: ${(error as Error).message}`);
  });

  for (const dir of REQUIRED_DIRS) {
    const dirPath = assertInsideRoot(folderPath, join(folderPath, dir));
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        throw new Error(`${dir}/ exists but is not a folder`);
      }
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError?.code === "ENOENT" && options.createMissingDirs) {
        await fs.mkdir(dirPath, { recursive: true });
        warnings.push({
          code: "created_missing_project_dir",
          message: `Created missing ${dir}/ folder for canonical project layout.`,
          path: `${dir}/`,
        });
      } else {
        throw new Error(`Project folder is missing required ${dir}/ folder`);
      }
    }
  }

  warnings.push(...await validateReferencedAssets(folderPath, projectJson));
  return { projectJson, usesLegacyProjectJson, warnings };
}

function isIgnoredPortableEntry(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const name = basename(normalized).toLowerCase();
  return (
    name.endsWith(".tmp") ||
    name.endsWith(".temp") ||
    name === ".ds_store" ||
    name === "thumbs.db" ||
    normalized.startsWith(".") ||
    normalized.includes("/.cache/") ||
    normalized.includes("/cache/")
  );
}

async function addDirectoryToZip(
  zip: JSZip,
  sourceRoot: string,
  currentPath: string,
  zipPrefix: string,
  zipRootPrefix = ""
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError?.code === "ENOENT") {
      zip.folder(zipPrefix);
      return;
    }
    throw error;
  }

  const currentRelativePath = relative(sourceRoot, currentPath).replace(/\\/g, "/");
  const currentZipPath = zipRootPrefix && currentRelativePath
    ? `${zipRootPrefix}/${currentRelativePath}`
    : zipPrefix;
  zip.folder(currentZipPath);
  for (const entry of entries) {
    const absolutePath = assertInsideRoot(sourceRoot, join(currentPath, entry.name));
    const relativePath = relative(sourceRoot, absolutePath).replace(/\\/g, "/");
    if (isIgnoredPortableEntry(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, sourceRoot, absolutePath, relativePath, zipRootPrefix);
    } else if (entry.isFile()) {
      const zipPath = zipRootPrefix ? `${zipRootPrefix}/${relativePath}` : relativePath;
      zip.file(zipPath, await fs.readFile(absolutePath));
    }
  }
}

export async function exportProjectFolderToZip(folderPath: string): Promise<Buffer> {
  await validateProjectFolder(folderPath, { allowLegacyProjectJson: false, createMissingDirs: false });

  const zip = new JSZip();
  for (const filename of REQUIRED_FILES) {
    zip.file(filename, await fs.readFile(assertInsideRoot(folderPath, join(folderPath, filename))));
  }
  await addDirectoryToZip(zip, folderPath, join(folderPath, "assets"), "assets");
  await addDirectoryToZip(zip, folderPath, join(folderPath, "indexes"), "indexes");

  return await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "UNIX",
  });
}

async function addProjectFolderToZip(zip: JSZip, folderPath: string, zipProjectRoot: string): Promise<void> {
  await validateProjectFolder(folderPath, { allowLegacyProjectJson: false, createMissingDirs: false });

  for (const filename of REQUIRED_FILES) {
    zip.file(`${zipProjectRoot}/${filename}`, await fs.readFile(assertInsideRoot(folderPath, join(folderPath, filename))));
  }
  await addDirectoryToZip(zip, folderPath, join(folderPath, "assets"), `${zipProjectRoot}/assets`, zipProjectRoot);
  await addDirectoryToZip(zip, folderPath, join(folderPath, "indexes"), `${zipProjectRoot}/indexes`, zipProjectRoot);
}

export async function exportLibraryToZip(projectsRoot: string, selectedFolderNames?: string[]): Promise<Buffer> {
  const projects = await listProjects(projectsRoot);
  const selected = new Set((selectedFolderNames || []).map(folderName => sanitizeProjectSlug(folderName)));
  const folders = selected.size > 0
    ? projects.filter(project => selected.has(project.folderName))
    : projects.filter(project => project.projectId);

  if (folders.length === 0) {
    throw new Error("No valid desktop projects were found to export.");
  }

  const zip = new JSZip();
  for (const project of folders) {
    const info = getProjectFolderInfo(projectsRoot, { folderName: project.folderName });
    await addProjectFolderToZip(zip, info.folderPath, `KANVAS/Projects/${project.folderName}`);
  }

  return await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "UNIX",
  });
}

function assertSafeZipEntry(entryName: string): string {
  const normalized = entryName.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes(":") ||
    normalized.split("/").some(part => part === "..") ||
    normalized.includes("\0")
  ) {
    throw new Error(`ZIP contains unsafe path: ${entryName}`);
  }
  return normalized;
}

async function extractZipToStaging(zipPath: string): Promise<string> {
  const raw = await fs.readFile(zipPath);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(raw);
  } catch (error) {
    throw new Error(`Malformed ZIP file: ${(error as Error).message}`);
  }

  const stagingRoot = await fs.mkdtemp(join(tmpdir(), "kanvas-import-"));
  const entries = Object.values(zip.files);
  if (entries.length === 0) {
    throw new Error("Malformed ZIP file: archive is empty");
  }

  for (const entry of entries) {
    const safeName = assertSafeZipEntry(entry.name);
    if (isIgnoredPortableEntry(safeName)) {
      continue;
    }
    const targetPath = assertInsideRoot(stagingRoot, join(stagingRoot, safeName));
    if (entry.dir) {
      await fs.mkdir(targetPath, { recursive: true });
      continue;
    }
    await fs.mkdir(dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, await entry.async("nodebuffer"));
  }

  return stagingRoot;
}

async function copyPortableProjectFolder(sourceFolder: string, destinationFolder: string): Promise<void> {
  await fs.mkdir(destinationFolder, { recursive: true });
  const filesToCopy = (await fs.stat(join(sourceFolder, "project.kanvas.json")).then(() => REQUIRED_FILES, () => [
    LEGACY_PROJECT_FILE,
    "metadata.json",
    "asset-manifest.json",
  ])) as readonly string[];

  for (const filename of filesToCopy) {
    await fs.copyFile(
      assertInsideRoot(sourceFolder, join(sourceFolder, filename)),
      assertInsideRoot(destinationFolder, join(destinationFolder, filename))
    );
  }

  for (const dir of REQUIRED_DIRS) {
    await copyPortableDirectory(
      assertInsideRoot(sourceFolder, join(sourceFolder, dir)),
      assertInsideRoot(destinationFolder, join(destinationFolder, dir)),
      sourceFolder
    );
  }
}

async function hasCanonicalProjectFile(folderPath: string): Promise<boolean> {
  try {
    await fs.stat(join(folderPath, "project.kanvas.json"));
    return true;
  } catch {
    return false;
  }
}

async function findImportProjectFolders(sourceRoot: string): Promise<string[]> {
  if (await hasCanonicalProjectFile(sourceRoot)) {
    return [sourceRoot];
  }

  const candidateRoots = [
    join(sourceRoot, "KANVAS", "Projects"),
    join(sourceRoot, "Projects"),
    sourceRoot,
  ];
  const folders: string[] = [];
  const seen = new Set<string>();

  for (const candidateRoot of candidateRoots) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(candidateRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const folderPath = join(candidateRoot, entry.name);
      const resolved = resolve(folderPath);
      if (!seen.has(resolved) && await hasCanonicalProjectFile(folderPath)) {
        seen.add(resolved);
        folders.push(folderPath);
      }
    }
  }

  if (folders.length === 0) {
    throw new Error("Import source does not contain a valid KANVAS project folder.");
  }

  return folders;
}

export async function inspectProjectImportConflicts(
  projectsRoot: string,
  sourceRoot: string
): Promise<ProjectImportConflict[]> {
  const sourceFolders = await findImportProjectFolders(sourceRoot);
  const existingProjects = await listProjects(projectsRoot);
  const conflicts: ProjectImportConflict[] = [];

  for (const sourceFolder of sourceFolders) {
    const validation = await validateProjectFolder(sourceFolder, {
      allowLegacyProjectJson: false,
      createMissingDirs: false,
    });
    const incomingProjectId = typeof validation.projectJson.projectId === "string" ? validation.projectJson.projectId : undefined;
    const incomingProjectName = typeof validation.projectJson.projectName === "string" ? validation.projectJson.projectName : undefined;
    const incomingFolderName = sanitizeProjectSlug(incomingProjectName || incomingProjectId || basename(sourceFolder));
    const idMatch = incomingProjectId ? existingProjects.find(project => project.projectId === incomingProjectId) : undefined;
    const folderMatch = existingProjects.find(project => project.folderName === incomingFolderName);
    const match = idMatch || folderMatch;

    if (match) {
      conflicts.push({
        incomingFolderName,
        incomingProjectId,
        incomingProjectName,
        existingFolderName: match.folderName,
        existingProjectId: match.projectId,
        reason: idMatch ? "project_id" : "folder_name",
      });
    }
  }

  return conflicts;
}

async function resolveImportDestination(
  projectsRoot: string,
  sourceFolder: string,
  validation: { projectJson: Record<string, unknown> },
  conflictAction: ProjectImportConflictAction
): Promise<ProjectFolderInfo & { replaced: boolean; skipped: boolean }> {
  const incomingProjectId = typeof validation.projectJson.projectId === "string" ? validation.projectJson.projectId : undefined;
  const incomingProjectName = typeof validation.projectJson.projectName === "string" ? validation.projectJson.projectName : undefined;
  const incomingFolderName = sanitizeProjectSlug(incomingProjectName || incomingProjectId || basename(sourceFolder));
  const existingProjects = await listProjects(projectsRoot);
  const existing = (incomingProjectId ? existingProjects.find(project => project.projectId === incomingProjectId) : undefined)
    || existingProjects.find(project => project.folderName === incomingFolderName);

  if (existing && conflictAction === "cancel") {
    return { ...getProjectFolderInfo(projectsRoot, { folderName: existing.folderName }), replaced: false, skipped: true };
  }

  if (existing && conflictAction === "replace") {
    const destination = getProjectFolderInfo(projectsRoot, { folderName: existing.folderName });
    await fs.rm(assertInsideProjectsRoot(projectsRoot, destination.folderPath), { recursive: true, force: true });
    return { ...destination, replaced: true, skipped: false };
  }

  const destination = await resolveUniqueProjectFolder(projectsRoot, {
    folderName: incomingFolderName,
    projectName: incomingProjectName,
    projectId: incomingProjectId,
  });
  return { ...destination, replaced: false, skipped: false };
}

async function copyPortableDirectory(sourcePath: string, destinationPath: string, sourceRoot: string): Promise<void> {
  await fs.mkdir(destinationPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const sourceEntry = assertInsideRoot(sourceRoot, join(sourcePath, entry.name));
    const relativePath = relative(sourceRoot, sourceEntry).replace(/\\/g, "/");
    if (isIgnoredPortableEntry(relativePath)) {
      continue;
    }
    const destinationEntry = assertInsideRoot(destinationPath, join(destinationPath, entry.name));
    if (entry.isDirectory()) {
      await copyPortableDirectory(sourceEntry, destinationEntry, sourceRoot);
    } else if (entry.isFile()) {
      await fs.copyFile(sourceEntry, destinationEntry);
    }
  }
}

export async function resolveUniqueProjectFolder(
  projectsRoot: string,
  input: { projectName?: string; projectId?: string; folderName?: string }
): Promise<ProjectFolderInfo> {
  const base = sanitizeProjectSlug(input.folderName || input.projectName || input.projectId);
  for (let index = 0; index < 1000; index++) {
    const folderName = index === 0 ? base : `${base}-${index}`;
    const info = getProjectFolderInfo(projectsRoot, { folderName });
    try {
      await fs.access(info.folderPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return info;
      }
      throw error;
    }
  }
  throw new Error(`Could not find an available project folder name for ${base}`);
}

export async function importProjectFolderIntoRoot(
  projectsRoot: string,
  sourceFolder: string,
  options: { conflictAction?: ProjectImportConflictAction } = {}
): Promise<ProjectImportResult> {
  const validation = await validateProjectFolder(sourceFolder, {
    allowLegacyProjectJson: false,
    createMissingDirs: false,
  });
  const destination = await resolveImportDestination(projectsRoot, sourceFolder, validation, options.conflictAction || "keep_both");
  if (destination.skipped) {
    return { ...destination, warnings: validation.warnings, usesLegacyProjectJson: validation.usesLegacyProjectJson };
  }

  await fs.mkdir(projectsRoot, { recursive: true });
  await copyPortableProjectFolder(sourceFolder, destination.folderPath);
  return { ...destination, warnings: validation.warnings, usesLegacyProjectJson: validation.usesLegacyProjectJson, replaced: destination.replaced };
}

export async function importProjectSourceIntoRoot(
  projectsRoot: string,
  sourceRoot: string,
  options: { conflictAction?: ProjectImportConflictAction } = {}
): Promise<ProjectImportResult[]> {
  const sourceFolders = await findImportProjectFolders(sourceRoot);
  const imported: ProjectImportResult[] = [];

  for (const sourceFolder of sourceFolders) {
    const result = await importProjectFolderIntoRoot(projectsRoot, sourceFolder, options);
    if (options.conflictAction !== "cancel") {
      imported.push(result);
    }
  }

  return imported;
}

export async function importProjectZipIntoRoot(
  projectsRoot: string,
  zipPath: string,
  options: { conflictAction?: ProjectImportConflictAction } = {}
): Promise<ProjectImportResult[]> {
  const stagingRoot = await extractZipToStaging(zipPath);
  try {
    return await importProjectSourceIntoRoot(projectsRoot, stagingRoot, options);
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function inspectProjectZipImportConflicts(
  projectsRoot: string,
  zipPath: string
): Promise<ProjectImportConflict[]> {
  const stagingRoot = await extractZipToStaging(zipPath);
  try {
    return await inspectProjectImportConflicts(projectsRoot, stagingRoot);
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function copyAssetIntoProject(
  projectsRoot: string,
  input: {
    folderName?: string;
    projectName?: string;
    projectId?: string;
    assetId: string;
    originalName?: string;
    sourcePath?: string;
    bytes?: Uint8Array | number[];
  }
): Promise<{ relativePath: string; filename: string }> {
  const info = await ensureProjectStructure(projectsRoot, input);
  const filename = `${sanitizeFilename(input.assetId)}_${sanitizeFilename(input.originalName || input.sourcePath)}`;
  const destination = assertInsideProjectsRoot(projectsRoot, join(info.assetsPath, filename));

  if (input.bytes) {
    await fs.writeFile(destination, Buffer.from(input.bytes));
  } else if (input.sourcePath) {
    await fs.copyFile(input.sourcePath, destination);
  } else {
    throw new Error("copyAssetIntoProject requires sourcePath or bytes");
  }

  return {
    filename,
    relativePath: `assets/${filename}`,
  };
}
