/**
 * ASSET TREE HOOK - Canonical Architecture
 * 
 * Rewritten to use the new canonical asset architecture with
 * proper zone separation and simplified state management.
 * 
 * 🔒 CRITICAL: Must maintain functionality while using new architecture
 */

import { useState, useCallback, useMemo } from 'react';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useUIStore } from '@/stores/uiStore';
import type { Asset } from '@/types/Asset';

// Simple tree node interface for the new architecture
export interface AssetTreeNode {
  id: string;
  asset: Asset;
  children: AssetTreeNode[];
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

// Tree state interface
export interface AssetTreeState {
  nodes: Map<string, AssetTreeNode>;
  rootNodes: string[];
  expandedNodes: Set<string>;
  selectedNodes: Set<string>;
}

// Tree operations interface
export interface AssetTreeOperations {
  toggleExpand: (assetId: string) => void;
  selectAsset: (assetId: string) => void;
  selectMultipleAssets: (assetIds: string[]) => void;
  deselectAsset: (assetId: string) => void;
  clearSelection: () => void;
  expandAll: () => void;
  collapseAll: () => void;
}

export const useAssetTree = () => {
  const {
    getAsset,
    getProjectAssets,
    currentProjectId,
  } = useKanvasStore();

  const {
    selectedAssets,
    selectAsset,
    selectMultipleAssets,
    clearSelection,
    isSelected,
  } = useUIStore();

  // Local tree state for UI only
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Get all assets for current project
  const projectAssets = useMemo(() => {
    if (!currentProjectId) return [];
    return getProjectAssets(currentProjectId);
  }, [currentProjectId, getProjectAssets]);

  // Build tree structure from flat asset list
  const treeState = useMemo((): AssetTreeState => {
    const nodes = new Map<string, AssetTreeNode>();
    const rootNodes: string[] = [];
    const assetMap = new Map(projectAssets.map(asset => [asset.id, asset]));

    // Create nodes for all assets
    for (const asset of projectAssets) {
      const children = projectAssets.filter(a => a.parentId === asset.id);
      
      nodes.set(asset.id, {
        id: asset.id,
        asset,
        children: [], // Will be filled below with AssetTreeNode objects
        level: 0, // Will be calculated below
        isExpanded: expandedNodes.has(asset.id),
        hasChildren: children.length > 0,
      });
    }

    // Build hierarchy and calculate levels
    const processed = new Set<string>();
    
    const processNode = (assetId: string, level: number = 0): AssetTreeNode | undefined => {
      if (processed.has(assetId)) return;
      processed.add(assetId);

      const node = nodes.get(assetId);
      if (!node) return;

      node.level = level;
      
      // Find and process children
      const children = projectAssets.filter(a => a.parentId === assetId);
      for (const child of children) {
        const childNode = processNode(child.id, level + 1);
        if (childNode) {
          node.children.push(childNode);
        }
      }

      // If no parent, it's a root node
      if (!assetId || !assetMap.get(assetId)?.parentId) {
        rootNodes.push(assetId);
      }

      return node;
    };

    // Process all assets
    for (const asset of projectAssets) {
      processNode(asset.id);
    }

    return {
      nodes,
      rootNodes,
      expandedNodes,
      selectedNodes: selectedAssets,
    };
  }, [projectAssets, expandedNodes, selectedAssets]);

  // Tree operations
  const operations: AssetTreeOperations = {
    toggleExpand: useCallback((assetId: string) => {
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(assetId)) {
          newSet.delete(assetId);
        } else {
          newSet.add(assetId);
        }
        return newSet;
      });
    }, []),

    selectAsset: useCallback((assetId: string) => {
      selectAsset(assetId);
    }, [selectAsset]),

    selectMultipleAssets: useCallback((assetIds: string[]) => {
      selectMultipleAssets(assetIds);
    }, [selectMultipleAssets]),

    deselectAsset: useCallback((assetId: string) => {
      // This would need to be implemented in UIStore
      // For now, just clear and reselect
      clearSelection();
    }, [clearSelection]),

    clearSelection: useCallback(() => {
      clearSelection();
    }, [clearSelection]),

    expandAll: useCallback(() => {
      const allNodeIds = Array.from(treeState.nodes.keys());
      setExpandedNodes(new Set(allNodeIds));
    }, [treeState.nodes]),

    collapseAll: useCallback(() => {
      setExpandedNodes(new Set());
    }, []),
  };

  // Utility functions
  const getNodeById = useCallback((assetId: string): AssetTreeNode | undefined => {
    return treeState.nodes.get(assetId);
  }, [treeState.nodes]);

  const getChildren = useCallback((assetId: string): AssetTreeNode[] => {
    const node = treeState.nodes.get(assetId);
    if (!node) return [];
    
    return node.children;
  }, [treeState.nodes]);

  const getParent = useCallback((assetId: string): AssetTreeNode | undefined => {
    const asset = getAsset(assetId);
    if (!asset?.parentId) return undefined;
    
    return treeState.nodes.get(asset.parentId);
  }, [getAsset, treeState.nodes]);

  const getRootNodes = useCallback((): AssetTreeNode[] => {
    return treeState.rootNodes
      .map(rootId => treeState.nodes.get(rootId))
      .filter((node): node is AssetTreeNode => node !== undefined);
  }, [treeState.rootNodes, treeState.nodes]);

  const isExpanded = useCallback((assetId: string): boolean => {
    return expandedNodes.has(assetId);
  }, [expandedNodes]);

  const isVisible = useCallback((assetId: string): boolean => {
    // Check if node should be visible based on parent expansion
    const asset = getAsset(assetId);
    if (!asset) return false;

    // Root nodes are always visible
    if (!asset.parentId) return true;

    // Check if all parents are expanded
    let currentParentId = asset.parentId;
    while (currentParentId) {
      if (!expandedNodes.has(currentParentId)) {
        return false;
      }
      const parentAsset = getAsset(currentParentId);
      if (!parentAsset) break;
      currentParentId = parentAsset.parentId;
    }

    return true;
  }, [getAsset, expandedNodes]);

  // Flatten tree for rendering
  const flattenedTree = useMemo((): AssetTreeNode[] => {
    const result: AssetTreeNode[] = [];
    const visited = new Set<string>();

    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = treeState.nodes.get(nodeId);
      if (!node) return;

      if (isVisible(nodeId)) {
        result.push(node);
      }

      // Traverse children if expanded
      if (expandedNodes.has(nodeId)) {
        for (const childNode of node.children) {
          traverse(childNode.id);
        }
      }
    };

    // Start from root nodes
    for (const rootId of treeState.rootNodes) {
      traverse(rootId);
    }

    return result;
  }, [treeState.nodes, treeState.rootNodes, expandedNodes, isVisible]);

  return {
    // State
    treeState,
    flattenedTree,
    projectAssets,
    currentProjectId,

    // Operations
    ...operations,

    // Utilities
    getNodeById,
    getChildren,
    getParent,
    getRootNodes,
    isExpanded,
    isVisible,
    isSelected,
  };
};
