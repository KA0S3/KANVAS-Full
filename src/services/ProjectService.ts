/**
 * ProjectService - Low-I/O Backend Architecture
 * 
 * This service provides TypeScript wrappers for the Phase 2 RPC functions.
 * It handles the communication with Supabase for project and asset operations.
 */

import { supabase } from '@/lib/supabase';
import { unifiedUploadService } from './UnifiedUploadService';
import type { Asset } from '@/types/Asset';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// Type Definitions
// =====================================================

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  viewport: any;
  backgrounds: any;
  tags_config: any;
  cover_image: string | null;
  color: string;
  gradient: string | null;
  leather_color: string | null;
  is_leather_mode: boolean;
  cover_page_settings: any;
  last_version: number;
  asset_count: number;
  updated_at: string;
}

// Asset interface is now imported from '@/types/assetInterfaces'

export interface PositionUpdate {
  asset_id: string;
  x: number;
  y: number;
  z_index: number;
}

export interface AssetInput {
  asset_id: string;
  parent_id?: string | null;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content?: string | null;
  background_config?: any;
  viewport_config?: any;
  custom_fields?: any;
}

export interface PartialAssetInput {
  asset_id: string;
  parent_id?: string | null;
  name?: string | null;
  type?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  z_index?: number | null;
  is_expanded?: boolean | null;
  content?: string | null;
  background_config?: any;
  viewport_config?: any;
  custom_fields?: any;
}

export interface FileRecord {
  id: string;
  project_id: string;
  asset_id: string | null;
  storage_key: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

// =====================================================
// RPC Functions
// =====================================================

/**
 * save_positions - Hot Updates for Drag Operations
 * 
 * Use this for drag operations - only updates x, y, z_index (super cheap I/O).
 * Does NOT update assets.updated_at to enable HOT updates in Postgres.
 * 
 * @param projectId - The project UUID
 * @param positions - Array of position updates { asset_id, x, y, z_index }
 */
export async function savePositions(
  projectId: string,
  positions: PositionUpdate[]
): Promise<void> {
  const { error } = await supabase.rpc('save_positions', {
    p_project_id: projectId,
    p_positions: JSON.stringify(positions)
  });

  if (error) {
    console.error('Failed to save positions:', error);
    throw new Error(`Failed to save positions: ${error.message}`);
  }
}

/**
 * save_assets - Full Upsert for Metadata Changes
 * 
 * Use this for metadata changes - full upsert with version checking and
 * project size limits (max 5000 assets).
 * 
 * @param projectId - The project UUID
 * @param assets - Array of asset objects
 * @param expectedVersion - Optional version for optimistic locking
 */
export async function saveAssets(
  projectId: string,
  assets: AssetInput[]
): Promise<void> {
  const { error } = await supabase.rpc('save_assets', {
    p_project_id: projectId,
    p_assets: JSON.stringify(assets)
  });

  if (error) {
    console.error('Failed to save assets:', error);
    throw new Error(`Failed to save assets: ${error.message}`);
  }
}

/**
 * save_assets_partial - Partial Updates Optimization
 * 
 * Optional optimization for scale - send only changed fields and use
 * COALESCE in SQL to merge. Reduces payload size.
 * 
 * @param projectId - The project UUID
 * @param assets - Array of partial asset objects (only changed fields)
 * @param expectedVersion - Optional version for optimistic locking
 */
export async function saveAssetsPartial(
  projectId: string,
  assets: PartialAssetInput[]
): Promise<void> {
  const { error } = await supabase.rpc('save_assets_partial', {
    p_project_id: projectId,
    p_assets: JSON.stringify(assets)
  });

  if (error) {
    console.error('Failed to save assets (partial):', error);
    throw new Error(`Failed to save assets (partial): ${error.message}`);
  }
}

/**
 * load_project - Load Project Metadata
 * 
 * Loads project metadata including viewport, backgrounds, tags_config,
 * version, and asset count.
 * 
 * @param projectId - The project UUID
 * @returns Project metadata
 */
export async function loadProject(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase.rpc('load_project', {
    p_project_id: projectId
  });

  if (error) {
    console.error('Failed to load project:', error);
    throw new Error(`Failed to load project: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as Project;
}

/**
 * load_assets - Load Assets with Optional Filtering
 * 
 * Load assets with optional parent_id filtering for lazy-loading.
 * - p_parent_id=NULL loads only root assets (parent_id IS NULL)
 * - p_load_all=TRUE bypasses hierarchy check to load entire tree
 * 
 * @param projectId - The project UUID
 * @param parentId - Optional parent asset ID for lazy-loading
 * @param loadAll - If true, loads all assets regardless of hierarchy
 * @returns Array of assets
 */
export async function loadAssets(
  projectId: string,
  parentId?: string | null,
  loadAll: boolean = false
): Promise<Asset[]> {
  const { data, error } = await supabase.rpc('load_assets', {
    p_project_id: projectId,
    p_parent_id: parentId || null,
    p_load_all: loadAll
  });

  if (error) {
    console.error('Failed to load assets:', error);
    throw new Error(`Failed to load assets: ${error.message}`);
  }

  return (data || []) as Asset[];
}

/**
 * create_project - Create a New Project
 * 
 * Creates a new project and returns its UUID.
 * 
 * @param name - Project name
 * @param description - Optional project description
 * @returns The new project UUID
 */
export async function createProject(
  name: string,
  description?: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('create_project', {
    p_name: name,
    p_description: description || null
  });

  if (error) {
    console.error('Failed to create project:', error);
    throw new Error(`Failed to create project: ${error.message}`);
  }

  return data as string;
}

/**
 * save_project - Save Project-Level Configuration
 * 
 * Saves project-level configuration (viewport, backgrounds, tags_config, name, description, cover settings).
 * Includes version checking and bumps version on success.
 * 
 * @param projectId - The project UUID
 * @param options - Optional project metadata
 * @param viewport - Optional viewport settings
 * @param backgrounds - Optional background configurations
 * @param tagsConfig - Optional tags configuration
 * @param name - Optional project name
 * @param description - Optional project description
 * @param coverImage - Optional cover image URL
 * @param color - Optional cover color
 * @param gradient - Optional cover gradient
 * @param leatherColor - Optional leather color
 * @param isLeatherMode - Optional leather mode flag
 * @param coverPresetId - Optional cover preset ID
 * @param coverPageSettings - Optional cover page settings JSONB
 * @param expectedVersion - Optional version for optimistic locking
 */
export async function saveProject(
  projectId: string,
  options: {
    viewport?: any;
    backgrounds?: any;
    tagsConfig?: any;
    name?: string;
    description?: string;
    coverImage?: string;
    color?: string;
    gradient?: string;
    leatherColor?: string;
    isLeatherMode?: boolean;
    coverPresetId?: string;
    coverPageSettings?: any;
    expectedVersion?: number;
  } = {}
): Promise<void> {
  const { error } = await supabase.rpc('save_project', {
    p_project_id: projectId,
    p_viewport: options.viewport || null,
    p_backgrounds: options.backgrounds || null,
    p_tags_config: options.tagsConfig || null,
    p_name: options.name || null,
    p_description: options.description || null,
    p_cover_image: options.coverImage || null,
    p_color: options.color || null,
    p_gradient: options.gradient || null,
    p_leather_color: options.leatherColor || null,
    p_is_leather_mode: options.isLeatherMode || null,
    p_cover_preset_id: options.coverPresetId || null,
    p_cover_page_settings: options.coverPageSettings || null
  });

  if (error) {
    console.error('Failed to save project:', error);
    throw new Error(`Failed to save project: ${error.message}`);
  }
}

/**
 * list_projects - List User's Projects
 * 
 * Lists user's projects with pagination. Returns id, name, description,
 * version, asset count, and updated_at.
 * 
 * @param limit - Maximum number of projects to return (default: 50)
 * @param offset - Offset for pagination (default: 0)
 * @returns Array of projects
 */
export async function listProjects(
  limit: number = 50,
  offset: number = 0
): Promise<Project[]> {
  const { data, error } = await supabase.rpc('list_projects', {
    p_limit: limit,
    p_offset: offset
  });

  if (error) {
    console.error('Failed to list projects:', error);
    throw new Error(`Failed to list projects: ${error.message}`);
  }

  return (data || []) as Project[];
}

/**
 * delete_project - Soft Delete a Project
 * 
 * Soft deletes a project (sets deleted_at timestamp). Requires ownership.
 * 
 * @param projectId - The project UUID
 */
export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_project', {
    p_project_id: projectId
  });

  if (error) {
    console.error('Failed to delete project:', error);
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}

/**
 * create_file - Create File Record
 * 
 * Creates a file record after upload to Supabase Storage.
 * Validates project ownership. Returns file UUID.
 * 
 * @param projectId - The project UUID
 * @param assetId - Optional associated asset ID
 * @param storageKey - The storage key/path in Supabase Storage
 * @param mimeType - The file's MIME type
 * @param sizeBytes - The file size in bytes
 * @returns The new file UUID
 */
export async function createFile(
  projectId: string,
  assetId: string | null,
  storageKey: string,
  mimeType: string | null,
  sizeBytes: number
): Promise<string> {
  const { data, error } = await supabase.rpc('create_file', {
    p_project_id: projectId,
    p_asset_id: assetId || null,
    p_storage_key: storageKey,
    p_mime_type: mimeType || null,
    p_size_bytes: sizeBytes
  });

  if (error) {
    console.error('Failed to create file record:', error);
    throw new Error(`Failed to create file record: ${error.message}`);
  }

  return data as string;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Convert canonical Asset to AssetInput for RPC
 * Maps frontend canonical Asset interface to database schema
 */
export function assetToAssetInput(asset: any): AssetInput {
  return {
    asset_id: asset.id,
    parent_id: asset.parentId || null,
    name: asset.content?.title || '',
    type: asset.behavior?.renderMode || 'card',
    x: asset.layout?.x || 0,
    y: asset.layout?.y || 0,
    width: asset.layout?.width || 200,
    height: asset.layout?.height || 150,
    z_index: asset.layout?.zIndex || 0,
    is_expanded: false, // Derived from UI state, not asset data
    content: asset.content?.text || null,
    background_config: asset.style || {},
    viewport_config: asset.behavior?.viewport || {},
    custom_fields: {
      customFields: asset.content?.customFields || {},
      customFieldValues: [], // Converted from customFields structure
      thumbnail: asset.content?.imageUrl || null,
      background: asset.style?.background || null,
      tags: asset.metadata?.tags || [],
      viewportDisplaySettings: asset.behavior?.viewport || {},
      description: asset.content?.description || null
    }
  };
}

/**
 * Convert database Asset to canonical frontend Asset
 * Maps database schema to frontend Asset interface
 */
export function assetFromDb(dbAsset: any): Asset {
  const customFields = dbAsset.custom_fields || {};
  
  return {
    id: dbAsset.asset_id,
    projectId: dbAsset.project_id,
    parentId: dbAsset.parent_id || undefined,
    
    // Layout structure
    layout: {
      x: dbAsset.x || 0,
      y: dbAsset.y || 0,
      width: dbAsset.width || 200,
      height: dbAsset.height || 150,
      zIndex: dbAsset.z_index || 0,
    },
    
    // Content structure
    content: {
      title: dbAsset.name || '',
      description: customFields.description || '',
      text: dbAsset.content || '',
      imageUrl: customFields.thumbnail || '',
      customFields: customFields.customFields || {},
    },
    
    // Style structure
    style: {
      background: customFields.background || {},
      tagColor: '', // Will be derived from tags
      border: {},
      shape: dbAsset.type || 'card',
      opacity: 1,
    },
    
    // Behavior structure
    behavior: {
      renderMode: dbAsset.type || 'card',
      interactions: {},
      viewport: dbAsset.viewport_config || {},
    },
    
    // Metadata structure
    metadata: {
      tags: customFields.tags || [],
      createdAt: dbAsset.created_at || new Date().toISOString(),
      updatedAt: dbAsset.updated_at || new Date().toISOString(),
      version: 1, // Will be incremented on updates
    },
  };
}

/**
 * Reconstruct asset tree from flat asset list
 * Builds children arrays based on parent_id relationships
 */
export function buildAssetTree(assets: any[]): Record<string, any> {
  const assetMap: Record<string, any> = {};
  
  // First pass: create map and initialize children arrays
  assets.forEach(asset => {
    assetMap[asset.id] = { ...asset, children: [] };
  });
  
  // Second pass: build parent-child relationships
  assets.forEach(asset => {
    if (asset.parentId && assetMap[asset.parentId]) {
      assetMap[asset.parentId].children.push(asset.id);
    }
  });
  
  return assetMap;
}

/**
 * Get position updates from changed assets
 * Extracts only x, y, z_index for hot updates
 */
export function extractPositionUpdates(assets: any[]): PositionUpdate[] {
  return assets.map(asset => ({
    asset_id: asset.id,
    x: asset.x,
    y: asset.y,
    z_index: asset.zIndex || 0
  }));
}

// =====================================================
// FILE UPLOAD FLOW (Client-side) - Cloudflare R2 via Supabase Edge Function
// =====================================================

/**
 * Upload file using UnifiedUploadService and create file record
 * 
 * This function uses the UnifiedUploadService to handle the upload
 * to the appropriate backend (R2 or Supabase) and creates a file record.
 * 
 * @param projectId - The project UUID
 * @param assetId - The asset ID to associate with the file
 * @param file - The File object to upload
 * @returns { fileId, r2Url } for URL generation
 */
export async function uploadFile(
  projectId: string,
  assetId: string,
  file: File
): Promise<{ fileId: string; r2Url: string }> {
  // Use UnifiedUploadService to handle the upload
  const result = await unifiedUploadService.uploadFile(file, {
    metadata: {
      projectId,
      assetId
    }
  });

  if (!result.success) {
    throw new Error(result.error || 'Upload failed');
  }

  // For successful uploads, use the result properties
  const fileId = uuidv4(); // Generate file record ID
  const r2Url = result.url || '';

  // Create file record in database
  const { error: createError } = await supabase
    .from('files')
    .insert({
      id: fileId,
      project_id: projectId,
      asset_id: assetId,
      storage_key: result.key || '',
      mime_type: file.type,
      size_bytes: result.size || 0,
      created_at: new Date().toISOString()
    });

  if (createError) {
    console.error('File record creation failed:', createError);
    throw createError;
  }

  return { fileId, r2Url };
}

/**
 * Get public URL for file display (R2)
 *
 * Since R2 URLs are public, no signed URL is needed.
 *
 * @param storageKey - The storage path in R2
 * @returns Public URL for displaying the file
 */
export async function getFileUrl(storageKey: string): Promise<string> {
  const r2PublicUrl = import.meta.env.VITE_R2_PUBLIC_URL;

  if (!r2PublicUrl) {
    throw new Error('Missing VITE_R2_PUBLIC_URL environment variable.');
  }

  return `${r2PublicUrl}/${storageKey}`;
}
