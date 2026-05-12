import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, GripVertical } from 'lucide-react';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useUIStore } from '@/stores/uiStore';
import { AssetContextMenu } from '@/components/AssetContextMenu';
import type { Asset } from '@/types/Asset';
import { cn } from '@/lib/utils';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface AssetTreeNodeProps {
  asset: Asset;
  depth: number;
  searchQuery?: string;
  level?: number;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
  onCreateChildAsset?: (parentId: string) => void;
  isDragActive?: boolean;
  // V2 additions
  allAssets: Asset[];
  expandedNodes: Set<string>;
  onToggleExpand?: (assetId: string) => void;
}

export function AssetTreeNode({ 
  asset, 
  depth, 
  searchQuery = '', 
  level = 0, 
  onEdit, 
  onSelectAndFocus, 
  onCreateChildAsset, 
  isDragActive = false,
  allAssets,
  expandedNodes,
  onToggleExpand
}: AssetTreeNodeProps) {
  const { selectedAssets } = useUIStore();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  
  // Use canonical asset structure
  const hasChildren = allAssets.some(a => a.parentId === asset.id);
  const childAssets = allAssets.filter(a => a.parentId === asset.id);
  const isExpanded = expandedNodes.has(asset.id);
  const title = asset.content.title || 'Untitled';
  const isSelected = selectedAssets.has(asset.id);
  
  // Handle expansion toggle
  const handleToggleExpand = () => {
    onToggleExpand?.(asset.id);
  };

  // Handle selection
  const handleSelect = () => {
    onSelectAndFocus?.(asset);
  };

  // DnD hooks
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id });
  
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: asset.id,
  });
  
  // Combine refs
  const combinedRefs = (node: HTMLElement | null) => {
    setSortableRef(node);
    setDroppableRef(node);
  };
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  const isDropTarget = isOver && !isDragging;
  
  // Filter children based on search query
  const filteredChildren = childAssets.filter(child => 
    child.content.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    child.content.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDoubleClick = () => {
    if (onSelectAndFocus) {
      onSelectAndFocus(asset);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const getIcon = () => {
    if (hasChildren) {
      return isExpanded ? (
        <div className="relative">
          <FolderOpen className="w-4 h-4 text-cyan-400" />
          <div className="absolute inset-0 w-4 h-4 bg-cyan-400/20 rounded-full blur-sm animate-pulse" />
        </div>
      ) : (
        <Folder className="w-4 h-4 text-muted-foreground" />
      );
    }
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div>
      <div
        ref={combinedRefs}
        style={{
          ...style,
          paddingLeft: `${Math.min(depth * 16 + 8, 48)}px`,
        }}
        className={cn(
          "flex items-center gap-1 py-2 px-2 rounded cursor-pointer hover:bg-accent/50 transition-all duration-300",
          isSelected && "border-l-2 border-cyan-400/60 bg-cyan-500/5 text-cyan-300 font-medium",
          isDragActive && !isDragging && "opacity-50",
          isDragging && "opacity-30",
          isDropTarget && "bg-blue-500/20 border-2 border-blue-500/60 shadow-lg shadow-blue-500/20",
        )} 
        onClick={handleSelect}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors" />
        </div>

        {/* Expand/Collapse Icon */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleExpand();
            }}
            className="p-0.5 hover:bg-accent/30 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}

        {/* Asset Icon */}
        <div className="flex-shrink-0">
          {getIcon()}
        </div>

        {/* Asset Title */}
        <span 
          className={cn(
            "flex-1 truncate text-sm",
            isSelected && "font-medium text-cyan-300"
          )}
        >
          {title}
        </span>

        {/* Asset Actions */}
        <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
          {onCreateChildAsset && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateChildAsset(asset.id);
              }}
              className="p-0.5 hover:bg-accent/30 rounded transition-colors"
              title="Create child asset"
            >
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(asset);
              }}
              className="p-0.5 hover:bg-accent/30 rounded transition-colors"
              title="Edit asset"
            >
              <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Render Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {filteredChildren.map((child) => (
            <AssetTreeNode
              key={child.id}
              asset={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              onEdit={onEdit}
              onSelectAndFocus={onSelectAndFocus}
              onCreateChildAsset={onCreateChildAsset}
              isDragActive={isDragActive}
              allAssets={allAssets}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <AssetContextMenu
          asset={asset}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
