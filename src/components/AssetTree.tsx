import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Plus, Trash2, Move } from 'lucide-react';
// Temporary placeholder - useAssetTree hook needs to be implemented
// For now, use a simple in-memory implementation

// Simple in-memory asset tree implementation
const useSimpleAssetTree = () => {
  const [assets] = useState(new Map());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Mock implementation - would be replaced with actual hook
  const getAssetChildren = (assetId: string) => {
    return Array.from(assets.values()).filter(asset => asset.parentId === assetId);
  };

  return {
    assets,
    expandedNodes,
    getAssetChildren,
  };
};
import { AssetContextMenuFixed } from '@/components/AssetContextMenu';
import type { Asset } from '@/types/Asset';

interface AssetTreeItemProps {
  node: AssetNode;
  level: number;
  onMove?: (assetId: string, newParentId?: string) => void;
  onDelete?: (assetId: string) => void;
  onSelect?: (assetId: string) => void;
  selectedId?: string | null;
  onEdit?: (asset: Asset) => void;
  onCreateAsset?: (options: { name: string; parentId?: string }) => void;
}

const AssetTreeItem: React.FC<AssetTreeItemProps> = ({
  node,
  level,
  onMove,
  onDelete,
  onSelect,
  selectedId,
  onEdit,
  onCreateAsset,
}) => {
  const { toggleExpansion, operations } = useAssetTree();
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  const handleToggle = useCallback(() => {
    if (node.children.length > 0) {
      toggleExpansion(node.id);
    }
  }, [node.id, node.children.length, toggleExpansion]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  }, [node.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Only allow dropping if not a descendant
    const ops = operations();
    if (ops.canMove(e.dataTransfer.getData('text/plain'), node.id)) {
      setIsDragOver(true);
    }
  }, [operations]);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== node.id && onMove) {
      onMove(draggedId, node.id);
    }
  }, [onMove]);

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

  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-glass-border/20 transition-colors ${
          isSelected ? 'bg-primary/20 border-l-2 border-primary' : ''
        } ${isDragOver ? 'bg-accent/20' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => onSelect?.(node.id)}
        onContextMenu={handleContextMenu}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          className="p-0.5 hover:bg-glass-border/30 rounded transition-colors"
        >
          {hasChildren ? (
            node.isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )
          ) : (
            <div className="w-3 h-3" />
          )}
        </button>

        {/* Icon */}
        {hasChildren ? (
          <Folder className="w-4 h-4 text-accent" />
        ) : (
          <File className="w-4 h-4 text-muted-foreground" />
        )}

        {/* Name */}
        <span className="flex-1 text-sm truncate">{node.name}</span>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(node.id);
            }}
            className="p-0.5 hover:bg-destructive/20 rounded transition-colors"
          >
            <Trash2 className="w-3 h-3 text-destructive" />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && node.isExpanded && (
        <div>
          {node.children.map((child) => (
            <AssetTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              onMove={onMove}
              onDelete={onDelete}
              onSelect={onSelect}
              selectedId={selectedId}
              onEdit={onEdit}
              onCreateAsset={onCreateAsset}
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
          onCreateChildAsset={onCreateAsset ? (parentId: string) => {
            const name = prompt('Enter child asset name:');
            if (name) {
              onCreateAsset({ name, parentId });
            }
          } : undefined}
        />
      )}
    </div>
  );
};

interface AssetTreeProps {
  onAssetSelect?: (assetId: string) => void;
  selectedAssetId?: string | null;
  onEdit?: (asset: Asset) => void;
  onCreateAsset?: (options: { name: string; parentId?: string }) => void;
}

export const AssetTree: React.FC<AssetTreeProps> = ({
  onAssetSelect,
  selectedAssetId,
  onEdit,
  onCreateAsset,
}) => {
  const { flattenedTree, reparentAsset, deleteAsset } = useAssetTree();
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const handleMove = useCallback((assetId: string, newParentId?: string) => {
    reparentAsset(assetId, newParentId);
  }, [reparentAsset]);

  const handleDelete = useCallback((assetId: string) => {
    deleteAsset(assetId);
  }, [deleteAsset]);

  const handleSelect = useCallback((assetId: string) => {
    onAssetSelect?.(assetId);
  }, [onAssetSelect]);

  const handleCreateChild = useCallback((parentId?: string) => {
    const name = prompt('Enter asset name:');
    if (name && onCreateAsset) {
      onCreateAsset({ name, parentId });
    }
  }, [onCreateAsset]);

  return (
    <div className="glass rounded-lg p-2 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Asset Hierarchy</h3>
        <button
          onClick={() => handleCreateChild()}
          className="p-1 hover:bg-glass-border/30 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {flattenedTree().length === 0 ? (
        <div className="text-center text-muted-foreground py-4">
          <p className="text-sm">No assets yet</p>
          <p className="text-xs">Create your first asset to get started</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {flattenedTree().map((node) => (
            <AssetTreeItem
              key={node.id}
              node={node}
              level={node.level}
              onMove={handleMove}
              onDelete={handleDelete}
              onSelect={handleSelect}
              selectedId={selectedAssetId}
              onEdit={onEdit}
              onCreateAsset={onCreateAsset}
            />
          ))}
        </div>
      )}

      <div className="mt-4 pt-2 border-t border-glass-border/20">
        <p className="text-xs text-muted-foreground">
          Drag and drop to reorganize • Click to select
        </p>
      </div>
    </div>
  );
};
