import { useState, useCallback } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { 
  buildAssetTree, 
  flattenTree, 
  createAssetOperations,
  type AssetNode,
  type AssetTreeState,
  type AssetOperations 
} from '@/types/asset';
import type { Asset } from '@/components/AssetItem';

export const useAssetTree = () => {
  const {
    getCurrentBookAssets,
    currentActiveId,
    createAsset,
    reparentAsset,
    deleteAsset,
    updateAssetPosition,
    updateAssetSize,
    setActiveAsset,
    getActiveAsset,
    getRootAssets,
    getAssetChildren,
    getAssetTree,
    bookAssets,
  } = useAssetStore();

  // Subscribe to bookAssets for reactivity - ensures re-render when assets load from storage
  const assets = getCurrentBookAssets();
  
  // Debug logging to track asset loading
  console.log('🎯 useAssetTree: Assets loaded from store', {
    assetCount: Object.keys(assets).length,
    assetIds: Object.keys(assets),
    currentBookId: useAssetStore.getState().getCurrentBookId()
  });

  // Tree state for UI (expansion, selection)
  const [treeState, setTreeState] = useState<AssetTreeState>({
    expandedNodes: {},
    selectedNodes: new Set(),
  });

  // Build tree structure from flat assets
  const treeNodes = useCallback(() => {
    return buildAssetTree(assets);
  }, [assets]);

  // Get flattened tree for rendering
  const flattenedTree = useCallback(() => {
    const nodes = treeNodes();
    console.log('flattenedTree called, expandedNodes:', treeState.expandedNodes);
    
    // Recursive function to apply expansion state to all nodes
    const applyExpansionState = (nodes: AssetNode[]): AssetNode[] => {
      return nodes.map(node => ({
        ...node,
        isExpanded: treeState.expandedNodes[node.id] || false,
        children: applyExpansionState(node.children),
      }));
    };
    
    const nodesWithExpansion = applyExpansionState(nodes);
    console.log('Nodes with expansion:', nodesWithExpansion.map(n => ({ id: n.id, isExpanded: n.isExpanded })));
    return flattenTree(nodesWithExpansion);
  }, [treeNodes, treeState.expandedNodes]);

  // Tree operations
  const operations = useCallback(() => {
    return createAssetOperations(assets);
  }, [assets]);

  // Toggle node expansion
  const toggleExpansion = useCallback((nodeId: string) => {
    console.log('toggleExpansion called for:', nodeId, 'current expanded state:', treeState.expandedNodes[nodeId]);
    setTreeState(prev => {
      const newExpanded = {
        ...prev.expandedNodes,
        [nodeId]: !prev.expandedNodes[nodeId],
      };
      console.log('New expanded state:', newExpanded);
      return {
        ...prev,
        expandedNodes: newExpanded,
      };
    });
  }, [treeState]);

  // Toggle node selection
  const toggleSelection = useCallback((nodeId: string, multiSelect = false) => {
    setTreeState(prev => {
      const newSelected = new Set(prev.selectedNodes);
      
      if (multiSelect) {
        if (newSelected.has(nodeId)) {
          newSelected.delete(nodeId);
        } else {
          newSelected.add(nodeId);
        }
      } else {
        newSelected.clear();
        newSelected.add(nodeId);
      }
      
      return {
        ...prev,
        selectedNodes: newSelected,
      };
    });
  }, []);

  // Enhanced create asset with parent validation
  const createAssetWithValidation = useCallback((
    assetData: Parameters<typeof createAsset>[0], 
    parentId?: string
  ) => {
    const ops = operations();
    
    // Validate parent exists
    if (parentId && !assets[parentId]) {
      throw new Error(`Parent asset with ID ${parentId} does not exist`);
    }
    
    return createAsset(assetData, parentId);
  }, [createAsset, assets, operations]);

  // Enhanced reparent with validation
  const reparentAssetWithValidation = useCallback((
    assetId: string, 
    newParentId?: string
  ) => {
    const ops = operations();
    
    // Validate asset exists
    if (!assets[assetId]) {
      throw new Error(`Asset with ID ${assetId} does not exist`);
    }
    
    // Validate move is allowed
    if (!ops.canMove(assetId, newParentId)) {
      throw new Error(`Cannot move asset ${assetId} to ${newParentId || 'root'} - would create circular reference`);
    }
    
    // Validate new parent exists
    if (newParentId && !assets[newParentId]) {
      throw new Error(`Target parent with ID ${newParentId} does not exist`);
    }
    
    reparentAsset(assetId, newParentId);
  }, [reparentAsset, assets, operations]);

  // Enhanced delete with confirmation callback
  const deleteAssetWithConfirmation = useCallback((
    assetId: string,
    onConfirm?: (assetIds: string[]) => void
  ) => {
    const asset = assets[assetId];
    if (!asset) {
      throw new Error(`Asset with ID ${assetId} does not exist`);
    }

    // Collect all assets that will be deleted
    const collectDescendants = (id: string): string[] => {
      const currentAsset = assets[id];
      if (!currentAsset || currentAsset.children.length === 0) return [];
      
      let descendants: string[] = [];
      for (const childId of currentAsset.children) {
        descendants.push(childId);
        descendants = descendants.concat(collectDescendants(childId));
      }
      return descendants;
    };

    const idsToDelete = [assetId, ...collectDescendants(assetId)];
    
    // Call confirmation callback if provided
    if (onConfirm) {
      onConfirm(idsToDelete);
    } else {
      // Delete immediately if no confirmation needed
      deleteAsset(assetId);
    }
  }, [deleteAsset, assets]);

  // Get asset with its full path
  const getAssetPath = useCallback((assetId: string): Asset[] => {
    const path: Asset[] = [];
    let currentId: string | undefined = assetId;
    
    while (currentId && assets[currentId]) {
      path.unshift(assets[currentId]);
      currentId = assets[currentId].parentId;
    }
    
    return path;
  }, [assets]);

  // Search assets recursively
  const searchAssets = useCallback((query: string): Asset[] => {
    const searchTerm = query.toLowerCase();
    const results: Asset[] = [];
    
    const searchRecursive = (assetId: string) => {
      const asset = assets[assetId];
      if (!asset) return;
      
      if (asset.name.toLowerCase().includes(searchTerm)) {
        results.push(asset);
      }
      
      asset.children.forEach(searchRecursive);
    };
    
    // Start search from root assets
    getRootAssets().forEach(asset => searchRecursive(asset.id));
    
    return results;
  }, [assets, getRootAssets]);

  return {
    // Store data
    assets,
    currentActiveId,
    activeAsset: getActiveAsset(),
    
    // Tree data
    treeNodes,
    flattenedTree,
    treeState,
    
    // Operations
    operations,
    
    // Store actions
    createAsset: createAssetWithValidation,
    reparentAsset: reparentAssetWithValidation,
    deleteAsset: deleteAssetWithConfirmation,
    updateAssetPosition,
    updateAssetSize,
    setActiveAsset,
    
    // Tree actions
    toggleExpansion,
    toggleSelection,
    
    // Utilities
    getAssetPath,
    searchAssets,
    getRootAssets,
    getAssetChildren,
    getAssetTree,
  };
};
