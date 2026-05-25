import type { SerializationWarning } from './types';

const DATA_URL_PATTERN = /^data:[^;]+;base64,/i;
const WINDOWS_ABSOLUTE_PATTERN = /^[a-z]:[\\/]/i;
const POSIX_ABSOLUTE_PATTERN = /^\//;
const FILE_URL_PATTERN = /^file:\/\//i;
const BLOB_URL_PATTERN = /^blob:/i;
const REMOTE_URL_PATTERN = /^https?:\/\//i;
const SUPABASE_PATTERN = /(supabase|supabase\.co|storage\/v1|r2\.cloudflarestorage|cloudflare)/i;

const REF_KEY_PATTERN = /(image|url|uri|path|thumbnail|background|cover|storagekey|src|href|file)/i;

export function isLikelyReferenceKey(key: string): boolean {
  return REF_KEY_PATTERN.test(key);
}

export function isBase64DataUrl(value: string): boolean {
  return DATA_URL_PATTERN.test(value);
}

export function isAbsolutePath(value: string): boolean {
  return WINDOWS_ABSOLUTE_PATTERN.test(value) || POSIX_ABSOLUTE_PATTERN.test(value) || FILE_URL_PATTERN.test(value);
}

export function isRemoteUrl(value: string): boolean {
  return REMOTE_URL_PATTERN.test(value);
}

export function isSupabaseOrCloudUrl(value: string): boolean {
  return SUPABASE_PATTERN.test(value);
}

export function isObjectUrl(value: string): boolean {
  return BLOB_URL_PATTERN.test(value);
}

export function isUnsafeAssetReference(value: string): boolean {
  return isBase64DataUrl(value) || isAbsolutePath(value) || isObjectUrl(value) || isSupabaseOrCloudUrl(value) || isRemoteUrl(value);
}

export function classifyReference(value: string): { status: 'safe' | 'unsafe' | 'external'; code?: string; message?: string } {
  if (isBase64DataUrl(value)) {
    return { status: 'unsafe', code: 'base64_asset_reference', message: 'Base64/data URL asset references are not allowed in project.json.' };
  }

  if (isAbsolutePath(value)) {
    return { status: 'unsafe', code: 'absolute_asset_path', message: 'Absolute asset paths are not allowed in project.json.' };
  }

  if (isObjectUrl(value)) {
    return { status: 'unsafe', code: 'object_url_asset_reference', message: 'Runtime blob/object URLs are not durable asset references.' };
  }

  if (isSupabaseOrCloudUrl(value)) {
    return { status: 'external', code: 'cloud_asset_reference', message: 'Supabase/R2/cloud URLs are not allowed as permanent project data.' };
  }

  if (isRemoteUrl(value)) {
    return { status: 'external', code: 'remote_asset_reference', message: 'Remote URLs are not local-first asset references.' };
  }

  return { status: 'safe' };
}

export function warningForReference(value: string, path: string, assetId?: string): SerializationWarning | undefined {
  const classification = classifyReference(value);
  if (classification.status === 'safe') {
    return undefined;
  }

  return {
    code: classification.code || 'unsafe_asset_reference',
    message: classification.message || 'Unsafe asset reference.',
    path,
    assetId,
    severity: 'warning',
  };
}

export function toRelativeAssetPath(assetId: string | undefined, value: string, fallbackId: string): string {
  const safeName = basename(value || fallbackId).replace(/[^a-zA-Z0-9._-]/g, '_') || fallbackId;
  return `assets/${assetId || 'unassigned'}/${safeName}`;
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || value;
}
