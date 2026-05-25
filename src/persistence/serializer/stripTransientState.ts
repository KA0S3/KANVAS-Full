import { FORBIDDEN_ASSET_FIELDS } from '@/types/Safeguards';
import type { CleanProjectState, ProjectSerializerInput, SerializationWarning } from './types';

const TRANSIENT_KEYS = new Set<string>([
  ...FORBIDDEN_ASSET_FIELDS,
  'selectedAssetIds',
  'selectedAssets',
  'hoveredAsset',
  'hoverPosition',
  'dragState',
  'selectionAnchor',
  'selectionRect',
  'isSelecting',
  'viewportBounds',
  'activeTab',
  'deleteDialogOpen',
  'createDialogOpen',
  'isLoading',
  'loading',
  'syncQueue',
  'session',
  'user',
  'account',
  'plan',
  'subscription',
  'undoStack',
  'redoStack',
].map(key => key.toLowerCase()));

const TRANSIENT_KEY_PATTERNS = [
  /selected/i,
  /hover/i,
  /drag/i,
  /expanded/i,
  /locked/i,
  /modal/i,
  /dialogopen/i,
  /loading/i,
  /uploadprogress/i,
  /syncstatus/i,
];

export function stripTransientState(projectState: ProjectSerializerInput): CleanProjectState {
  const warnings: SerializationWarning[] = [];

  return {
    project: cleanValue(projectState.project, 'project', warnings) as CleanProjectState['project'],
    assets: Array.from(projectState.assets instanceof Map ? projectState.assets.values() : projectState.assets)
      .map((asset, index) => cleanValue(asset, `assets.${index}`, warnings) as CleanProjectState['assets'][number]),
    files: (projectState.files || [])
      .map((file, index) => cleanValue(file, `files.${index}`, warnings) as CleanProjectState['files'][number]),
    projectTags: (projectState.projectTags || [])
      .map((tag, index) => cleanValue(tag, `projectTags.${index}`, warnings) as CleanProjectState['projectTags'][number]),
    globalTags: (projectState.globalTags || [])
      .map((tag, index) => cleanValue(tag, `globalTags.${index}`, warnings) as CleanProjectState['globalTags'][number]),
    appVersion: projectState.appVersion,
    warnings,
  };
}

function cleanValue(value: unknown, path: string, warnings: SerializationWarning[], seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    warnings.push({ code: 'non_serializable_value_stripped', message: 'Non-serializable value stripped.', path, severity: 'warning' });
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Array.from(value.values()).map((entry, index) => cleanValue(entry, `${path}.${index}`, warnings, seen));
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((entry, index) => cleanValue(entry, `${path}.${index}`, warnings, seen));
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    warnings.push({ code: 'blob_stripped', message: 'Blob/File data stripped from serializer output.', path, severity: 'warning' });
    return undefined;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
    warnings.push({ code: 'class_instance_stripped', message: 'Class/runtime object stripped from serializer output.', path, severity: 'warning' });
    return undefined;
  }

  if (seen.has(value)) {
    warnings.push({ code: 'cycle_stripped', message: 'Cyclic reference stripped from serializer output.', path, severity: 'warning' });
    return undefined;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => cleanValue(entry, `${path}.${index}`, warnings, seen))
      .filter(entry => entry !== undefined);
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isTransientKey(key)) {
      warnings.push({ code: 'transient_field_stripped', message: `Transient field '${key}' stripped.`, path: `${path}.${key}`, severity: 'warning' });
      continue;
    }

    const cleaned = cleanValue(child, `${path}.${key}`, warnings, seen);
    if (cleaned !== undefined) {
      output[key] = cleaned;
    }
  }

  return output;
}

function isTransientKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return TRANSIENT_KEYS.has(normalized) || TRANSIENT_KEY_PATTERNS.some(pattern => pattern.test(key));
}
