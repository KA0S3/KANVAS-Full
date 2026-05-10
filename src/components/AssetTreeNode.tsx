import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Move, Tag as TagIcon } from 'lucide-react';
import { useAssetTree } from '@/hooks/useAssetTree';
import { useTagStore } from '@/stores/tagStore';
import { AssetContextMenu } from '@/components/AssetContextMenu';
import type { AssetNode } from '@/types/asset';
import type { Asset } from '@/types/assetInterfaces';

interface AssetTreeNodeProps {
  node: AssetNode;
  level: number;
  selectedAssetId?: string | null;
  onAssetSelect?: (assetId: string) => void;
  onAssetMove?: (assetId: string, newParentId?: string) => void;
  onEdit?: (asset: Asset) => void;
  onCreateChildAsset?: (parentId: string) => void;
  searchTerm?: string;
  showOnlyFiltered?: boolean;
}

const iconMap = {
  image: '🖼️',
  document: '📄',
  video: '🎬',
  audio: '🎵',
  code: '💻',
  other: '📎',
};

export const AssetTreeNode: React.FC<AssetTreeNodeProps> = ({
  node,
  level,
  selectedAssetId,
  onAssetSelect,
  onAssetMove,
  onEdit,
  onCreateChildAsset,
  searchTerm = '',
  showOnlyFiltered = false,
}) => {
  const { toggleExpansion, operations } = useAssetTree();
  const { getAssetTags, isAssetFiltered } = useTagStore();
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedOverParent, setDraggedOverParent] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // Get tags for this asset
  const assetTags = useMemo(() => getAssetTags(node.id), [node.id, getAssetTags]);

  // Check if this node should be visible based on filtering
  const isVisible = useMemo(() => {
    if (!showOnlyFiltered) return true;
    
    // Show if this asset is filtered
    if (isAssetFiltered(node.id)) return true;
    
    // Show if any descendant is filtered (to maintain tree structure)
    const hasFilteredDescendant = (nodeId: string): boolean => {
      if (isAssetFiltered(nodeId)) return true;
      
      const childNode = node.children.find(child => child.id === nodeId);
      if (!childNode) return false;
      
      return childNode.children.some(grandchild => hasFilteredDescendant(grandchild.id));
    };
    
    return hasFilteredDescendant(node.id);
  }, [showOnlyFiltered, node.id, node.children, isAssetFiltered, operations]);

  // Don't render if not visible
  if (!isVisible) return null;

  // Check if node matches search term
  const matchesSearch = searchTerm === '' || 
    node.name.toLowerCase().includes(searchTerm.toLowerCase());

  // Filter children based on search and visibility
  const visibleChildren = useMemo(() => {
    return node.children.filter(child => {
      if (showOnlyFiltered && !isAssetFiltered(child.id)) {
        // Check if child has filtered descendants
        const hasFilteredDescendants = (assetId: string): boolean => {
          if (isAssetFiltered(assetId)) return true;
          const childAsset = node.children.find(c => c.id === assetId);
          if (!childAsset) return false;
          return childAsset.children.some(grandchild => hasFilteredDescendants(grandchild.id));
        };
        return hasFilteredDescendants(child.id);
      }
      return true;
    });
  }, [node.children, showOnlyFiltered, isAssetFiltered]);

  const hasChildren = visibleChildren.length > 0;
  const isSelected = selectedAssetId === node.id;

  const handleToggle = useCallback(() => {
    if (hasChildren) {
      console.log('Toggling expansion for node:', node.id, 'current state:', node.isExpanded);
      toggleExpansion(node.id);
    }
  }, [node.id, hasChildren, toggleExpansion, node.isExpanded]);

  const handleSelect = useCallback(() => {
    onAssetSelect?.(node.id);
  }, [node.id, onAssetSelect]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
    
    // Add visual feedback
    const target = e.target as HTMLElement;
    target.style.opacity = '0.5';
    
    setTimeout(() => {
      target.style.opacity = '';
    }, 0);
  }, [node.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const draggedId = e.dataTransfer.getData('text/plain');
    
    // Only allow dropping if not a descendant and not self
    if (draggedId && draggedId !== node.id && operations().canMove(draggedId, node.id)) {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
      setDraggedOverParent(node.id);
    }
  }, [node.id, operations]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear drag state if we're actually leaving the node
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
      setDraggedOverParent(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragOver(false);
    setDraggedOverParent(null);
    
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== node.id && onAssetMove) {
      onAssetMove(draggedId, node.id);
    }
  }, [onAssetMove]);

  const handleDragEnd = useCallback(() => {
    setIsDragOver(false);
    setDraggedOverParent(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  // Convert AssetNode to Asset for context menu
  const nodeAsAsset = useCallback((): Asset => {
    return {
      ...node,
      children: node.children.map(child => child.id), // Convert AssetNode[] to string[]
    };
  }, [node]);

  // Auto-expand if this node contains search results
  const shouldAutoExpand = searchTerm && visibleChildren.some(child => 
    child.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-all duration-300 ${
          isSelected 
            ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.4),0_0_40px_rgba(6,182,212,0.2),inset_0_0_10px_rgba(6,182,212,0.3)] relative' 
            : 'hover:bg-purple-400/8'
        } ${isDragOver ? 'bg-purple-400/15 border-l-2 border-purple-300/50' : ''} ${
          !matchesSearch && searchTerm ? 'opacity-50' : ''
        }`}
        style={{ 
          paddingLeft: `${level * 20 + 8}px`,
          ...(isSelected && {
            marginLeft: '4px',
            transform: 'translateX(4px)',
            borderLeft: '3px solid rgb(6 182 212 / 0.6)',
            background: 'linear-gradient(90deg, rgb(6 182 212 / 0.1) 0%, transparent 100%)'
          })
        }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          className="p-0.5 hover:bg-glass-border/30 rounded transition-colors flex-shrink-0"
        >
          {hasChildren ? (
            node.isExpanded || shouldAutoExpand ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )
          ) : (
            <div className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Icon */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            <Folder className="w-4 h-4 text-accent" />
          ) : (
            <div className="w-4 h-4 flex items-center justify-center text-sm">
              {iconMap[node.type] || iconMap.other}
            </div>
          )}
        </div>

        {/* Name */}
        <span className={`flex-1 text-sm truncate ${
          isSelected ? 'font-medium text-cyan-300 text-glow' : 'text-foreground/80'
        }`}>
          {node.name}
        </span>

        {/* Tags */}
        {assetTags.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {assetTags.slice(0, 3).map((tag) => (
              <div
                key={tag.id}
                className="w-2 h-2 rounded-full border border-border/30"
                style={{ backgroundColor: tag.color }}
                title={tag.name}
              />
            ))}
            {assetTags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{assetTags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Drag indicator */}
        <Move className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>

      {/* Children - render recursively */}
      {(hasChildren && (node.isExpanded || shouldAutoExpand)) && (
        <div className="relative">
          {/* Tree line */}
          <div 
            className="absolute left-4 top-0 bottom-0 w-px bg-glass-border/30"
            style={{ left: `${level * 20 + 20}px` }}
          />
          
          {visibleChildren.map((child) => (
            <AssetTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedAssetId={selectedAssetId}
              onAssetSelect={onAssetSelect}
              onAssetMove={onAssetMove}
              onEdit={onEdit}
              onCreateChildAsset={onCreateChildAsset}
              searchTerm={searchTerm}
              showOnlyFiltered={showOnlyFiltered}
            />
          ))}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <AssetContextMenu
          asset={nodeAsAsset()}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onEdit={onEdit}
          onCreateChildAsset={onCreateChildAsset}
        />
      )}
    </div>
  );
};
