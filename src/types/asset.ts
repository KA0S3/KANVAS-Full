import type { Asset } from '@/types/assetInterfaces';

export interface AssetNode extends Omit<Asset, 'children'> {
  level: number; // Depth in the tree
  isExpanded: boolean; // For UI tree expansion state
  parent?: AssetNode; // Reference to parent node
  children: AssetNode[]; // Resolved children nodes (overrides Asset's string[] children)
}

export interface AssetTreeState {
  expandedNodes: Record<string, boolean>;
  selectedNodes: Set<string>;
}

export interface AssetOperations {
  canMove: (assetId: string, targetParentId?: string) => boolean;
  findPath: (fromId: string, toId: string) => string[] | null;
  getDepth: (assetId: string) => number;
  getSiblings: (assetId: string) => Asset[];
  isDescendant: (parentId: string, childId: string) => boolean;
}

// Utility functions for tree operations
export const createAssetOperations = (assets: Record<string, Asset>): AssetOperations => ({
  canMove: (assetId: string, targetParentId?: string) => {
    if (!targetParentId) return true; // Can always move to root
    
    // Cannot move to self
    if (assetId === targetParentId) return false;
    
    // Cannot move to own descendant
    return !isDescendant(assets, assetId, targetParentId);
  },

  findPath: (fromId: string, toId: string) => {
    const path: string[] = [];
    let current = toId;
    
    while (current && assets[current]) {
      path.unshift(current);
      if (current === fromId) return path;
      current = assets[current].parent_id;
    }
    
    return null;
  },

  getDepth: (assetId: string) => {
    let depth = 0;
    let current = assets[assetId]?.parent_id;
    
    while (current) {
      depth++;
      current = assets[current]?.parent_id;
    }
    
    return depth;
  },

  getSiblings: (assetId: string) => {
    const asset = assets[assetId];
    if (!asset?.parent_id) return [];
    
    const parent = assets[asset.parent_id];
    if (!parent) return [];
    
    return parent.children
      .filter(id => id !== assetId)
      .map(id => assets[id])
      .filter(Boolean);
  },

  isDescendant: (parentId: string, childId: string) => {
    return isDescendant(assets, parentId, childId);
  },
});

// Helper function to check if one asset is a descendant of another
export const isDescendant = (
  assets: Record<string, Asset>, 
  parentId: string, 
  childId: string
): boolean => {
  let current = assets[childId]?.parent_id;
  
  while (current) {
    if (current === parentId) return true;
    current = assets[current]?.parent_id;
  }
  
  return false;
};

// Convert flat asset structure to tree nodes
export const buildAssetTree = (
  assets: Record<string, Asset>,
  rootId?: string,
  level = 0
): AssetNode[] => {
  const rootAssets = rootId 
    ? [assets[rootId]].filter(Boolean)
    : Object.values(assets).filter(asset => !asset.parent_id);

  return rootAssets.map(asset => ({
    ...asset,
    level,
    isExpanded: false, // Default state
    children: buildAssetTreeChildren(assets, asset.asset_id, level + 1),
  }));
};

// Helper to build children recursively
const buildAssetTreeChildren = (
  assets: Record<string, Asset>,
  parentId: string,
  level: number
): AssetNode[] => {
  const parent = assets[parentId];
  if (!parent || parent.children.length === 0) return [];

  return parent.children
    .map(childId => assets[childId])
    .filter(Boolean)
    .map(childAsset => ({
      ...childAsset,
      level,
      isExpanded: false,
      children: buildAssetTreeChildren(assets, childAsset.asset_id, level + 1),
    }));
};

// Flatten tree for rendering
export const flattenTree = (nodes: AssetNode[]): AssetNode[] => {
  const result: AssetNode[] = [];
  
  const traverse = (node: AssetNode) => {
    result.push(node);
    if (node.isExpanded) {
      node.children.forEach(traverse);
    }
  };
  
  nodes.forEach(traverse);
  return result;
};
