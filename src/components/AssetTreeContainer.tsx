import { useState, useCallback, useMemo } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { AssetTreeNode } from './AssetTreeNode';
import { useKanvasStore, selectAssetsByParentId } from '@/stores/kanvasStore';
import { useUIStore } from '@/stores/uiStore';
import type { Asset } from '@/types/Asset';

interface AssetTreeContainerProps {
  onAssetSelect?: (assetId: string) => void;
  selectedAssetId?: string | null;
  onEdit?: (asset: Asset) => void;
  className?: string;
}

export const AssetTreeContainer: React.FC<AssetTreeContainerProps> = ({
  onAssetSelect,
  selectedAssetId,
  onEdit,
  className = '',
}) => {
  const { getProjectAssets, updateAsset } = useKanvasStore();
  const { currentProjectId } = useKanvasStore();
  const { selectedAssets, selectAsset, clearSelection } = useUIStore();
  const assets = currentProjectId ? getProjectAssets(currentProjectId) : [];
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Get selected tags for filtering (placeholder - would need tag store integration)
  const selectedTags: any[] = [];
  const hasActiveFilters = selectedTags.length > 0 || searchTerm !== '';

  // Handle asset selection
  const handleAssetSelect = useCallback((assetId: string) => {
    selectAsset(assetId);
    onAssetSelect?.(assetId);
  }, [selectAsset, onAssetSelect]);

  // Handle asset move/reparent
  const handleAssetMove = useCallback((assetId: string, newParentId?: string) => {
    updateAsset(assetId, { parentId: newParentId });
  }, [updateAsset]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    // clearTagSelection(); // Would need tag store integration
  }, []);

  // Build tree structure for rendering
  const buildTreeNodes = useCallback((parentId?: string, level: number = 0): any[] => {
    const children = assets.filter(asset => asset.parentId === parentId);
    
    return children.map(asset => ({
      id: asset.id,
      asset,
      level,
      isExpanded: expandedNodes.has(asset.id),
      hasChildren: assets.some(child => child.parentId === asset.id),
      children: buildTreeNodes(asset.id, level + 1)
    }));
  }, [assets, expandedNodes]);

  // Get root nodes for rendering
  const rootNodes = useMemo(() => {
    return buildTreeNodes(undefined, 0);
  }, [buildTreeNodes]);

  // Check if tree is empty
  const isEmpty = assets.length === 0;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header with search and filters */}
      <div className="p-3 border-b border-glass-border/20 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-glass/50 border border-glass-border/30 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
          />
        </div>

        {/* Filter controls */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
              hasActiveFilters 
                ? 'bg-accent/20 text-accent border border-accent/30' 
                : 'bg-glass/50 text-muted-foreground hover:bg-glass-border/20'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="px-1.5 py-0.5 text-xs bg-accent/30 rounded-full">
                {selectedTags.length + (searchTerm ? 1 : 0)}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Active filters display */}
        {showFilters && hasActiveFilters && (
          <div className="space-y-2">
            {searchTerm && (
              <div className="flex items-center gap-2 px-2 py-1 bg-glass/50 rounded text-sm">
                <Search className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Search:</span>
                <span className="text-foreground">"{searchTerm}"</span>
              </div>
            )}
            
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-1 px-2 py-1 bg-glass/50 rounded text-xs"
                    style={{ borderColor: tag.color, borderWidth: '1px' }}
                  >
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span>{tag.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

        {/* Tree content */}
        <div className="overflow-y-auto" style={{ minHeight: '200px' }}>
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <div className="text-4xl mb-4">📂</div>
              <p className="text-sm font-medium mb-1">No assets yet</p>
              <p className="text-xs text-center opacity-70">
                Create your first asset to see it in the tree
              </p>
            </div>
          ) : rootNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <div className="text-4xl mb-4">🔍</div>
              <p className="text-sm font-medium mb-1">No results found</p>
              <p className="text-xs text-center opacity-70">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {rootNodes.map((node) => (
                <AssetTreeNode
                  key={node.id}
                  asset={node.asset}
                  depth={node.level}
                  searchQuery={searchTerm}
                  onEdit={onEdit}
                  onSelectAndFocus={(asset: Asset) => handleAssetSelect(asset.id)}
                  onCreateChildAsset={() => {}}
                  isDragActive={false}
                  allAssets={assets}
                  expandedNodes={expandedNodes}
                  onToggleExpand={(assetId: string) => {
                    setExpandedNodes(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(assetId)) {
                        newSet.delete(assetId);
                      } else {
                        newSet.add(assetId);
                      }
                      return newSet;
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>

      {/* Footer with info */}
      <div className="p-3 border-t border-glass-border/20">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{assets.length} assets</span>
          <span>Drag to reorder • Click to select</span>
        </div>
      </div>
    </div>
  );
};
