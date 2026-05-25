/**
 * Asset Load Service - Phase 3 Frontend Integration
 * 
 * Implements loading strategy with deterministic rules:
 * - Rule 1: Always load project first
 * - Rule 2: Never load full tree unless small (<100 assets)
 * - Rule 3: Root = parent_id IS NULL
 * - Rule 4: Children loaded on expand
 * - Rule 5: Cache loaded nodes in memory
 * - Rule 6: Rebuild hierarchy ONLY in frontend
 */

import { supabase } from '@/lib/supabase';
import { USE_SUPABASE } from '@/config/features';
import type { Asset } from '@/components/AssetItem';
import { projectPersistence } from '@/persistence/projects';
import { assetPersistence } from '@/persistence/assets';
import type { Project as LocalProject } from '@/storage/indexeddb';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

/**
 * Database asset record from RPC
 */
export interface DbAsset {
  asset_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content: string | null;
  background_config: Record<string, any>;
  viewport_config: Record<string, any>;
  custom_fields: Record<string, any>;
  updated_at: string;
}

/**
 * Project metadata from RPC
 */
export interface DbProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  viewport: Record<string, any>;
  backgrounds: Record<string, any>;
  tags_config: Record<string, any>;
  last_version: number;
  asset_count: number;
  updated_at: string;
}

/**
 * CRITICAL FIX: Separate wrapper type for tree structure
 * This respects the hard rule to never change Asset interface
 * AssetNode is used ONLY in tree-building and rendering layer
 */
export type AssetNode = Asset & { children?: AssetNode[] };

const mapLocalProjectToDbProject = (project: LocalProject, assetCount: number): DbProject => ({
  id: project.id,
  user_id: project.userId,
  name: project.name,
  description: project.description || null,
  viewport: project.settings?.viewport || {},
  backgrounds: project.settings?.backgrounds || {},
  tags_config: project.settings?.tagsConfig || {},
  last_version: project.version || 1,
  asset_count: assetCount,
  updated_at: project.updatedAt,
});

// =====================================================
// ASSET MAPPING FUNCTIONS
// =====================================================

/**
 * When loading from DB, map DB columns to Asset interface
 * CRITICAL: Respects existing Asset interface structure
 * Maps custom_fields object to frontend arrays (customFields, customFieldValues, tags, etc.)
 */
export function dbAssetToAsset(dbAsset: DbAsset): Asset {
  // Extract custom fields from DB object
  const customFieldsData = dbAsset.custom_fields || {};

  // CRITICAL: Asset interface doesn't have zIndex - it's calculated dynamically
  // The DB has z_index but frontend calculates it based on asset size
  // We don't need to store the DB z_index value

  return {
    id: dbAsset.asset_id,
    parentId: dbAsset.parent_id,
    name: dbAsset.name,
    type: dbAsset.type as Asset['type'],
    x: dbAsset.x,
    y: dbAsset.y,
    width: dbAsset.width,
    height: dbAsset.height,
    isExpanded: dbAsset.is_expanded,
    content: dbAsset.content,
    backgroundConfig: dbAsset.background_config,
    viewportConfig: dbAsset.viewport_config as Asset['viewportConfig'],
    customFields: customFieldsData.customFields || [], // Map array from DB
    customFieldValues: customFieldsData.customFieldValues || [], // Map array from DB
    tags: customFieldsData.tags || [], // Map tags array from DB
    thumbnail: customFieldsData.thumbnail,
    background: customFieldsData.background,
    description: customFieldsData.description,
    viewportDisplaySettings: customFieldsData.viewportDisplaySettings,
    children: [], // Will be populated by tree building
    // Preserve existing Asset fields with defaults
    createdAt: new Date(dbAsset.updated_at).getTime(),
    updatedAt: new Date(dbAsset.updated_at).getTime(),
    isLocked: false,
    borderShape: 'square',
    showTagBorder: false,
    cloudStatus: 'local',
  };
}

// =====================================================
// LOADING STRATEGY
// =====================================================

// In-memory cache for loaded nodes
const loadedNodes: Set<string | null> = new Set();

/**
 * Rule 1: Always load project first
 * Rule 2: Never load full tree unless small (<100 assets)
 * Rule 6: Rebuild hierarchy ONLY in frontend
 */
export async function loadProject(currentProjectId: string): Promise<{ project: DbProject; assets: AssetNode[] }> {
  if (!USE_SUPABASE) {
    const project = await projectPersistence.get(currentProjectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const assets = await assetPersistence.getProjectAssets(currentProjectId);
    const assetTree = buildAssetTree(assets);

    return {
      project: mapLocalProjectToDbProject(project, assets.length),
      assets: assetTree,
    };
  }

  // Rule 1: Load project first
  const { data: projectData, error: projectError } = await supabase.rpc('load_project', {
    p_project_id: currentProjectId
  });

  if (projectError) throw projectError;

  if (!projectData || projectData.length === 0) {
    throw new Error('Project not found');
  }

  const project = projectData[0];

  // CRITICAL FIX: Use asset_count from load_project to avoid redundant query
  const assetCount = project.asset_count || 0;

  let assets: Asset[] = [];

  if (assetCount < 100) {
    // Load all assets (small project)
    // CRITICAL FIX: Use p_load_all=TRUE to load entire tree, not just root nodes
    const { data: assetsData, error: assetsError } = await supabase.rpc('load_assets', {
      p_project_id: currentProjectId,
      p_parent_id: null,
      p_load_all: true
    });
    if (assetsError) throw assetsError;
    assets = assetsData.map(dbAssetToAsset);
    loadedNodes.add(null); // Mark root as loaded
  } else {
    // Lazy load root only (large project)
    const { data: rootAssetsData, error: rootError } = await supabase.rpc('load_assets', {
      p_project_id: currentProjectId,
      p_parent_id: null
    });
    if (rootError) throw rootError;
    assets = rootAssetsData.map(dbAssetToAsset);
    loadedNodes.add(null); // Mark root as loaded
  }

  // Rule 6: Reconstruct tree client-side
  const assetTree = buildAssetTree(assets);

  return {
    project,
    assets: assetTree
  };
}

/**
 * Rule 4: Load children on expand
 * Rule 5: Check cache first
 */
export async function loadAssetsByParent(currentProjectId: string, parentId: string): Promise<Asset[]> {
  if (!USE_SUPABASE) {
    const assets = await assetPersistence.getProjectAssets(currentProjectId);
    return assets.filter(asset => asset.parentId === parentId);
  }

  // Rule 5: Check cache first
  if (loadedNodes.has(parentId)) {
    return []; // Already loaded
  }

  const { data: assetsData, error } = await supabase.rpc('load_assets', {
    p_project_id: currentProjectId,
    p_parent_id: parentId
  });

  if (error) throw error;

  // Mark as loaded
  loadedNodes.add(parentId);

  return assetsData.map(dbAssetToAsset);
}

/**
 * Rule 6: Reconstruct tree from flat asset list
 * CRITICAL FIX: Use AssetNode type to avoid mutating Asset interface
 */
export function buildAssetTree(assets: Asset[]): AssetNode[] {
  const assetMap = new Map<string, AssetNode>(assets.map(a => [a.id, { ...a, children: [] }]));
  const rootAssets: AssetNode[] = [];

  for (const asset of assets) {
    const node = assetMap.get(asset.id)!;
    if (asset.parentId) {
      const parent = assetMap.get(asset.parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      }
    } else {
      rootAssets.push(node);
    }
  }

  return rootAssets;
}

/**
 * Clear loaded nodes cache (call when switching projects)
 */
export function clearLoadedNodesCache(): void {
  loadedNodes.clear();
}

/**
 * Check if a node's children have been loaded
 */
export function isNodeLoaded(parentId: string | null): boolean {
  return loadedNodes.has(parentId);
}

/**
 * Mark a node as loaded (useful for pre-loading)
 */
export function markNodeAsLoaded(parentId: string | null): void {
  loadedNodes.add(parentId);
}
